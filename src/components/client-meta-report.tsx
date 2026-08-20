import Link from "next/link";
import { AppShell, PageHeader } from "@/components/app-shell";
import { ClientMetaSyncButton } from "@/components/client-meta-sync-button";
import { prisma } from "@/lib/prisma";

type ReportLevel = "CAMPAIGN" | "ADSET" | "AD";

const reportConfig: Record<ReportLevel, { title: string; description: string; singular: string }> = {
  CAMPAIGN: {
    title: "Client campaigns",
    description: "Stored Meta campaign delivery for the selected client account.",
    singular: "Campaign",
  },
  ADSET: {
    title: "Client ad sets",
    description: "Stored Meta ad set delivery for the selected client account.",
    singular: "Ad set",
  },
  AD: {
    title: "Client ads",
    description: "Stored Meta ad delivery for the selected client account.",
    singular: "Ad",
  },
};

type Metric = {
  spendCents: number;
  impressions: number;
  reach: number;
  clicks: number;
  leads: number;
};

type ReportRow = {
  id: string;
  name: string;
  status: string | null;
  parent: string | null;
  detail: string | null;
  metrics: Metric[];
};

function sumMetrics(metrics: Metric[]) {
  return metrics.reduce(
    (total, metric) => ({
      spendCents: total.spendCents + metric.spendCents,
      impressions: total.impressions + metric.impressions,
      reach: total.reach + metric.reach,
      clicks: total.clicks + metric.clicks,
      leads: total.leads + metric.leads,
    }),
    { spendCents: 0, impressions: 0, reach: 0, clicks: 0, leads: 0 },
  );
}

function currency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function number(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function date(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "No dated metrics";
}

export async function ClientMetaReport({
  level,
  requestedClientId,
}: {
  level: ReportLevel;
  requestedClientId?: string | string[];
}) {
  const config = reportConfig[level];
  const clients = await prisma.client.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true },
  });
  const requestedId = typeof requestedClientId === "string" ? requestedClientId : undefined;
  const clientId = clients.some((client) => client.id === requestedId) ? requestedId! : clients[0]?.id;

  if (!clientId) {
    return (
      <AppShell>
        <PageHeader eyebrow="Client ROI" title={config.title} description={config.description} />
        <EmptyState title="No client account is available" copy="Add a client before viewing its isolated Meta delivery data." />
      </AppShell>
    );
  }

  const [client, coverage, rows] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { id: true, name: true } }),
    prisma.clientDailyMetaMetric.aggregate({
      where: { clientId, level },
      _count: { _all: true },
      _min: { date: true },
      _max: { date: true },
      _sum: { spendCents: true },
    }),
    loadRows(clientId, level),
  ]);
  const rowTotals = rows.map((row) => sumMetrics(row.metrics));
  const totals = rowTotals.reduce(
    (total, row) => ({
      spendCents: total.spendCents + row.spendCents,
      impressions: total.impressions + row.impressions,
      reach: total.reach + row.reach,
      clicks: total.clicks + row.clicks,
      leads: total.leads + row.leads,
    }),
    { spendCents: 0, impressions: 0, reach: 0, clicks: 0, leads: 0 },
  );

  return (
    <AppShell>
      <PageHeader
        eyebrow="Client ROI"
        title={config.title}
        description={`${config.description} Agency acquisition records are not included.`}
        actions={<ClientMetaSyncButton clientId={client.id} />}
      />
      <section className="flex flex-wrap items-center gap-2 border-b border-[#272722] bg-[#080808] px-5 py-3 sm:px-8">
        <span className="mr-1 text-xs text-zinc-600">Client:</span>
        {clients.map((item) => (
          <Link
            key={item.id}
            href={`/${level === "CAMPAIGN" ? "campaigns" : level === "ADSET" ? "adsets" : "ads"}?clientId=${item.id}`}
            className={`rounded-md border px-3 py-1.5 text-xs ${item.id === client.id ? "border-[#d4af37]/50 bg-[#d4af37]/10 text-[#e6c45a]" : "bg-[#11110f] text-zinc-400"}`}
          >
            {item.name}
          </Link>
        ))}
        <Link href={`/clients/${client.id}`} className="ml-auto text-xs text-zinc-500 hover:text-zinc-200">Client workspace</Link>
      </section>
      <div className="m-5 space-y-5 sm:m-8">
        <section className="grid gap-3 md:grid-cols-3">
          <CoverageCard label="Stored daily rows" value={number(coverage._count._all)} detail={`${config.singular}-level metrics only`} />
          <CoverageCard label="Metric coverage" value={date(coverage._min.date)} detail={coverage._max.date ? `through ${date(coverage._max.date)}` : "No synced insight dates"} />
          <CoverageCard label="Level spend" value={currency(coverage._sum.spendCents ?? 0)} detail="Summed from stored daily metrics" />
        </section>
        <section className="overflow-hidden rounded-lg border border-[#272722] bg-[#0c0c0b]">
          <div className="border-b border-[#272722] px-4 py-3">
            <h2 className="text-sm font-medium text-zinc-200">{client.name} {config.singular.toLowerCase()} delivery</h2>
            <p className="mt-0.5 text-xs text-zinc-600">All displayed totals are calculated from this client&apos;s synced {config.singular.toLowerCase()}-level rows.</p>
          </div>
          {rows.length === 0 ? (
            <EmptyState title={`No stored ${config.singular.toLowerCase()}s`} copy={`Run a Meta sync for ${client.name} to store ${config.singular.toLowerCase()} hierarchy and daily delivery metrics.`} compact />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-[#10100f] text-[10px] uppercase tracking-wide text-zinc-600">
                  <tr>
                    <th className="min-w-56 px-4 py-3 font-medium">{config.singular}</th>
                    <th className="min-w-40 px-3 py-3 font-medium">Parent</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="numeric px-3 py-3 font-medium">Spend</th>
                    <th className="numeric px-3 py-3 font-medium">Impressions</th>
                    <th className="numeric px-3 py-3 font-medium">Reach</th>
                    <th className="numeric px-3 py-3 font-medium">Clicks</th>
                    <th className="numeric px-4 py-3 font-medium">Leads</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[#272722] bg-[#090909] font-medium text-zinc-300">
                    <td className="px-4 py-3">Total</td><td> </td><td> </td>
                    <MetricCells metrics={totals} />
                  </tr>
                  {rows.map((row, index) => (
                    <tr key={row.id} className="border-b border-[#272722] text-zinc-400 last:border-b-0">
                      <td className="px-4 py-3"><p className="font-medium text-zinc-200">{row.name}</p>{row.detail && <p className="mt-1 text-[11px] text-zinc-600">{row.detail}</p>}</td>
                      <td className="px-3 py-3 text-zinc-500">{row.parent ?? "—"}</td>
                      <td className="px-3 py-3">{row.status ?? "—"}</td>
                      <MetricCells metrics={rowTotals[index]} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function MetricCells({ metrics }: { metrics: Metric }) {
  return <><td className="numeric px-3 py-3">{currency(metrics.spendCents)}</td><td className="numeric px-3 py-3">{number(metrics.impressions)}</td><td className="numeric px-3 py-3">{number(metrics.reach)}</td><td className="numeric px-3 py-3">{number(metrics.clicks)}</td><td className="numeric px-4 py-3">{number(metrics.leads)}</td></>;
}

function CoverageCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-lg border border-[#272722] bg-[#0c0c0b] p-4"><p className="text-xs text-zinc-500">{label}</p><p className="numeric mt-2 text-xl font-semibold text-zinc-200">{value}</p><p className="mt-2 text-[11px] text-zinc-600">{detail}</p></div>;
}

function EmptyState({ title, copy, compact = false }: { title: string; copy: string; compact?: boolean }) {
  return <div className={`grid place-items-center px-6 text-center ${compact ? "min-h-56 py-10" : "m-5 min-h-80 rounded-lg border border-[#272722] bg-[#0c0c0b] py-16 sm:m-8"}`}><div className="max-w-md"><h2 className="text-base font-medium text-zinc-200">{title}</h2><p className="mt-2 text-sm leading-6 text-zinc-500">{copy}</p><Link href="/clients/new" className="mt-5 inline-block text-xs font-medium text-[#d4af37]">Add client →</Link></div></div>;
}

async function loadRows(clientId: string, level: ReportLevel): Promise<ReportRow[]> {
  const metricSelect = { spendCents: true, impressions: true, reach: true, clicks: true, leads: true } as const;
  if (level === "CAMPAIGN") {
    const campaigns = await prisma.clientMetaCampaign.findMany({
      where: { clientId }, orderBy: { name: "asc" },
      select: { id: true, name: true, status: true, objective: true, metrics: { where: { level }, select: metricSelect } },
    });
    return campaigns.map((campaign) => ({ id: campaign.id, name: campaign.name, status: campaign.status, parent: null, detail: campaign.objective, metrics: campaign.metrics }));
  }
  if (level === "ADSET") {
    const adsets = await prisma.clientMetaAdset.findMany({
      where: { clientId }, orderBy: { name: "asc" },
      select: { id: true, name: true, status: true, campaign: { select: { name: true } }, metrics: { where: { level }, select: metricSelect } },
    });
    return adsets.map((adset) => ({ id: adset.id, name: adset.name, status: adset.status, parent: adset.campaign.name, detail: null, metrics: adset.metrics }));
  }
  const ads = await prisma.clientMetaAd.findMany({
    where: { clientId }, orderBy: { name: "asc" },
    select: { id: true, name: true, status: true, adset: { select: { name: true, campaign: { select: { name: true } } } }, metrics: { where: { level }, select: metricSelect } },
  });
  return ads.map((ad) => ({ id: ad.id, name: ad.name, status: ad.status, parent: `${ad.adset.campaign.name} / ${ad.adset.name}`, detail: null, metrics: ad.metrics }));
}
