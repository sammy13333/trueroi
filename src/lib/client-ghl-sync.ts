import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/secrets";

const GHL_API_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const GHL_PAGE_SIZE = 100;

type GhlPipelineStage = { id?: string; name?: string };
type GhlPipeline = { id?: string; name?: string; stages?: GhlPipelineStage[] };
type GhlContact = {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  dateAdded?: string;
  dateUpdated?: string;
  createdAt?: string;
  updatedAt?: string;
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
  attributionSource?: string;
  source?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  attributions?: {
    source?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmContent?: string;
    utmTerm?: string;
  };
};
type GhlOpportunityPage = {
  opportunities?: GhlOpportunity[];
  meta?: { startAfterId?: string | null };
};

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

function attribution(opportunity: GhlOpportunity) {
  const values = opportunity.attributions;
  return {
    attributionSource: asString(opportunity.attributionSource) ?? asString(opportunity.source) ?? asString(values?.source),
    utmSource: asString(opportunity.utmSource) ?? asString(values?.utmSource),
    utmMedium: asString(opportunity.utmMedium) ?? asString(values?.utmMedium),
    utmCampaign: asString(opportunity.utmCampaign) ?? asString(values?.utmCampaign),
    utmContent: asString(opportunity.utmContent) ?? asString(values?.utmContent),
    utmTerm: asString(opportunity.utmTerm) ?? asString(values?.utmTerm),
  };
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

export async function syncClientGhl(clientId: string): Promise<ClientGhlSyncResult | null> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, ghlLocationId: true, ghlPrivateTokenEnc: true },
  });
  if (!client) return null;

  const log = await prisma.clientSyncLog.create({
    data: { clientId, status: "RUNNING", mode: "GHL", message: "Syncing GoHighLevel pipelines, opportunities, and embedded contacts." },
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

    const [pipelinePayload, opportunities] = await Promise.all([
      ghlGet<{ pipelines?: GhlPipeline[] }>("/opportunities/pipelines", token, { locationId: client.ghlLocationId }),
      fetchOpportunities(client.ghlLocationId, token),
    ]);
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

    let storedContacts = 0;
    let storedOpportunities = 0;
    for (const opportunity of opportunities) {
      const ghlId = asString(opportunity.id);
      if (!ghlId) continue;

      const embeddedContact = opportunity.contact;
      const contactGhlId = asString(embeddedContact?.id) ?? asString(opportunity.contactId);
      let contactId: string | null = null;
      if (contactGhlId) {
        const contact = await prisma.clientGhlContact.upsert({
          where: { clientId_ghlId: { clientId, ghlId: contactGhlId } },
          create: {
            clientId,
            ghlId: contactGhlId,
            firstName: embeddedContact?.firstName,
            lastName: embeddedContact?.lastName,
            email: embeddedContact?.email,
            phone: embeddedContact?.phone,
            sourceCreatedAt: parseDate(embeddedContact?.dateAdded ?? embeddedContact?.createdAt),
            sourceUpdatedAt: parseDate(embeddedContact?.dateUpdated ?? embeddedContact?.updatedAt),
          },
          update: {
            firstName: embeddedContact?.firstName,
            lastName: embeddedContact?.lastName,
            email: embeddedContact?.email,
            phone: embeddedContact?.phone,
            sourceCreatedAt: parseDate(embeddedContact?.dateAdded ?? embeddedContact?.createdAt),
            sourceUpdatedAt: parseDate(embeddedContact?.dateUpdated ?? embeddedContact?.updatedAt),
          },
          select: { id: true },
        });
        contactId = contact.id;
        storedContacts += 1;
      }

      const pipeline = opportunity.pipelineId ? pipelineIds.get(opportunity.pipelineId) : undefined;
      const stage = pipeline?.stages.find((item) => item.id === opportunity.pipelineStageId);
      const attributionFields = attribution(opportunity);
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
          sourceCreatedAt: parseDate(opportunity.createdAt),
          sourceUpdatedAt: parseDate(opportunity.updatedAt),
          lastStatusChangeAt: parseDate(opportunity.lastStatusChangeAt),
        },
      });
      storedOpportunities += 1;
    }

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
