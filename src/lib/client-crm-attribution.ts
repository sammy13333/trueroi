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
  const result = value
    ?.normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    // Meta names often use "+", punctuation, and spacing as visual separators
    // while landing-page UTM values preserve the same words without them.
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ");
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
      ? [...new Set(parsed.filter((tag): tag is string => typeof tag === "string").map((tag) => normalized(tag)).filter((tag): tag is string => Boolean(tag)))]
      : [];
  } catch {
    return [];
  }
}

export const GHL_NEW_LEAD_TAG = "new lead";
const GHL_BOOKED_APPOINTMENT_TAGS = new Set(["booked appointment", "appointment booked", "booked estimate"]);

/** Tags are normalized with Unicode case folding and any separator collapsed to a space. */
export function hasGhlContactTag(contact: { tagsJson: string }, tag: string) {
  const expected = normalized(tag);
  return Boolean(expected && parseTags(contact.tagsJson).includes(expected));
}

export function isCrmLeadContact(contact: { tagsJson: string }) {
  return hasGhlContactTag(contact, GHL_NEW_LEAD_TAG);
}

export type CanonicalCrmLeadMetric = {
  contactId: string;
  matchedCampaignId: string | null;
  matchedAdsetId: string | null;
  matchedAdId: string | null;
  booked: boolean;
};

/** Counts canonical contact records once, so parent rollups cannot reintroduce opportunity duplicates. */
export function aggregateCanonicalCrmMetrics(leads: CanonicalCrmLeadMetric[], level: "CAMPAIGN" | "ADSET" | "AD") {
  const counts = new Map<string, { leads: number; booked: number }>();
  const seenContacts = new Set<string>();
  for (const lead of leads) {
    if (seenContacts.has(lead.contactId)) continue;
    seenContacts.add(lead.contactId);
    const id = level === "CAMPAIGN" ? lead.matchedCampaignId : level === "ADSET" ? lead.matchedAdsetId : lead.matchedAdId;
    if (!id) continue;
    const current = counts.get(id) ?? { leads: 0, booked: 0 };
    current.leads += 1;
    if (lead.booked) current.booked += 1;
    counts.set(id, current);
  }
  return counts;
}

/** Booking is determined only from the attributed GHL contact's live exact normalized outcome tags. */
export function isBookedAppointment(contact: { tagsJson: string }) {
  return parseTags(contact.tagsJson).some((tag) => GHL_BOOKED_APPOINTMENT_TAGS.has(tag));
}
