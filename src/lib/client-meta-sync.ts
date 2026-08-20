import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/secrets";
import { rebuildCanonicalCrmLeads } from "@/lib/client-ghl-sync";

const GRAPH_API_VERSION = "v25.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const META_PAGE_SIZE = 100;

type MetaCampaign = {
  id: string;
  name?: string;
  status?: string;
  effective_status?: string;
  objective?: string;
  start_time?: string;
  stop_time?: string;
  created_time?: string;
};

type MetaAdset = {
  id: string;
  campaign_id?: string;
  name?: string;
  status?: string;
  start_time?: string;
  created_time?: string;
};

type MetaAd = {
  id: string;
  adset_id?: string;
  name?: string;
  status?: string;
  created_time?: string;
};

type MetaInsight = {
  date_start?: string;
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  actions?: Array<{ action_type?: string; value?: string }>;
  cost_per_action_type?: Array<{ action_type?: string; value?: string }>;
};

type MetaErrorPayload = {
  error?: { message?: string; type?: string; code?: number };
};

type MetaPage<T> = {
  data?: T[];
  paging?: { next?: string };
} & MetaErrorPayload;

type ProviderFailure = {
  provider: "meta";
  error: string;
  statusCode?: number;
};

export type ClientMetaSyncResult = {
  clientId: string;
  clientName: string;
  status: "COMPLETED" | "FAILED";
  providers: {
    meta:
      | {
          status: "COMPLETED";
          campaigns: number;
          adsets: number;
          ads: number;
          dailyMetrics: number;
          earliestMetricDate: string | null;
          latestMetricDate: string | null;
        }
      | { status: "FAILED"; error: string };
  };
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toInt(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function dollarsToCents(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

const META_LEAD_ACTION_TYPES = new Set(["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead", "omni_lead"]);

function leadActions(actions: MetaInsight["actions"]) {
  return (actions ?? []).flatMap((action) => {
    const actionType = action.action_type;
    const count = toInt(action.value);
    return actionType && META_LEAD_ACTION_TYPES.has(actionType) && count > 0 ? [{ actionType, count }] : [];
  });
}

function leadCount(actions: MetaInsight["actions"]): number {
  return (actions ?? []).reduce((total, action) => {
    const type = action.action_type ?? "";
    return total + (META_LEAD_ACTION_TYPES.has(type) ? toInt(action.value) : 0);
  }, 0);
}

function metaLeadCostCents(insight: MetaInsight): number | null {
  const actions = leadActions(insight.actions);
  const leads = actions.reduce((total, action) => total + action.count, 0);
  if (leads === 0) return null;

  const costPerAction = new Map(
    (insight.cost_per_action_type ?? [])
      .flatMap((cost) => {
        const actionType = cost.action_type;
        const dollars = Number(cost.value);
        return actionType && Number.isFinite(dollars) && dollars >= 0 ? [[actionType, dollars] as const] : [];
      }),
  );
  const spendCents = dollarsToCents(insight.spend);
  return actions.reduce((total, action) => {
    const cost = costPerAction.get(action.actionType);
    return total + (cost === undefined
      ? Math.round((spendCents * action.count) / leads)
      : Math.round(cost * action.count * 100));
  }, 0);
}

function linkClickCount(actions: MetaInsight["actions"]): number {
  return (actions ?? []).reduce(
    (total, action) => total + (action.action_type === "link_click" ? toInt(action.value) : 0),
    0,
  );
}

function metaError(payload: MetaErrorPayload, status: number): ProviderFailure {
  const detail = payload.error;
  const suffix = [detail?.type, detail?.code ? `code ${detail.code}` : undefined].filter(Boolean).join(", ");
  return {
    provider: "meta",
    error: `Meta request failed${suffix ? ` (${suffix})` : ""}: ${detail?.message ?? "Unknown Graph API error."}`,
    statusCode: status,
  };
}

async function metaPage<T>(url: URL, token: string): Promise<MetaPage<T>> {
  url.searchParams.delete("access_token");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const payload: MetaPage<T> = await response.json().catch(() => ({}));
  if (!response.ok) throw metaError(payload, response.status);
  return payload;
}

async function metaCollection<T>(path: string, fields: string, token: string, extra: Record<string, string> = {}): Promise<T[]> {
  let url: URL | undefined = new URL(`${GRAPH_API_BASE}/${path}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("limit", String(META_PAGE_SIZE));
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);

  const records: T[] = [];
  while (url) {
    const page: MetaPage<T> = await metaPage<T>(url, token);
    records.push(...(Array.isArray(page.data) ? page.data : []));
    const next = asString(page.paging?.next);
    url = next ? new URL(next) : undefined;
  }
  return records;
}

async function inBatches<T>(items: T[], callback: (item: T) => Promise<void>, batchSize = 25) {
  for (let start = 0; start < items.length; start += batchSize) {
    await Promise.all(items.slice(start, start + batchSize).map(callback));
  }
}

export async function syncClientMeta(clientId: string): Promise<ClientMetaSyncResult | null> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, metaAdAccountId: true, metaAccessTokenEnc: true },
  });
  if (!client) return null;

  const log = await prisma.clientSyncLog.create({
    data: { clientId: client.id, status: "RUNNING", mode: "META", message: "Syncing Meta hierarchy and daily insights." },
  });

  try {
    if (!client.metaAdAccountId || !client.metaAccessTokenEnc) {
      throw { provider: "meta", error: "Meta ad account ID and encrypted access token are required." } satisfies ProviderFailure;
    }

    let token: string;
    try {
      token = await decryptSecret(client.metaAccessTokenEnc);
    } catch {
      throw { provider: "meta", error: "Saved Meta credential could not be decrypted. Replace the token and try again." } satisfies ProviderFailure;
    }

    const accountId = client.metaAdAccountId.startsWith("act_") ? client.metaAdAccountId : `act_${client.metaAdAccountId}`;
    const [campaigns, adsets, ads] = await Promise.all([
      metaCollection<MetaCampaign>(`${accountId}/campaigns`, "id,name,status,effective_status,objective,start_time,stop_time,created_time", token),
      metaCollection<MetaAdset>(`${accountId}/adsets`, "id,campaign_id,name,status,start_time,created_time", token),
      metaCollection<MetaAd>(`${accountId}/ads`, "id,adset_id,name,status,created_time", token),
    ]);

    const campaignIds = new Map<string, string>();
    await inBatches(campaigns.filter((campaign) => asString(campaign.id)), async (campaign) => {
      const record = await prisma.clientMetaCampaign.upsert({
        where: { clientId_metaId: { clientId, metaId: campaign.id } },
        create: {
          clientId,
          metaId: campaign.id,
          name: campaign.name ?? campaign.id,
          status: campaign.status,
          effectiveStatus: campaign.effective_status,
          objective: campaign.objective,
          startsAt: parseDate(campaign.start_time),
          endsAt: parseDate(campaign.stop_time),
          metaCreatedAt: parseDate(campaign.created_time),
        },
        update: {
          name: campaign.name ?? campaign.id,
          status: campaign.status,
          effectiveStatus: campaign.effective_status,
          objective: campaign.objective,
          startsAt: parseDate(campaign.start_time),
          endsAt: parseDate(campaign.stop_time),
          metaCreatedAt: parseDate(campaign.created_time),
        },
        select: { id: true },
      });
      campaignIds.set(campaign.id, record.id);
    });

    const storedAdsets = adsets.filter((adset) => Boolean(asString(adset.id) && asString(adset.campaign_id) && campaignIds.has(adset.campaign_id!)));
    const adsetIds = new Map<string, string>();
    await inBatches(storedAdsets, async (adset) => {
      const record = await prisma.clientMetaAdset.upsert({
        where: { clientId_metaId: { clientId, metaId: adset.id } },
        create: {
          clientId, metaId: adset.id, campaignId: campaignIds.get(adset.campaign_id!)!, name: adset.name ?? adset.id, status: adset.status,
          startsAt: parseDate(adset.start_time), metaCreatedAt: parseDate(adset.created_time),
        },
        update: {
          campaignId: campaignIds.get(adset.campaign_id!)!, name: adset.name ?? adset.id, status: adset.status,
          startsAt: parseDate(adset.start_time), metaCreatedAt: parseDate(adset.created_time),
        },
        select: { id: true },
      });
      adsetIds.set(adset.id, record.id);
    });

    const storedAds = ads.filter((ad) => Boolean(asString(ad.id) && asString(ad.adset_id) && adsetIds.has(ad.adset_id!)));
    const adIds = new Map<string, string>();
    await inBatches(storedAds, async (ad) => {
      const record = await prisma.clientMetaAd.upsert({
        where: { clientId_metaId: { clientId, metaId: ad.id } },
        create: {
          clientId, metaId: ad.id, adsetId: adsetIds.get(ad.adset_id!)!, name: ad.name ?? ad.id, status: ad.status,
          metaCreatedAt: parseDate(ad.created_time),
        },
        update: {
          adsetId: adsetIds.get(ad.adset_id!)!, name: ad.name ?? ad.id, status: ad.status,
          metaCreatedAt: parseDate(ad.created_time),
        },
        select: { id: true },
      });
      adIds.set(ad.id, record.id);
    });

    const insightFields = "date_start,campaign_id,adset_id,ad_id,spend,impressions,reach,clicks,actions,cost_per_action_type";
    const [campaignInsights, adsetInsights, adInsights] = await Promise.all([
      metaCollection<MetaInsight>(`${accountId}/insights`, insightFields, token, { level: "campaign", time_increment: "1", date_preset: "maximum" }),
      metaCollection<MetaInsight>(`${accountId}/insights`, insightFields, token, { level: "adset", time_increment: "1", date_preset: "maximum" }),
      metaCollection<MetaInsight>(`${accountId}/insights`, insightFields, token, { level: "ad", time_increment: "1", date_preset: "maximum" }),
    ]);

    const metricDates: Date[] = [];
    async function storeMetrics(level: "CAMPAIGN" | "ADSET" | "AD", insights: MetaInsight[]) {
      const validInsights = insights.filter((insight) => {
        const date = parseDate(insight.date_start);
        if (!date) return false;
        if (level === "CAMPAIGN") return Boolean(insight.campaign_id && campaignIds.has(insight.campaign_id));
        if (level === "ADSET") return Boolean(insight.adset_id && adsetIds.has(insight.adset_id));
        return Boolean(insight.ad_id && adIds.has(insight.ad_id));
      });
      await inBatches(validInsights, async (insight) => {
        const date = parseDate(insight.date_start)!;
        const campaignId = insight.campaign_id ? campaignIds.get(insight.campaign_id) ?? null : null;
        const adsetId = insight.adset_id ? adsetIds.get(insight.adset_id) ?? null : null;
        const adId = insight.ad_id ? adIds.get(insight.ad_id) ?? null : null;
        const subjectMetaId = level === "CAMPAIGN" ? insight.campaign_id! : level === "ADSET" ? insight.adset_id! : insight.ad_id!;
        const data = { clientId, date, level, subjectMetaId, campaignId, adsetId, adId, spendCents: dollarsToCents(insight.spend), impressions: toInt(insight.impressions), reach: toInt(insight.reach), clicks: toInt(insight.clicks), linkClicks: linkClickCount(insight.actions), leads: leadCount(insight.actions), metaLeadCostCents: metaLeadCostCents(insight) };
        await prisma.clientDailyMetaMetric.upsert({
          where: { clientId_date_level_subjectMetaId: { clientId, date, level, subjectMetaId } },
          create: data,
          update: data,
        });
        metricDates.push(date);
      });
    }

    await storeMetrics("CAMPAIGN", campaignInsights);
    await storeMetrics("ADSET", adsetInsights);
    await storeMetrics("AD", adInsights);
    // Re-resolve contacts after hierarchy IDs/names change without touching raw CRM data.
    await rebuildCanonicalCrmLeads(clientId);

    const dates = metricDates.map((date) => date.getTime()).sort((a, b) => a - b);
    const result: ClientMetaSyncResult = {
      clientId,
      clientName: client.name,
      status: "COMPLETED",
      providers: {
        meta: {
          status: "COMPLETED",
          campaigns: campaigns.length,
          adsets: storedAdsets.length,
          ads: storedAds.length,
          dailyMetrics: metricDates.length,
          earliestMetricDate: dates.length ? new Date(dates[0]).toISOString().slice(0, 10) : null,
          latestMetricDate: dates.length ? new Date(dates.at(-1)!).toISOString().slice(0, 10) : null,
        },
      },
    };
    await prisma.clientSyncLog.update({
      where: { id: log.id },
      data: {
        status: "COMPLETED",
        message: "Meta hierarchy and daily insights synced.",
        details: JSON.stringify(result.providers),
        latestMetricDate: dates.length ? new Date(dates.at(-1)!) : null,
        completedAt: new Date(),
      },
    });
    return result;
  } catch (caught) {
    const failure = isProviderFailure(caught)
      ? caught
      : { provider: "meta" as const, error: "Meta sync failed while storing data. Try again or verify account permissions." };
    const result: ClientMetaSyncResult = { clientId, clientName: client.name, status: "FAILED", providers: { meta: { status: "FAILED", error: failure.error } } };
    await prisma.clientSyncLog.update({
      where: { id: log.id },
      data: { status: "FAILED", message: failure.error, details: JSON.stringify(result.providers), completedAt: new Date() },
    });
    return result;
  }
}

function isProviderFailure(value: unknown): value is ProviderFailure {
  return typeof value === "object" && value !== null && "provider" in value && "error" in value && (value as ProviderFailure).provider === "meta" && typeof (value as ProviderFailure).error === "string";
}
