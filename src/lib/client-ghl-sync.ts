import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/secrets";
import { isBookedAppointment, isCrmLeadContact, resolveCrmAttribution, type AttributionOpportunity } from "@/lib/client-crm-attribution";

const GHL_API_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const GHL_PAGE_SIZE = 100;

type GhlPipelineStage = { id?: string; name?: string };
type GhlPipeline = { id?: string; name?: string; stages?: GhlPipelineStage[] };
type GhlAttributionSource = {
  source?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  campaignId?: string;
  adsetId?: string;
  adId?: string;
  referrer?: string;
  fbclid?: string;
};
export type GhlContact = {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  dateAdded?: string;
  dateUpdated?: string;
  createdAt?: string;
  updatedAt?: string;
  tags?: unknown;
  customFields?: unknown;
  customField?: unknown;
  customData?: unknown;
  source?: string;
  attributionSource?: string | GhlAttributionSource;
  attributions?: GhlAttributionSource;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  campaignId?: string;
  adsetId?: string;
  adId?: string;
};
type GhlOpportunity = {
  id?: string;
  name?: string;
  status?: string;
  monetaryValue?: number | string;
  pipelineId?: string;
  pipelineStageId?: string;
  contactId?: string;
  contact?: GhlContact;
  createdAt?: string;
  updatedAt?: string;
  lastStatusChangeAt?: string;
  attributionSource?: string | GhlAttributionSource;
  source?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  campaignId?: string;
  adsetId?: string;
  adId?: string;
  tags?: unknown;
  customFields?: unknown;
  customField?: unknown;
  customData?: unknown;
  attributions?: GhlAttributionSource;
};
type GhlOpportunityPage = {
  opportunities?: GhlOpportunity[];
  meta?: { startAfterId?: string | null };
};
type GhlContactPage = {
  contacts?: GhlContact[];
  meta?: {
    startAfterId?: string | null;
    startAfter?: string | number | null;
    nextStartAfterId?: string | null;
    nextPageUrl?: string | null;
  };
};
type GhlContactResponse = GhlContact | { contact?: GhlContact };

class GhlFailure extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
  }
}

export type ClientGhlSyncResult = {
  clientId: string;
  clientName: string;
  status: "COMPLETED" | "FAILED";
  providers: {
    ghl:
      | { status: "COMPLETED"; pipelines: number; opportunities: number; contacts: number }
      | { status: "FAILED"; error: string };
  };
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function cents(value: number | string | undefined): number | null {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

type AttributionField = "attributionSource" | "utmSource" | "utmMedium" | "utmCampaign" | "utmContent" | "utmTerm" | "campaignMetaId" | "adsetMetaId" | "adMetaId";
type AttributionEvidence = { scope: "opportunity" | "contact"; field: AttributionField; source: string; value: string };

const customFieldAliases = new Map<string, AttributionField>([
  ["attribution_source", "attributionSource"], ["source", "attributionSource"],
  ["utm_source", "utmSource"], ["utm_medium", "utmMedium"], ["utm_campaign", "utmCampaign"], ["utm_content", "utmContent"], ["utm_term", "utmTerm"],
  ["campaign_id", "campaignMetaId"], ["meta_campaign_id", "campaignMetaId"], ["facebook_campaign_id", "campaignMetaId"], ["fb_campaign_id", "campaignMetaId"],
  ["adset_id", "adsetMetaId"], ["ad_set_id", "adsetMetaId"], ["meta_adset_id", "adsetMetaId"], ["facebook_adset_id", "adsetMetaId"], ["fb_adset_id", "adsetMetaId"],
  ["ad_id", "adMetaId"], ["meta_ad_id", "adMetaId"], ["facebook_ad_id", "adMetaId"], ["fb_ad_id", "adMetaId"],
]);

function normalizedFieldName(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function safeAttributionValue(value: unknown) {
  const string = typeof value === "string" ? value : typeof value === "number" ? String(value) : undefined;
  return string?.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 512) || undefined;
}

function customFieldEvidence(value: unknown, scope: AttributionEvidence["scope"], source: string): AttributionEvidence[] {
  const evidence: AttributionEvidence[] = [];
  const add = (name: unknown, rawValue: unknown) => {
    if (typeof name !== "string") return;
    const field = customFieldAliases.get(normalizedFieldName(name));
    const storedValue = safeAttributionValue(rawValue);
    if (field && storedValue) evidence.push({ scope, field, source: `${source}.${name}`, value: storedValue });
  };
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!item || typeof item !== "object") continue;
      const field = item as Record<string, unknown>;
      add(field.fieldKey ?? field.fieldName ?? field.name ?? field.key, field.value ?? field.fieldValue ?? field.field_value);
    }
  } else if (value && typeof value === "object") {
    for (const [name, fieldValue] of Object.entries(value as Record<string, unknown>)) add(name, fieldValue);
  }
  return evidence;
}

/** Shared by diagnostics so traces use the same extraction behavior as GHL syncs. */
export function extractAttributionEvidence(record: GhlOpportunity | GhlContact, scope: AttributionEvidence["scope"]): AttributionEvidence[] {
  const evidence: AttributionEvidence[] = [];
  const add = (field: AttributionField, source: string, value: unknown) => {
    const storedValue = safeAttributionValue(value);
    if (storedValue) evidence.push({ scope, field, source, value: storedValue });
  };
  const values = "attributions" in record ? record.attributions : undefined;
  const singular = "attributionSource" in record && record.attributionSource && typeof record.attributionSource === "object"
    ? record.attributionSource : undefined;
  add("attributionSource", `${scope}.attributionSource`, "attributionSource" in record && typeof record.attributionSource === "string" ? record.attributionSource : undefined);
  add("attributionSource", `${scope}.attributionSource.source`, singular?.source);
  add("attributionSource", `${scope}.source`, "source" in record ? record.source : undefined);
  add("attributionSource", `${scope}.attributions.source`, values?.source);
  add("utmSource", `${scope}.utmSource`, "utmSource" in record ? record.utmSource : undefined);
  add("utmSource", `${scope}.attributions.utmSource`, values?.utmSource);
  add("utmSource", `${scope}.attributionSource.utmSource`, singular?.utmSource);
  add("utmMedium", `${scope}.utmMedium`, "utmMedium" in record ? record.utmMedium : undefined);
  add("utmMedium", `${scope}.attributions.utmMedium`, values?.utmMedium);
  add("utmMedium", `${scope}.attributionSource.utmMedium`, singular?.utmMedium);
  add("utmCampaign", `${scope}.utmCampaign`, "utmCampaign" in record ? record.utmCampaign : undefined);
  add("utmCampaign", `${scope}.attributions.utmCampaign`, values?.utmCampaign);
  add("utmCampaign", `${scope}.attributionSource.utmCampaign`, singular?.utmCampaign);
  add("utmContent", `${scope}.utmContent`, "utmContent" in record ? record.utmContent : undefined);
  add("utmContent", `${scope}.attributions.utmContent`, values?.utmContent);
  add("utmContent", `${scope}.attributionSource.utmContent`, singular?.utmContent);
  add("utmTerm", `${scope}.utmTerm`, "utmTerm" in record ? record.utmTerm : undefined);
  add("utmTerm", `${scope}.attributions.utmTerm`, values?.utmTerm);
  add("utmTerm", `${scope}.attributionSource.utmTerm`, singular?.utmTerm);
  add("campaignMetaId", `${scope}.campaignId`, "campaignId" in record ? record.campaignId : undefined);
  add("campaignMetaId", `${scope}.attributions.campaignId`, values?.campaignId);
  add("campaignMetaId", `${scope}.attributionSource.campaignId`, singular?.campaignId);
  add("adsetMetaId", `${scope}.adsetId`, "adsetId" in record ? record.adsetId : undefined);
  add("adsetMetaId", `${scope}.attributions.adsetId`, values?.adsetId);
  add("adsetMetaId", `${scope}.attributionSource.adsetId`, singular?.adsetId);
  add("adMetaId", `${scope}.adId`, "adId" in record ? record.adId : undefined);
  add("adMetaId", `${scope}.attributions.adId`, values?.adId);
  add("adMetaId", `${scope}.attributionSource.adId`, singular?.adId);
  evidence.push(
    ...customFieldEvidence(record.customFields, scope, `${scope}.customFields`),
    ...customFieldEvidence(record.customField, scope, `${scope}.customField`),
    ...customFieldEvidence(record.customData, scope, `${scope}.customData`),
  );
  return evidence.filter((item, index, items) => items.findIndex((candidate) => candidate.scope === item.scope && candidate.field === item.field && candidate.source === item.source && candidate.value === item.value) === index);
}

function attributionFromEvidence(evidence: AttributionEvidence[]) {
  const first = (field: AttributionField) => evidence.find((item) => item.field === field)?.value;
  const uniqueEvidence = evidence.filter((item, index, items) => items.findIndex((candidate) =>
    candidate.scope === item.scope && candidate.field === item.field && candidate.source === item.source && candidate.value === item.value,
  ) === index);
  return {
    attributionSource: first("attributionSource"), utmSource: first("utmSource"), utmMedium: first("utmMedium"), utmCampaign: first("utmCampaign"),
    utmContent: first("utmContent"), utmTerm: first("utmTerm"), campaignMetaId: first("campaignMetaId"), adsetMetaId: first("adsetMetaId"),
    adMetaId: first("adMetaId"), attributionEvidenceJson: JSON.stringify(uniqueEvidence),
  };
}

function attribution(opportunity: GhlOpportunity, contacts: GhlContact[]) {
  return attributionFromEvidence([
    ...extractAttributionEvidence(opportunity, "opportunity"),
    ...contacts.flatMap((contact) => extractAttributionEvidence(contact, "contact")),
  ]);
}

function tagsJson(value: unknown) {
  if (!Array.isArray(value)) return "[]";
  const tags = value.flatMap((tag) => {
    if (typeof tag === "string") return tag.trim() ? [tag.trim()] : [];
    if (tag && typeof tag === "object" && "name" in tag && typeof tag.name === "string" && tag.name.trim()) return [tag.name.trim()];
    return [];
  });
  return JSON.stringify([...new Set(tags)]);
}

function ghlErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const data = payload as { message?: unknown; error?: unknown; errors?: unknown };
  if (typeof data.message === "string") return data.message;
  if (typeof data.error === "string") return data.error;
  if (Array.isArray(data.errors)) {
    const first = data.errors.find((item): item is { message?: unknown } => typeof item === "object" && item !== null);
    if (typeof first?.message === "string") return first.message;
  }
  return fallback;
}

async function ghlGet<T>(path: string, token: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GHL_API_BASE}${path}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Version: GHL_VERSION },
    cache: "no-store",
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new GhlFailure(
      `GoHighLevel request failed (${response.status}): ${ghlErrorMessage(payload, "The provider did not return an error message.")}`,
      response.status,
    );
  }
  return payload as T;
}

async function fetchOpportunities(locationId: string, token: string): Promise<GhlOpportunity[]> {
  const opportunities: GhlOpportunity[] = [];
  let startAfterId: string | undefined;
  const seenCursors = new Set<string>();

  do {
    const page = await ghlGet<GhlOpportunityPage>("/opportunities/search", token, {
      location_id: locationId,
      limit: String(GHL_PAGE_SIZE),
      ...(startAfterId ? { startAfterId } : {}),
    });
    opportunities.push(...(Array.isArray(page.opportunities) ? page.opportunities : []));
    const next = asString(page.meta?.startAfterId);
    if (!next || seenCursors.has(next)) break;
    seenCursors.add(next);
    startAfterId = next;
  } while (startAfterId);

  return opportunities;
}

function contactPageCursor(meta: GhlContactPage["meta"]) {
  const nextPage = asString(meta?.nextPageUrl);
  const nextPageParams = nextPage ? new URL(nextPage, GHL_API_BASE).searchParams : undefined;
  const startAfterId = nextPageParams?.get("startAfterId")
    ?? asString(meta?.nextStartAfterId)
    ?? asString(meta?.startAfterId);
  const rawStartAfter = nextPageParams?.get("startAfter") ?? meta?.startAfter;
  const startAfter = typeof rawStartAfter === "number"
    ? String(rawStartAfter)
    : asString(rawStartAfter);
  return startAfterId ? { startAfterId, ...(startAfter ? { startAfter } : {}) } : null;
}

/** Fetch every contact in the selected GHL location, following its cursor or next-page URL. */
export async function fetchLocationContacts(locationId: string, token: string): Promise<GhlContact[]> {
  const contacts: GhlContact[] = [];
  let cursor: { startAfterId: string; startAfter?: string } | null = null;
  const seenCursors = new Set<string>();
  do {
    const page = await ghlGet<GhlContactPage>("/contacts/", token, {
      locationId,
      limit: String(GHL_PAGE_SIZE),
      ...(cursor ?? {}),
    });
    const pageContacts = Array.isArray(page.contacts) ? page.contacts : [];
    contacts.push(...pageContacts);
    cursor = asString(page.meta?.nextPageUrl) || pageContacts.length >= GHL_PAGE_SIZE
      ? contactPageCursor(page.meta)
      : null;
    const cursorKey = cursor ? `${cursor.startAfterId}/${cursor.startAfter ?? ""}` : null;
    if (!cursorKey || seenCursors.has(cursorKey)) break;
    seenCursors.add(cursorKey);
  } while (cursor);
  return contacts;
}

function contactFromResponse(payload: GhlContactResponse): GhlContact | undefined {
  return "contact" in payload ? payload.contact : payload as GhlContact;
}

async function fetchOpportunityContacts(opportunities: GhlOpportunity[], token: string) {
  const contactIds = [...new Set(opportunities.flatMap((opportunity) => {
    const id = asString(opportunity.contact?.id) ?? asString(opportunity.contactId);
    return id ? [id] : [];
  }))];
  const contacts = new Map<string, GhlContact>();
  for (let start = 0; start < contactIds.length; start += 10) {
    const batch = await Promise.all(contactIds.slice(start, start + 10).map(async (contactId) => {
      try {
        const payload = await ghlGet<GhlContactResponse>(`/contacts/${contactId}`, token, {});
        const contact = contactFromResponse(payload);
        return contact && asString(contact.id) ? contact : null;
      } catch {
        return null;
      }
    }));
    for (const contact of batch) if (contact?.id) contacts.set(contact.id, contact);
  }
  return contacts;
}

function firstString(records: GhlContact[], field: keyof GhlContact) {
  for (const record of records) {
    const value = asString(record[field]);
    if (value) return value;
  }
  return undefined;
}

function mergedTags(records: GhlContact[]) {
  const tags = records.flatMap((record) => {
    const raw = record.tags;
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((tag) => typeof tag === "string"
      ? (tag.trim() ? [tag.trim()] : [])
      : tag && typeof tag === "object" && "name" in tag && typeof tag.name === "string" && tag.name.trim()
        ? [tag.name.trim()]
        : []);
  });
  return [...new Set(tags)];
}

/** Combines list, embedded, and detail representations without dropping contact tags or evidence. */
export function mergeGhlContacts(records: GhlContact[], fallbackId?: string): GhlContact | undefined {
  const id = firstString(records, "id") ?? fallbackId;
  if (!id) return undefined;
  return {
    id,
    firstName: firstString(records, "firstName"),
    lastName: firstString(records, "lastName"),
    email: firstString(records, "email"),
    phone: firstString(records, "phone"),
    dateAdded: firstString(records, "dateAdded"),
    dateUpdated: firstString(records, "dateUpdated"),
    createdAt: firstString(records, "createdAt"),
    updatedAt: firstString(records, "updatedAt"),
    tags: mergedTags(records),
  };
}

export async function rebuildCanonicalCrmLeads(clientId: string) {
  const [campaigns, adsets, ads, contacts] = await Promise.all([
    prisma.clientMetaCampaign.findMany({ where: { clientId }, select: { id: true, metaId: true, name: true } }),
    prisma.clientMetaAdset.findMany({ where: { clientId }, select: { id: true, metaId: true, name: true, campaignId: true } }),
    prisma.clientMetaAd.findMany({ where: { clientId }, select: { id: true, metaId: true, name: true, adsetId: true } }),
    prisma.clientGhlContact.findMany({
      where: { clientId },
      select: {
        id: true, ghlId: true, sourceCreatedAt: true, sourceUpdatedAt: true, attributionSource: true, utmSource: true, utmMedium: true, utmCampaign: true, utmContent: true, utmTerm: true,
        campaignMetaId: true, adsetMetaId: true, adMetaId: true, attributionEvidenceJson: true,
        opportunities: {
          orderBy: [{ sourceCreatedAt: "asc" }, { createdAt: "asc" }],
          select: {
            ghlId: true, sourceCreatedAt: true, sourceUpdatedAt: true, lastStatusChangeAt: true, pipelineStageGhlId: true, pipelineStageName: true,
            attributionSource: true, utmSource: true, utmMedium: true, utmCampaign: true, utmContent: true, utmTerm: true,
            campaignMetaId: true, adsetMetaId: true, adMetaId: true, attributionEvidenceJson: true, tagsJson: true,
            pipeline: { select: { ghlId: true } },
          },
        },
        tagsJson: true,
      },
    }),
  ]);
  const hierarchy = { campaigns, adsets, ads };
  const leadContacts = contacts.filter(isCrmLeadContact);
  if (leadContacts.length) {
    await prisma.clientCrmLead.deleteMany({ where: { clientId, contactId: { notIn: leadContacts.map((contact) => contact.id) } } });
  } else {
    await prisma.clientCrmLead.deleteMany({ where: { clientId } });
  }

  for (const contact of leadContacts) {
    const candidates: Array<AttributionOpportunity & {
      ghlId?: string; pipelineStageGhlId?: string | null; pipelineStageName?: string | null; tagsJson?: string;
      attributionSource?: string | null; utmSource?: string | null;
      pipeline?: { ghlId: string } | null;
    }> = [
      ...contact.opportunities,
      {
        campaignMetaId: contact.campaignMetaId, adsetMetaId: contact.adsetMetaId, adMetaId: contact.adMetaId,
        attributionSource: contact.attributionSource, utmSource: contact.utmSource, utmMedium: contact.utmMedium,
        utmCampaign: contact.utmCampaign, utmContent: contact.utmContent, utmTerm: contact.utmTerm,
        attributionEvidenceJson: contact.attributionEvidenceJson,
      },
    ];
    const resolutions = candidates.map((candidate) => ({ candidate, resolution: resolveCrmAttribution(candidate, hierarchy) }));
    const matched = resolutions.filter((item) => item.resolution.attribution);
    const keys = new Set(matched.map(({ resolution }) => `${resolution.attribution!.campaignId}/${resolution.attribution!.adsetId ?? ""}/${resolution.attribution!.adId ?? ""}`));
    const selected = keys.size <= 1 ? matched[0] ?? resolutions[0] : undefined;
    const raw = selected?.candidate ?? candidates.at(-1)!;
    const resolution = selected?.resolution ?? {
      attribution: null, method: null, evidence: [], unmatchedReason: "Conflicting exact attribution evidence exists across this contact’s opportunities.",
    };
    const booked = isBookedAppointment(contact);
    const bookedAt = booked ? contact.sourceUpdatedAt : null;
    await prisma.clientCrmLead.upsert({
      where: { contactId: contact.id },
      create: {
        clientId, contactId: contact.id, ghlContactId: contact.ghlId, ghlOpportunityId: raw.ghlId,
        pipelineGhlId: raw.pipeline?.ghlId, pipelineStageGhlId: raw.pipelineStageGhlId, pipelineStageName: raw.pipelineStageName,
        attributionSource: raw.attributionSource ?? null,
        utmSource: raw.utmSource ?? null,
        utmMedium: raw.utmMedium, utmCampaign: raw.utmCampaign, utmContent: raw.utmContent, utmTerm: raw.utmTerm,
        campaignMetaId: raw.campaignMetaId, adsetMetaId: raw.adsetMetaId, adMetaId: raw.adMetaId,
        matchedCampaignId: resolution.attribution?.campaignId, matchedAdsetId: resolution.attribution?.adsetId, matchedAdId: resolution.attribution?.adId,
        attributionMethod: resolution.method, unmatchedReason: resolution.unmatchedReason,
        booked, bookedAt,
        leadCreatedAt: contact.sourceCreatedAt ?? contact.opportunities[0]?.sourceCreatedAt ?? null,
        attributionEvidenceJson: JSON.stringify(resolution.evidence),
      },
      update: {
        ghlOpportunityId: raw.ghlId, pipelineGhlId: raw.pipeline?.ghlId, pipelineStageGhlId: raw.pipelineStageGhlId, pipelineStageName: raw.pipelineStageName,
        attributionSource: raw.attributionSource ?? null,
        utmSource: raw.utmSource ?? null,
        utmMedium: raw.utmMedium, utmCampaign: raw.utmCampaign, utmContent: raw.utmContent, utmTerm: raw.utmTerm,
        campaignMetaId: raw.campaignMetaId, adsetMetaId: raw.adsetMetaId, adMetaId: raw.adMetaId,
        matchedCampaignId: resolution.attribution?.campaignId, matchedAdsetId: resolution.attribution?.adsetId, matchedAdId: resolution.attribution?.adId,
        attributionMethod: resolution.method, unmatchedReason: resolution.unmatchedReason,
        booked, bookedAt,
        leadCreatedAt: contact.sourceCreatedAt ?? contact.opportunities[0]?.sourceCreatedAt ?? null,
        attributionEvidenceJson: JSON.stringify(resolution.evidence),
      },
    });
  }
}

export async function syncClientGhl(clientId: string): Promise<ClientGhlSyncResult | null> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, ghlLocationId: true, ghlPrivateTokenEnc: true },
  });
  if (!client) return null;

  const log = await prisma.clientSyncLog.create({
    data: { clientId, status: "RUNNING", mode: "GHL", message: "Syncing GoHighLevel pipelines, opportunities, and all location contacts." },
  });

  try {
    if (!client.ghlLocationId || !client.ghlPrivateTokenEnc) {
      throw new GhlFailure("A GoHighLevel location ID and private integration token are required before syncing CRM leads.", 400);
    }

    let token: string;
    try {
      token = await decryptSecret(client.ghlPrivateTokenEnc);
    } catch {
      throw new GhlFailure("The saved GoHighLevel private integration token could not be decrypted. Replace it and try again.", 422);
    }

    const [pipelinePayload, opportunities, fetchedContacts] = await Promise.all([
      ghlGet<{ pipelines?: GhlPipeline[] }>("/opportunities/pipelines", token, { locationId: client.ghlLocationId }),
      fetchOpportunities(client.ghlLocationId, token),
      fetchLocationContacts(client.ghlLocationId, token),
    ]);
    const detailedContacts = await fetchOpportunityContacts(opportunities, token);
    const pipelines = (Array.isArray(pipelinePayload.pipelines) ? pipelinePayload.pipelines : []).filter(
      (pipeline): pipeline is GhlPipeline & { id: string } => Boolean(asString(pipeline.id)),
    );
    const pipelineIds = new Map<string, { id: string; stages: GhlPipelineStage[] }>();

    for (const pipeline of pipelines) {
      const stages = Array.isArray(pipeline.stages) ? pipeline.stages : [];
      const record = await prisma.clientPipeline.upsert({
        where: { clientId_ghlId: { clientId, ghlId: pipeline.id } },
        create: { clientId, ghlId: pipeline.id, name: pipeline.name ?? pipeline.id, stagesJson: JSON.stringify(stages) },
        update: { name: pipeline.name ?? pipeline.id, stagesJson: JSON.stringify(stages) },
        select: { id: true },
      });
      pipelineIds.set(pipeline.id, { id: record.id, stages });
    }

    const contactSources = new Map<string, GhlContact[]>();
    const addContactSource = (contact: GhlContact | undefined, fallbackId?: string) => {
      const ghlId = asString(contact?.id) ?? fallbackId;
      if (!ghlId || !contact) return;
      const sources = contactSources.get(ghlId) ?? [];
      sources.push(contact);
      contactSources.set(ghlId, sources);
    };
    for (const contact of fetchedContacts) addContactSource(contact);
    for (const opportunity of opportunities) {
      const contactGhlId = asString(opportunity.contact?.id) ?? asString(opportunity.contactId);
      if (!contactGhlId) continue;
      addContactSource(opportunity.contact, contactGhlId);
      addContactSource(detailedContacts.get(contactGhlId), contactGhlId);
    }

    const mergedContacts = new Map<string, { contact: GhlContact; sources: GhlContact[] }>();
    for (const [ghlId, sources] of contactSources) {
      const contact = mergeGhlContacts(sources, ghlId);
      if (contact) mergedContacts.set(ghlId, { contact, sources });
    }

    const localContactIds = new Map<string, string>();
    const upsertContact = async (contactDetails: GhlContact, evidenceSources: GhlContact[], fallbackId?: string) => {
      const ghlId = asString(contactDetails.id) ?? fallbackId;
      if (!ghlId) return null;
      const fields = attributionFromEvidence(evidenceSources.flatMap((source) => extractAttributionEvidence(source, "contact")));
      const contact = await prisma.clientGhlContact.upsert({
        where: { clientId_ghlId: { clientId, ghlId } },
        create: {
          clientId, ghlId, firstName: contactDetails.firstName, lastName: contactDetails.lastName,
          email: contactDetails.email, phone: contactDetails.phone, tagsJson: tagsJson(contactDetails.tags),
          ...fields,
          sourceCreatedAt: parseDate(contactDetails.dateAdded ?? contactDetails.createdAt),
          sourceUpdatedAt: parseDate(contactDetails.dateUpdated ?? contactDetails.updatedAt),
        },
        update: {
          firstName: contactDetails.firstName, lastName: contactDetails.lastName,
          email: contactDetails.email, phone: contactDetails.phone, tagsJson: tagsJson(contactDetails.tags),
          ...fields,
          sourceCreatedAt: parseDate(contactDetails.dateAdded ?? contactDetails.createdAt),
          sourceUpdatedAt: parseDate(contactDetails.dateUpdated ?? contactDetails.updatedAt),
        },
        select: { id: true },
      });
      localContactIds.set(ghlId, contact.id);
      return contact.id;
    };
    for (const [ghlId, { contact, sources }] of mergedContacts) await upsertContact(contact, sources, ghlId);

    const storedContacts = localContactIds.size;
    let storedOpportunities = 0;
    for (const opportunity of opportunities) {
      const ghlId = asString(opportunity.id);
      if (!ghlId) continue;

      const embeddedContact = opportunity.contact;
      const contactGhlId = asString(embeddedContact?.id) ?? asString(opportunity.contactId);
      const merged = contactGhlId ? mergedContacts.get(contactGhlId) : undefined;
      const contactDetails = merged?.contact ?? detailedContacts.get(contactGhlId ?? "") ?? embeddedContact;
      const contactId = contactGhlId
        ? localContactIds.get(contactGhlId)
          ?? (contactDetails ? await upsertContact(contactDetails, merged?.sources ?? [contactDetails], contactGhlId) : null)
        : null;

      const pipeline = opportunity.pipelineId ? pipelineIds.get(opportunity.pipelineId) : undefined;
      const stage = pipeline?.stages.find((item) => item.id === opportunity.pipelineStageId);
      const attributionFields = attribution(opportunity, merged?.sources ?? (contactDetails ? [contactDetails] : []));
      await prisma.clientGhlOpportunity.upsert({
        where: { clientId_ghlId: { clientId, ghlId } },
        create: {
          clientId,
          ghlId,
          contactId,
          pipelineId: pipeline?.id,
          pipelineStageGhlId: opportunity.pipelineStageId,
          pipelineStageName: stage?.name,
          name: opportunity.name,
          status: opportunity.status,
          monetaryValueCents: cents(opportunity.monetaryValue),
          ...attributionFields,
          tagsJson: tagsJson(opportunity.tags),
          sourceCreatedAt: parseDate(opportunity.createdAt),
          sourceUpdatedAt: parseDate(opportunity.updatedAt),
          lastStatusChangeAt: parseDate(opportunity.lastStatusChangeAt),
        },
        update: {
          contactId,
          pipelineId: pipeline?.id,
          pipelineStageGhlId: opportunity.pipelineStageId,
          pipelineStageName: stage?.name,
          name: opportunity.name,
          status: opportunity.status,
          monetaryValueCents: cents(opportunity.monetaryValue),
          ...attributionFields,
          tagsJson: tagsJson(opportunity.tags),
          sourceCreatedAt: parseDate(opportunity.createdAt),
          sourceUpdatedAt: parseDate(opportunity.updatedAt),
          lastStatusChangeAt: parseDate(opportunity.lastStatusChangeAt),
        },
      });
      storedOpportunities += 1;
    }
    await rebuildCanonicalCrmLeads(clientId);

    const result: ClientGhlSyncResult = {
      clientId,
      clientName: client.name,
      status: "COMPLETED",
      providers: { ghl: { status: "COMPLETED", pipelines: pipelines.length, opportunities: storedOpportunities, contacts: storedContacts } },
    };
    await prisma.clientSyncLog.update({
      where: { id: log.id },
      data: { status: "COMPLETED", message: "GoHighLevel CRM leads synced.", details: JSON.stringify(result.providers), completedAt: new Date() },
    });
    return result;
  } catch (caught) {
    const message = caught instanceof GhlFailure
      ? caught.message
      : "GoHighLevel sync failed while storing CRM data. Verify the token scopes, location ID, and database connection.";
    const result: ClientGhlSyncResult = {
      clientId,
      clientName: client.name,
      status: "FAILED",
      providers: { ghl: { status: "FAILED", error: message } },
    };
    await prisma.clientSyncLog.update({
      where: { id: log.id },
      data: { status: "FAILED", message, details: JSON.stringify(result.providers), completedAt: new Date() },
    });
    return result;
  }
}
