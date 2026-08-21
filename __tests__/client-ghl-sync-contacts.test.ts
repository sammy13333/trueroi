import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/secrets", () => ({ decryptSecret: vi.fn() }));

import { fetchLocationContacts, mergeGhlContacts } from "../src/lib/client-ghl-sync";

describe("GHL location contact sync", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("follows the contacts next-page URL and retains contacts without opportunities", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        contacts: [{ id: "contact-without-opportunity", tags: ["new lead"], utmCampaign: "Spring Sale" }],
        meta: { nextPageUrl: "https://services.leadconnectorhq.com/contacts/?locationId=location-1&limit=100&startAfterId=cursor-1&startAfter=1710000000000" },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        contacts: [{ id: "contact-with-opportunity", tags: ["new lead"] }],
        meta: {},
      })));
    vi.stubGlobal("fetch", fetch);

    await expect(fetchLocationContacts("location-1", "token")).resolves.toEqual([
      { id: "contact-without-opportunity", tags: ["new lead"], utmCampaign: "Spring Sale" },
      { id: "contact-with-opportunity", tags: ["new lead"] },
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
    const secondRequest = new URL(String(fetch.mock.calls[1][0]));
    expect(secondRequest.pathname).toBe("/contacts/");
    expect(secondRequest.searchParams.get("locationId")).toBe("location-1");
    expect(secondRequest.searchParams.get("startAfterId")).toBe("cursor-1");
    expect(secondRequest.searchParams.get("startAfter")).toBe("1710000000000");
  });

  it("merges list and opportunity contact shapes without losing tags or contact attribution", () => {
    expect(mergeGhlContacts([
      { id: "contact-1", firstName: "Avery", tags: ["new lead"], utmCampaign: "Spring Sale" },
      { id: "contact-1", email: "avery@example.com", tags: ["booked appointment"], campaignId: "campaign-1" },
    ])).toMatchObject({
      id: "contact-1",
      firstName: "Avery",
      email: "avery@example.com",
      tags: ["new lead", "booked appointment"],
    });
  });
});
