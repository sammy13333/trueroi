type Campaign = { id: string; metaId: string; name: string };
type Adset = { id: string; metaId: string; name: string; campaignId: string };
type Ad = { id: string; metaId: string; name: string; adsetId: string };

export type AttributionOpportunity = {
  campaignMetaId: string | null;
  adsetMetaId: string | null;
  adMetaId: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
};

export type CrmAttribution = {
  campaignId: string;
  adsetId: string | null;
  adId: string | null;
} | null;

function normalized(value: string | null | undefined) {
  const result = value?.trim().toLocaleLowerCase();
  return result || null;
}

function uniqueMatch<T extends { metaId: string; name: string }>(items: T[], values: Array<string | null | undefined>) {
  const candidates = new Set(values.map(normalized).filter((value): value is string => Boolean(value)));
  const matches = items.filter((item) => candidates.has(item.metaId.toLocaleLowerCase()) || candidates.has(item.name.trim().toLocaleLowerCase()));
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Maps an opportunity only when its saved attribution evidence resolves to one
 * unambiguous Meta hierarchy. Conflicting fields deliberately remain unattributed.
 */
export function resolveCrmAttribution(
  opportunity: AttributionOpportunity,
  hierarchy: { campaigns: Campaign[]; adsets: Adset[]; ads: Ad[] },
): CrmAttribution {
  const ad = uniqueMatch(hierarchy.ads, [opportunity.adMetaId, opportunity.utmContent, opportunity.utmTerm]);
  const adset = uniqueMatch(hierarchy.adsets, [opportunity.adsetMetaId, opportunity.utmContent, opportunity.utmTerm]);
  const campaign = uniqueMatch(hierarchy.campaigns, [opportunity.campaignMetaId, opportunity.utmCampaign]);
  const campaignFromAdset = adset && hierarchy.campaigns.find((item) => item.id === adset.campaignId);
  const adsetFromAd = ad && hierarchy.adsets.find((item) => item.id === ad.adsetId);
  const campaignFromAd = adsetFromAd && hierarchy.campaigns.find((item) => item.id === adsetFromAd.campaignId);
  const campaignIds = new Set([campaign?.id, campaignFromAdset?.id, campaignFromAd?.id].filter((id): id is string => Boolean(id)));

  if (campaignIds.size !== 1) return null;
  const campaignId = [...campaignIds][0];
  const resolvedAdset = adset ?? adsetFromAd ?? null;
  return { campaignId, adsetId: resolvedAdset?.id ?? null, adId: ad?.id ?? null };
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
