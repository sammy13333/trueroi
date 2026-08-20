import Link from "next/link";
import { AppShell, PageHeader } from "@/components/app-shell";
import { ClientGhlSyncButton } from "@/components/client-ghl-sync-button";
import { ClientLeadVolumeChart, type LeadVolumePoint } from "@/components/client-lead-volume-chart";
import { ClientMetaSyncButton } from "@/components/client-meta-sync-button";
import { prisma } from "@/lib/prisma";

type Period = "day" | "week" | "month";
type Series = Record<Period, LeadVolumePoint[]>;

function first(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function weekStart(value: Date) {
  const date = startOfUtcDay(value);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date;
}

function monthStart(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function shift(value: Date, period: Period, amount: number) {
  const result = new Date(value);
  if (period === "day") result.setUTCDate(result.getUTCDate() + amount);
  if (period === "week") result.setUTCDate(result.getUTCDate() + amount * 7);
  if (period === "month") result.setUTCMonth(result.getUTCMonth() + amount);
  return result;
}

function periodKey(value: Date, period: Period) {
  if (period === "day") return dateKey(startOfUtcDay(value));
  if (period === "week") return dateKey(weekStart(value));
  return dateKey(monthStart(value));
}

function buildSeries(
  opportunities: Array<{ sourceCreatedAt: Date | null }>,
  metrics: Array<{ date: Date; spendCents: number }>,
): Series {
  const now = startOfUtcDay(new Date());
  const configuration: Record<Period, { start: Date; count: number }> = {
    day: { start: shift(now, "day", -29), count: 30 },
    week: { start: shift(weekStart(now), "week", -11), count: 12 },
    month: { start: shift(monthStart(now), "month", -11), count: 12 },
  };

  return (Object.keys(configuration) as Period[]).reduce((series, period) => {
    const { start, count } = configuration[period];
    const buckets = Array.from({ length: count }, (_, index) => {
      const bucketStart = shift(start, period, index);
      return { key: dateKey(bucketStart), label: dateKey(bucketStart), leads: 0, spendCents: 0, hasMetaMetric: false };
    });
    const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
    for (const opportunity of opportunities) {
      if (!opportunity.sourceCreatedAt) continue;
      const bucket = byKey.get(periodKey(opportunity.sourceCreatedAt, period));
      if (bucket) bucket.leads++;
    }
    for (const metric of metrics) {
      const bucket = byKey.get(periodKey(metric.date, period));
      if (!bucket) continue;
      bucket.spendCents += metric.spendCents;
      bucket.hasMetaMetric = true;
    }
    series[period] = buckets.map((bucket) => ({
      label: bucket.label,
      leads: bucket.leads,
      spendCents: bucket.hasMetaMetric ? bucket.spendCents : null,
      cplCents: bucket.hasMetaMetric && bucket.leads > 0 ? Math.round(bucket.spendCents / bucket.leads) : null,
    }));
    return series;
  }, {} as Series);
}

export async function ClientInsights({ requestedClientId }: { requestedClientId?: string | string[] }) {
  const clients = await prisma.client.findMany({ orderBy: { updatedAt: "desc" }, select: { id: true, name: true } });
  const requestedId = first(requestedClientId);
  const clientId = clients.some((client) => client.id === requestedId) ? requestedId! : clients[0]?.id;

  if (!clientId) {
    return <AppShell><PageHeader eyebrow="Client ROI" title="Client insights" description="CRM lead volume and Meta spend for a selected client." /><EmptyState title="No client account is available" copy="Add a client, then connect GoHighLevel and Meta to see client-specific insights." /></AppShell>;
  }

  const [client, opportunities, metrics, storedOpportunityCount] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { id: true, name: true } }),
    prisma.clientGhlOpportunity.findMany({ where: { clientId, sourceCreatedAt: { not: null } }, select: { sourceCreatedAt: true } }),
    prisma.clientDailyMetaMetric.findMany({ where: { clientId, level: "CAMPAIGN" }, select: { date: true, spendCents: true } }),
    prisma.clientGhlOpportunity.count({ where: { clientId } }),
  ]);
  const series = buildSeries(opportunities, metrics);
  const hasMetaMetrics = metrics.length > 0;

  return (
    <AppShell>
      <PageHeader eyebrow="Client ROI" title="Client insights" description="Source-dated GoHighLevel CRM opportunities and matching campaign-level Meta spend. Meta delivery lead actions are excluded." actions={<div className="flex flex-wrap gap-2"><ClientGhlSyncButton clientId={client.id} /><ClientMetaSyncButton clientId={client.id} /></div>} />
      <section className="flex flex-wrap items-center gap-2 border-b border-[#272722] bg-[#080808] px-5 py-3 sm:px-8">
        <span className="mr-1 text-xs text-zinc-600">Client:</span>
        {clients.map((item) => <Link key={item.id} href={`/insights?clientId=${item.id}`} className={`rounded-md border px-3 py-1.5 text-xs ${item.id === client.id ? "border-[#27b7df]/50 bg-[#27b7df]/10 text-[#71d8ef]" : "bg-[#0d161e] text-zinc-400"}`}>{item.name}</Link>)}
        <Link href={`/clients/${client.id}`} className="ml-auto text-xs text-zinc-500 hover:text-zinc-200">Client workspace</Link>
      </section>
      <div className="m-5 space-y-5 sm:m-8">
        {storedOpportunityCount === 0 ? (
          <EmptyState title="No GHL CRM opportunities are stored" copy={`To populate ${client.name} insights, save its GoHighLevel location ID and private integration token, grant it opportunities and contacts read access, then run “Sync GHL CRM leads.”`} compact />
        ) : opportunities.length === 0 ? (
          <EmptyState title="Stored GHL opportunities have no source created date" copy="GoHighLevel must return an opportunity createdAt value before lead volume can be placed in day, week, or month reporting. Run the GHL sync again after verifying the integration can read opportunities." compact />
        ) : (
          <>
            <ClientLeadVolumeChart series={series} />
            <section className={`rounded-lg border p-4 text-xs ${hasMetaMetrics ? "border-[#272722] bg-[#0c0c0b] text-zinc-500" : "border-amber-900/60 bg-amber-950/20 text-amber-200/80"}`}>
              {hasMetaMetrics
                ? "CPL is shown only in periods with both stored CRM leads and campaign-level Meta metrics. It is a blended same-period CRM CPL, not person-level attribution."
                : "CPL is unavailable because no campaign-level Meta spend is stored for this client. Save a Meta ad account ID and access token, then run a Meta sync. Lead bars remain GHL CRM data only."}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

function EmptyState({ title, copy, compact = false }: { title: string; copy: string; compact?: boolean }) {
  return <div className={`grid place-items-center px-6 text-center ${compact ? "min-h-56 rounded-lg border border-[#1d2c37] bg-[#0d161e] py-10" : "m-5 min-h-80 rounded-lg border border-[#1d2c37] bg-[#0d161e] py-16 sm:m-8"}`}><div className="max-w-md"><h2 className="text-base font-medium text-zinc-200">{title}</h2><p className="mt-2 text-sm leading-6 text-zinc-500">{copy}</p><Link href="/clients/new" className="mt-5 inline-block text-xs font-medium text-[#27b7df]">Add client →</Link></div></div>;
}
