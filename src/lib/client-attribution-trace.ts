import { decryptSecret } from "@/lib/secrets";
import { extractAttributionEvidence, type GhlContact } from "@/lib/client-ghl-sync";
import { resolveCrmAttribution, type AttributionOpportunity } from "@/lib/client-crm-attribution";
import { prisma } from "@/lib/prisma";

const GHL_API_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const attributionKey = /(utm|campaign|content|adset|(?:^|_)ad(?:_|$)|source|attribution|facebook|fbclid|landing|referrer)/i;
const piiKey = /(email|phone|first.?name|last.?name|full.?name|address|birth|company)/i;

type GhlCustomField = { id?: unknown; name?: unknown; fieldKey?: unknown; key?: unknown };

function text(value: unknown) {
  if (typeof value === "string" || typeof value === "number") return String(value).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 512) || null;
  return null;
}

function safeValue(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  if (/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/i.test(raw) || /[()+\s.-].*\d[\d\s().-]{6,}\d/.test(raw)) return "[redacted personal data]";
  try {
    const url = new URL(raw);
    const safeQuery = [...url.searchParams.entries()].filter(([key]) => attributionKey.test(key));
    return `${url.origin}${url.pathname}${safeQuery.length ? `?${new URLSearchParams(safeQuery)}` : ""}${url.hash}`;
  } catch {
    return raw;
  }
}

function normalized(value: string | null) {
  return value?.normalize("NFKC").trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ") || null;
}

function selectedRaw(value: unknown, path = "contact"): Array<{ path: string; value: string }> {
  if (Array.isArray(value)) return value.flatMap((item, index) => selectedRaw(item, `${path}[${index}]`));
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const childPath = `${path}.${key}`;
    if (piiKey.test(key)) return [];
    const direct = attributionKey.test(key) ? [safeValue(child)].flatMap((item) => item ? [{ path: childPath, value: item }] : []) : [];
    return [...direct, ...selectedRaw(child, childPath)];
  });
}

function contactTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((tag) => typeof tag === "string" ? [tag] : tag && typeof tag === "object" && typeof (tag as { name?: unknown }).name === "string" ? [(tag as { name: string }).name] : []);
}

function customFieldItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const field = item as Record<string, unknown>;
    const id = text(field.id ?? field.fieldId ?? field.field_id);
    const value = safeValue(field.value ?? field.fieldValue ?? field.field_value);
    return id && value ? [{ index, id, value }] : [];
  });
}

async function customFieldNames(locationId: string, token: string) {
  const response = await fetch(`${GHL_API_BASE}/locations/${encodeURIComponent(locationId)}/customFields`, {
    headers: { Authorization: `Bearer ${token}`, Version: GHL_VERSION },
    cache: "no-store",
  });
  if (!response.ok) return { names: new Map<string, string>(), available: false };
  const payload: unknown = await response.json().catch(() => null);
  const items = payload && typeof payload === "object"
    ? (Array.isArray((payload as { customFields?: unknown }).customFields) ? (payload as { customFields: unknown[] }).customFields : Array.isArray(payload) ? payload : [])
    : [];
  const names = new Map<string, string>();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const field = item as GhlCustomField;
    const id = text(field.id);
    const name = text(field.name ?? field.fieldKey ?? field.key);
    if (id && name) names.set(id, name);
  }
  return { names, available: true };
}

function withResolvedCustomFields(contact: Record<string, unknown>, names: Map<string, string>) {
  const clone = structuredClone(contact);
  for (const key of ["customFields", "customField", "customData"]) {
    if (!Array.isArray(clone[key])) continue;
    clone[key] = clone[key].map((item) => {
      if (!item || typeof item !== "object") return item;
      const field = item as Record<string, unknown>;
      const id = text(field.id ?? field.fieldId ?? field.field_id);
      const name = id ? names.get(id) : undefined;
      return name ? { ...field, fieldName: name } : field;
    });
  }
  return clone;
}

function reportRange() {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const gte = new Date(today);
  gte.setUTCDate(gte.getUTCDate() - 29);
  const lt = new Date(today);
  lt.setUTCDate(lt.getUTCDate() + 1);
  return { gte, lt, start: gte.toISOString().slice(0, 10), end: today.toISOString().slice(0, 10) };
}

function safeStored(record: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!record) return null;
  const hidden = new Set(["attributionEvidenceJson"]);
  return Object.fromEntries(Object.entries(record).flatMap(([key, value]) => {
    if (hidden.has(key)) return [];
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if (Array.isArray(value)) return [[key, value.map((item) => item && typeof item === "object" ? safeStored(item as Record<string, unknown>) : item)]];
      return [[key, safeStored(value as Record<string, unknown>)]];
    }
    return [[key, typeof value === "string" && attributionKey.test(key) ? safeValue(value) : value]];
  }));
}

export async function buildClientAttributionTrace(clientId: string, ghlContactId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { ghlLocationId: true, ghlPrivateTokenEnc: true },
  });
  if (!client) return { error: "Client not found.", status: 404 } as const;
  if (!client.ghlLocationId || !client.ghlPrivateTokenEnc) return { error: "This client does not have a configured GoHighLevel connection.", status: 422 } as const;

  let token: string;
  try {
    token = await decryptSecret(client.ghlPrivateTokenEnc);
  } catch {
    return { error: "The saved GoHighLevel credential cannot be used. Replace it in the client workspace.", status: 422 } as const;
  }
  const response = await fetch(`${GHL_API_BASE}/contacts/${encodeURIComponent(ghlContactId)}`, {
    headers: { Authorization: `Bearer ${token}`, Version: GHL_VERSION },
    cache: "no-store",
  });
  if (!response.ok) return { error: response.status === 404 ? "GoHighLevel contact not found." : `GoHighLevel contact lookup failed (${response.status}).`, status: response.status === 404 ? 404 : 502 } as const;
  const payload: unknown = await response.json().catch(() => null);
  const raw = payload && typeof payload === "object" && "contact" in payload
    ? (payload as { contact?: unknown }).contact
    : payload;
  if (!raw || typeof raw !== "object") return { error: "GoHighLevel returned an unexpected contact response.", status: 502 } as const;
  const contact = raw as Record<string, unknown>;

  const customItems = ["customFields", "customField", "customData"].flatMap((key) => customFieldItems(contact[key]).map((item) => ({ ...item, container: key })));
  const definitions = customItems.length ? await customFieldNames(client.ghlLocationId, token).catch(() => ({ names: new Map<string, string>(), available: false })) : { names: new Map<string, string>(), available: true };
  const resolved = withResolvedCustomFields(contact, definitions.names);
  const liveEvidence = extractAttributionEvidence(resolved as GhlContact, "contact").map((item) => ({
    source: item.source, extractedField: item.field, rawValue: safeValue(item.value), normalizedValue: normalized(safeValue(item.value)), canonicalField: item.field,
  }));

  const [storedContact, opportunities, canonicalLead, campaigns, adsets, ads] = await Promise.all([
    prisma.clientGhlContact.findUnique({ where: { clientId_ghlId: { clientId, ghlId: ghlContactId } }, select: { id: true, ghlId: true, tagsJson: true, attributionSource: true, utmSource: true, utmMedium: true, utmCampaign: true, utmContent: true, utmTerm: true, campaignMetaId: true, adsetMetaId: true, adMetaId: true, attributionEvidenceJson: true } }),
    prisma.clientGhlOpportunity.findMany({ where: { clientId, contact: { is: { ghlId: ghlContactId } } }, select: { ghlId: true, tagsJson: true, attributionSource: true, utmSource: true, utmMedium: true, utmCampaign: true, utmContent: true, utmTerm: true, campaignMetaId: true, adsetMetaId: true, adMetaId: true, attributionEvidenceJson: true, pipeline: { select: { ghlId: true, name: true } } } }),
    prisma.clientCrmLead.findFirst({ where: { clientId, ghlContactId }, select: { id: true, ghlContactId: true, ghlOpportunityId: true, attributionSource: true, utmSource: true, utmMedium: true, utmCampaign: true, utmContent: true, utmTerm: true, campaignMetaId: true, adsetMetaId: true, adMetaId: true, matchedCampaignId: true, matchedAdsetId: true, matchedAdId: true, attributionMethod: true, unmatchedReason: true, pipelineGhlId: true, pipelineStageGhlId: true, pipelineStageName: true, booked: true, leadCreatedAt: true } }),
    prisma.clientMetaCampaign.findMany({ where: { clientId }, select: { id: true, metaId: true, name: true } }),
    prisma.clientMetaAdset.findMany({ where: { clientId }, select: { id: true, metaId: true, name: true, campaignId: true } }),
    prisma.clientMetaAd.findMany({ where: { clientId }, select: { id: true, metaId: true, name: true, adsetId: true } }),
  ]);
  const candidate = opportunities[0] ?? storedContact;
  const resolution = candidate ? resolveCrmAttribution(candidate as AttributionOpportunity, { campaigns, adsets, ads }) : null;
  const values = candidate ? [
    ["campaignMetaId", candidate.campaignMetaId], ["adsetMetaId", candidate.adsetMetaId], ["adMetaId", candidate.adMetaId],
    ["utmCampaign", candidate.utmCampaign], ["utmContent", candidate.utmContent], ["utmMedium", candidate.utmMedium],
  ].flatMap(([field, value]) => typeof value === "string" ? [{ field, original: safeValue(value), normalized: normalized(safeValue(value)), exactMatches: field === "campaignMetaId" ? campaigns.filter((item) => item.metaId === value).map((item) => item.name) : field === "adsetMetaId" ? adsets.filter((item) => item.metaId === value).map((item) => item.name) : field === "adMetaId" ? ads.filter((item) => item.metaId === value).map((item) => item.name) : field === "utmCampaign" || field === "utmMedium" ? campaigns.filter((item) => normalized(item.name) === normalized(value)).map((item) => item.name) : ads.filter((item) => normalized(item.name) === normalized(value)).map((item) => item.name) }] : []) : [];
  const range = reportRange();
  const dateQualifies = Boolean(canonicalLead?.leadCreatedAt && canonicalLead.leadCreatedAt >= range.gte && canonicalLead.leadCreatedAt < range.lt);
  const counted = Boolean(dateQualifies && canonicalLead?.matchedCampaignId);
  const rootCause = !canonicalLead ? { code: "NO_STORED_CANONICAL_LEAD", evidence: "No canonical ClientCrmLead exists for this GHL contact; canonical leads require the live contact tag “new lead”." }
    : canonicalLead.unmatchedReason ? { code: "UNMATCHED_ATTRIBUTION", evidence: canonicalLead.unmatchedReason }
    : !dateQualifies ? { code: "OUTSIDE_REPORTING_DATE_RANGE", evidence: "The canonical lead-created date is outside the current rolling 30-day report cohort." }
    : !canonicalLead.matchedCampaignId ? { code: "NO_CAMPAIGN_ROLLUP", evidence: "The canonical lead has no matched campaign ID." }
    : { code: "COUNTED", evidence: "The canonical lead has a matched campaign and qualifies for the current reporting cohort." };

  return {
    status: 200,
    trace: {
      contactId: ghlContactId,
      liveAttributionRaw: selectedRaw(contact),
      liveContactTags: contactTags(contact.tags),
      customFields: customItems.map((item) => ({ id: item.id, name: definitions.names.get(item.id) ?? null, value: item.value, resolved: definitions.names.has(item.id) })),
      customFieldDefinitionStatus: definitions.available ? "Resolved where GoHighLevel returned a definition; IDs without names are not exposed as inferred names." : "GoHighLevel custom-field definitions could not be read; IDs remain unresolved.",
      extraction: liveEvidence,
      stored: {
        contact: safeStored(storedContact),
        opportunities: opportunities.map((opportunity) => safeStored(opportunity)),
        canonicalLead: safeStored(canonicalLead),
      },
      metaCandidates: { values, resolution, matchedHierarchy: canonicalLead ? { campaignId: canonicalLead.matchedCampaignId, adsetId: canonicalLead.matchedAdsetId, adId: canonicalLead.matchedAdId } : null },
      reporting: { range: { start: range.start, end: range.end }, leadCreatedAt: canonicalLead?.leadCreatedAt?.toISOString() ?? null, dateQualifies, countedAtCampaignLevel: counted, parentRollup: canonicalLead ? { campaignId: canonicalLead.matchedCampaignId, adsetId: canonicalLead.matchedAdsetId, adId: canonicalLead.matchedAdId } : null },
      rootCause,
    },
  } as const;
}
