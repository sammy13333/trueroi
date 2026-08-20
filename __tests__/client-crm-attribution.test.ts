import { describe, expect, it } from "vitest";
import { aggregateCanonicalCrmMetrics, isBookedAppointment, resolveCrmAttribution } from "../src/lib/client-crm-attribution";

const hierarchy = {
  campaigns: [{ id: "campaign-local", metaId: "campaign-1", name: "Spring Sale" }],
  adsets: [{ id: "adset-local", metaId: "adset-1", name: "Prospecting", campaignId: "campaign-local" }],
  ads: [{ id: "ad-local", metaId: "ad-1", name: "Video A", adsetId: "adset-local" }],
};

const empty = {
  campaignMetaId: null, adsetMetaId: null, adMetaId: null, utmMedium: null, utmCampaign: null, utmContent: null, utmTerm: null, attributionEvidenceJson: "[]",
};

describe("CRM attribution", () => {
  it("resolves a complete exact Meta hierarchy from persistent IDs", () => {
    const result = resolveCrmAttribution({ ...empty, adMetaId: "ad-1", adsetMetaId: "adset-1", campaignMetaId: "campaign-1" }, hierarchy);
    expect(result.attribution).toEqual({ campaignId: "campaign-local", adsetId: "adset-local", adId: "ad-local" });
  });

  it("uses an exact normalized UTM ad name and its synced parents", () => {
    const result = resolveCrmAttribution({ ...empty, utmContent: "  video a  " }, hierarchy);
    expect(result.attribution).toEqual({ campaignId: "campaign-local", adsetId: "adset-local", adId: "ad-local" });
    expect(result.method).toContain("utm_content");
  });

  it("leaves missing and ambiguous evidence unmatched", () => {
    expect(resolveCrmAttribution(empty, hierarchy).unmatchedReason).toContain("No saved Meta ID");
    const ambiguous = resolveCrmAttribution(
      { ...empty, utmCampaign: "Spring Sale" },
      { ...hierarchy, campaigns: [...hierarchy.campaigns, { id: "campaign-duplicate", metaId: "campaign-2", name: "spring sale" }] },
    );
    expect(ambiguous.attribution).toBeNull();
    expect(ambiguous.unmatchedReason).toContain("more than one");
  });
});

describe("booked and aggregation rules", () => {
  it("honors selected booked stage IDs over fallback tags", () => {
    const mapping = [{ ghlId: "p1", selected: true, bookedStageIdsJson: "[\"stage-booked\"]" }];
    const base = { pipelineStageName: "Booked", pipeline: mapping[0], tagsJson: "[]", contact: { tagsJson: "[]" } };
    expect(isBookedAppointment({ ...base, pipelineStageGhlId: "stage-booked" }, mapping)).toBe(true);
    expect(isBookedAppointment({ ...base, pipelineStageGhlId: "stage-other" }, mapping)).toBe(false);
    expect(isBookedAppointment({ pipelineStageName: "Appointment Booked", tagsJson: "[]", contact: { tagsJson: "[]" } })).toBe(true);
  });

  it("dedupes a contact across opportunities and keeps zero-denominator rows at zero", () => {
    const leads = [
      { contactId: "contact-1", matchedCampaignId: "campaign-local", matchedAdsetId: "adset-local", matchedAdId: "ad-local", booked: true },
      { contactId: "contact-1", matchedCampaignId: "campaign-local", matchedAdsetId: "adset-local", matchedAdId: "ad-local", booked: true },
      { contactId: "contact-2", matchedCampaignId: "campaign-local", matchedAdsetId: null, matchedAdId: null, booked: false },
    ];
    expect(aggregateCanonicalCrmMetrics(leads, "CAMPAIGN").get("campaign-local")).toEqual({ leads: 2, booked: 1 });
    expect(aggregateCanonicalCrmMetrics(leads, "ADSET").get("adset-local")).toEqual({ leads: 1, booked: 1 });
    expect(aggregateCanonicalCrmMetrics(leads, "AD").get("missing")).toBeUndefined();
  });
});
