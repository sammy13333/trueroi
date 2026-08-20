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
  utmMedium: string | null;
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
  const result = value?.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
  return result || null;
}

function savedEvidence(opportunity: AttributionOpportunity): AttributionEvidence[] {
  const raw = parseEvidence(opportunity.attributionEvidenceJson);
  const fields: Array<[string, string | null]> = [
    ["campaignMetaId", opportunity.campaignMetaId],
    ["adsetMetaId", opportunity.adsetMetaId],
    ["adMetaId", opportunity.adMetaId],
    ["utmMedium", opportunity.utmMedium],
    ["utmCampaign", opportunity.utmCampaign],
    ["utmContent", opportunity.utmContent],
    ["utmTerm", opportunity.utmTerm],
  ];
  const legacy = fields.flatMap<AttributionEvidence>(([field, value]) => typeof value === "string" && value.trim()
    ? [{ scope: "opportunity" as const, field, source: `stored.${field}`, value: value.trim() }]
    : []);
  return [...raw, ...legacy].filter((item, index, items) => items.findIndex((candidate) => candidate.field === item.field && candidate.source === item.source && candidate.value === item.value) === index);
}

export function resolveCrmAttribution(
  opportunity: AttributionOpportunity,
  hierarchy: { campaigns: Campaign[]; adsets: Adset[]; ads: Ad[] },
): CrmAttributionResolution {
  const evidence = savedEvidence(opportunity);
  const campaignIdEvidence = evidence.filter((item) => item.field === "campaignMetaId");
  const adsetIdEvidence = evidence.filter((item) => item.field === "adsetMetaId");
  const adIdEvidence = evidence.filter((item) => item.field === "adMetaId");
  const idEvidence = [...campaignIdEvidence, ...adsetIdEvidence, ...adIdEvidence];
  const campaignMatches = hierarchy.campaigns.filter((item) => campaignIdEvidence.some((entry) => entry.value === item.metaId));
  const adsetMatches = hierarchy.adsets.filter((item) => adsetIdEvidence.some((entry) => entry.value === item.metaId));
  const adMatches = hierarchy.ads.filter((item) => adIdEvidence.some((entry) => entry.value === item.metaId));
  const matchedEvidence = idEvidence.filter((item) => [...campaignMatches, ...adsetMatches, ...adMatches].some((record) => record.metaId === item.value));

  if (matchedEvidence.length) {
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

  const matchingCampaignNames = (field: "utmCampaign" | "utmMedium") => {
    const fieldEvidence = evidence.filter((item) => item.field === field);
    const matches = hierarchy.campaigns.filter((campaign) => fieldEvidence.some((entry) => normalized(entry.value) === normalized(campaign.name)));
    return { fieldEvidence, matches };
  };
  const campaignNameMatch = matchingCampaignNames("utmCampaign");
  if (campaignNameMatch.matches.length === 1) {
    return {
      attribution: { campaignId: campaignNameMatch.matches[0].id, adsetId: null, adId: null },
      method: "Exact normalized Meta campaign name match (utm_campaign)",
      evidence: campaignNameMatch.fieldEvidence.filter((item) => normalized(item.value) === normalized(campaignNameMatch.matches[0].name)),
      unmatchedReason: null,
    };
  }
  if (campaignNameMatch.matches.length > 1) {
    return { attribution: null, method: null, evidence: campaignNameMatch.fieldEvidence, unmatchedReason: "The saved utm_campaign value matches more than one Meta campaign name." };
  }

  const adNameEvidence = evidence.filter((item) => item.field === "utmContent");
  const adNameMatches = hierarchy.ads.filter((ad) => adNameEvidence.some((entry) => normalized(entry.value) === normalized(ad.name)));
  if (adNameMatches.length === 1) {
    const ad = adNameMatches[0];
    const adset = hierarchy.adsets.find((item) => item.id === ad.adsetId);
    const campaign = adset && hierarchy.campaigns.find((item) => item.id === adset.campaignId);
    if (!adset || !campaign) {
      return { attribution: null, method: null, evidence: adNameEvidence, unmatchedReason: "The exactly matched Meta ad does not have a complete synced parent campaign hierarchy." };
    }
    return {
      attribution: { campaignId: campaign.id, adsetId: adset.id, adId: ad.id },
      method: "Exact normalized Meta ad name match (utm_content)",
      evidence: adNameEvidence.filter((item) => normalized(item.value) === normalized(ad.name)),
      unmatchedReason: null,
    };
  }
  if (adNameMatches.length > 1) {
    return { attribution: null, method: null, evidence: adNameEvidence, unmatchedReason: "The saved utm_content value matches more than one Meta ad name." };
  }

  const mediumNameMatch = matchingCampaignNames("utmMedium");
  if (mediumNameMatch.matches.length === 1) {
    return {
      attribution: { campaignId: mediumNameMatch.matches[0].id, adsetId: null, adId: null },
      method: "Exact normalized Meta campaign name match (utm_medium)",
      evidence: mediumNameMatch.fieldEvidence.filter((item) => normalized(item.value) === normalized(mediumNameMatch.matches[0].name)),
      unmatchedReason: null,
    };
  }
  if (mediumNameMatch.matches.length > 1) {
    return { attribution: null, method: null, evidence: mediumNameMatch.fieldEvidence, unmatchedReason: "The saved utm_medium value matches more than one Meta campaign name." };
  }

  const candidateEvidence = evidence.filter((item) => ["campaignMetaId", "adsetMetaId", "adMetaId", "utmCampaign", "utmContent", "utmMedium"].includes(item.field));
  return {
    attribution: null,
    method: null,
    evidence: candidateEvidence,
    unmatchedReason: idEvidence.length
      ? "Saved Meta ID evidence does not exist in the synced Meta hierarchy, and no exact normalized campaign or ad name matched."
      : "No saved Meta ID, exact normalized campaign name, or exact normalized ad name matched the synced Meta hierarchy.",
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
export type BookingPipeline = { ghlId: string; selected: boolean; bookedStageIdsJson: string };

function bookedStageIds(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string" && id.trim()).map((id) => id.trim()) : []);
  } catch {
    return new Set<string>();
  }
}

/**
 * A configured mapping is authoritative. The conservative conventional stage/tag
 * fallback is used only when the client has not selected any booked stages.
 */
export function isBookedAppointment(
  opportunity: {
    pipelineStageGhlId?: string | null;
    pipelineStageName: string | null;
    pipeline?: { ghlId: string; selected: boolean; bookedStageIdsJson: string } | null;
    tagsJson: string;
    contact: { tagsJson: string } | null;
  },
  configuredPipelines: BookingPipeline[] = [],
) {
  const pipelines = configuredPipelines.length ? configuredPipelines : opportunity.pipeline ? [opportunity.pipeline] : [];
  const configured = pipelines.filter((pipeline) => pipeline.selected && bookedStageIds(pipeline.bookedStageIdsJson).size > 0);
  if (configured.length > 0) {
    const pipeline = opportunity.pipeline ?? configured.find((item) => item.ghlId === opportunity.pipeline?.ghlId);
    return Boolean(
      pipeline?.selected
      && opportunity.pipelineStageGhlId
      && bookedStageIds(pipeline.bookedStageIdsJson).has(opportunity.pipelineStageGhlId),
    );
  }
  const stage = normalized(opportunity.pipelineStageName);
  const stageBooked = stage === "booked" || stage === "appointment booked" || stage === "scheduled";
  const tags = [...parseTags(opportunity.tagsJson), ...parseTags(opportunity.contact?.tagsJson ?? "[]")];
  const tagBooked = tags.some((tag) => tag === "booked" || tag === "appointment booked");
  return stageBooked || tagBooked;
}
