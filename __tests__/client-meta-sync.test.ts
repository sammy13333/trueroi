import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/secrets", () => ({ decryptSecret: vi.fn() }));
vi.mock("@/lib/client-ghl-sync", () => ({ rebuildCanonicalCrmLeads: vi.fn() }));

import { websiteLeadMetrics } from "../src/lib/client-meta-sync";

describe("Meta Website Lead insight parsing", () => {
  it("uses the Pixel Website Lead and its matching Cost per Result, not general lead actions", () => {
    expect(websiteLeadMetrics({
      actions: [
        { action_type: "lead", value: "16" },
        { action_type: "onsite_conversion.lead_grouped", value: "10" },
        { action_type: "omni_lead", value: "12" },
        { action_type: "offsite_conversion.lead", value: "7" },
        { action_type: "offsite_conversion.fb_pixel_lead", value: "8" },
      ],
      cost_per_action_type: [
        { action_type: "lead", value: "20.26" },
        { action_type: "offsite_conversion.lead", value: "50.51" },
        { action_type: "offsite_conversion.fb_pixel_lead", value: "44.20" },
      ],
    })).toEqual({ websiteLeads: 8, websiteLeadCostCents: 35360 });
  });

  it("uses the documented legacy website action only when Pixel Website Leads are absent", () => {
    expect(websiteLeadMetrics({
      actions: [
        { action_type: "lead", value: "16" },
        { action_type: "offsite_conversion.lead", value: "7" },
      ],
      cost_per_action_type: [{ action_type: "offsite_conversion.lead", value: "50.51" }],
    })).toEqual({ websiteLeads: 7, websiteLeadCostCents: 35357 });
  });

  it("does not invent a cost from spend or accept instant-form lead actions", () => {
    expect(websiteLeadMetrics({
      actions: [
        { action_type: "lead", value: "16" },
        { action_type: "onsite_conversion.lead_grouped", value: "10" },
        { action_type: "omni_lead", value: "12" },
      ],
      cost_per_action_type: [{ action_type: "lead", value: "20.26" }],
    })).toEqual({ websiteLeads: 0, websiteLeadCostCents: null });

    expect(websiteLeadMetrics({
      actions: [{ action_type: "offsite_conversion.fb_pixel_lead", value: "8" }],
      cost_per_action_type: [],
    })).toEqual({ websiteLeads: 8, websiteLeadCostCents: null });
  });
});
