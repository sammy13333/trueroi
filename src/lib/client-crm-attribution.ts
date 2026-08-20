type Campaign = { id: string; metaId: string; name: string };
type Adset = { id: string; metaId: string; name: string; campaignId: string };
type Ad = { id: string; metaId: string; name: string; adsetId: string };

export type AttributionEvidence = {
  scope: "opportunity" | "contact";
  field: string;
  source: string;
  value: string;
};

export type AttributionOpportunity = {
  campaignMetaId: string | null;
  adsetMetaId: string | null;
  adMetaId: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  attributionEvidenceJson: string;
};

type CrmAttribution = {
  campaignId: string;
  adsetId: string | null;
  adId: string | null;
};

export type CrmAttributionResolution = {
  attribution: CrmAttribution | null;
  method: string | null;
  evidence: AttributionEvidence[];
  unmatchedReason: string | null;
};

function parseEvidence(value: string): AttributionEvidence[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      return (record.scope === "opportunity" || record.scope === "contact")
        && typeof record.field === "string"
        && typeof record.source === "string"
        && typeof record.value === "string"
        ? [{ scope: record.scope, field: record.field, source: record.source, value: record.value }]
        : [];
    });
  } catch {
    return [];
  }
}

function normalized(value: string | null | undefined) {
  const result = value?.trim().toLocaleLowerCase();
  return result || null;
}

function savedEvidence(opportunity: AttributionOpportunity): AttributionEvidence[] {
  const raw = parseEvidence(opportunity.attributionEvidenceJson);
  const fields: Array<[string, string | null]> = [
    ["campaignMetaId", opportunity.campaignMetaId],
    ["adsetMetaId", opportunity.adsetMetaId],
    ["adMetaId", opportunity.adMetaId],
    ["utmCampaign", opportunity.utmCampaign],
    ["utmContent", opportunity.utmContent],
    ["utmTerm", opportunity.utmTerm],
  ];
  const legacy = fields.flatMap<AttributionEvidence>(([field, value]) => typeof value === "string" && value.trim()
    ? [{ scope: "opportunity" as const, field, source: `stored.${field}`, value: value.trim() }]
    : []);
  return [...raw, ...legacy].filter((item, index, items) => items.findIndex((candidate) => candidate.field === item.field && candidate.source === item.source && candidate.value === item.value) === index);
}

/**
 * Maps an opportunity only from exact saved Meta IDs. Campaign/ad-set/ad names
 * and timestamps are deliberately never used as attribution evidence.
 */
export function resolveCrmAttribution(
  opportunity: AttributionOpportunity,
  hierarchy: { campaigns: Campaign[]; adsets: Adset[]; ads: Ad[] },
): CrmAttributionResolution {
  const evidence = savedEvidence(opportunity);
  const campaignFields = new Set(["campaignMetaId", "utmCampaign", "utmContent", "utmTerm"]);
  const adsetFields = new Set(["adsetMetaId", "utmContent", "utmTerm"]);
  const adFields = new Set(["adMetaId", "utmContent", "utmTerm"]);
  const candidateEvidence = evidence.filter((item) => campaignFields.has(item.field) || adsetFields.has(item.field) || adFields.has(item.field));
  if (!candidateEvidence.length) {
    return { attribution: null, method: null, evidence: [], unmatchedReason: "No saved Meta ID evidence. Names and timestamps are not used for attribution." };
  }

  const campaignMatches = hierarchy.campaigns.filter((item) => candidateEvidence.some((evidence) => campaignFields.has(evidence.field) && evidence.value === item.metaId));
  const adsetMatches = hierarchy.adsets.filter((item) => candidateEvidence.some((evidence) => adsetFields.has(evidence.field) && evidence.value === item.metaId));
  const adMatches = hierarchy.ads.filter((item) => candidateEvidence.some((evidence) => adFields.has(evidence.field) && evidence.value === item.metaId));
  const matchedEvidence = candidateEvidence.filter((item) => [...campaignMatches, ...adsetMatches, ...adMatches].some((record) => record.metaId === item.value));
  if (!matchedEvidence.length) {
    return { attribution: null, method: null, evidence: candidateEvidence, unmatchedReason: "Saved Meta ID evidence does not exist in the synced Meta hierarchy." };
  }
  if (campaignMatches.length > 1 || adsetMatches.length > 1 || adMatches.length > 1) {
    return { attribution: null, method: null, evidence: matchedEvidence, unmatchedReason: "Saved Meta ID evidence identifies more than one record at the same hierarchy level." };
  }

  const campaign = campaignMatches[0];
  const adset = adsetMatches[0];
  const ad = adMatches[0];
  const adsetFromAd = ad ? hierarchy.adsets.find((item) => item.id === ad.adsetId) : undefined;
  const campaignFromAdset = (adset ?? adsetFromAd) ? hierarchy.campaigns.find((item) => item.id === (adset ?? adsetFromAd)!.campaignId) : undefined;
  const campaignIds = new Set([campaign?.id, campaignFromAdset?.id].filter((id): id is string => Boolean(id)));
  if (campaignIds.size !== 1) {
    return { attribution: null, method: null, evidence: matchedEvidence, unmatchedReason: "Saved campaign, ad-set, or ad IDs conflict across Meta hierarchy levels." };
  }
  if (adset && ad && adset.id !== adsetFromAd?.id) {
    return { attribution: null, method: null, evidence: matchedEvidence, unmatchedReason: "Saved ad-set and ad IDs are not in the same Meta hierarchy." };
  }

  const fields = [...new Set(matchedEvidence.map((item) => item.source))];
  return {
    attribution: { campaignId: [...campaignIds][0], adsetId: adset?.id ?? adsetFromAd?.id ?? null, adId: ad?.id ?? null },
    method: `Exact Meta ID match (${fields.join(", ")})`,
    evidence: matchedEvidence,
    unmatchedReason: null,
  };
}

function parseTags(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string").map((tag) => normalized(tag)).filter((tag): tag is string => Boolean(tag))
      : [];
  } catch {
    return [];
  }
}

/**
 * Default booking rule: a stage named "Booked", "Appointment Booked", or
 * "Scheduled" (case-insensitive), or a contact/opportunity tag containing
 * "booked" or "appointment booked". This is intentionally conservative.
 */
export function isBookedAppointment(opportunity: { pipelineStageName: string | null; tagsJson: string; contact: { tagsJson: string } | null }) {
  const stage = normalized(opportunity.pipelineStageName);
  const stageBooked = stage === "booked" || stage === "appointment booked" || stage === "scheduled";
  const tags = [...parseTags(opportunity.tagsJson), ...parseTags(opportunity.contact?.tagsJson ?? "[]")];
  const tagBooked = tags.some((tag) => tag === "booked" || tag === "appointment booked");
  return stageBooked || tagBooked;
}
