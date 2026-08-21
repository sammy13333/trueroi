import Link from "next/link";
import { AppShell, PageHeader } from "@/components/app-shell";
import { ClientSelector, selectedClientId } from "@/components/client-selector";
import { ClientMetaSyncButton } from "@/components/client-meta-sync-button";
import { aggregateCanonicalCrmMetrics } from "@/lib/client-crm-attribution";
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
  linkClicks: number | null;
  leads: number;
  metaLeadCostCents: number | null;
};

type TotalMetric = Omit<Metric, "metaLeadCostCents"> & { metaLeadCostCents: number };

type ReportRow = {
  id: string;
  name: string;
  status: string | null;
  parent: string | null;
  detail: string | null;
  metaTimestamp: Date | null;
  metrics: Metric[];
  crm: CrmMetrics;
};

type CrmMetrics = { leads: number; booked: number };

type DateRange = {
  preset: "today" | "last-7" | "last-30" | "custom";
  start: string;
  end: string;
  gte: Date;
  lt: Date;
};

type ReportSearchParams = {
  clientId?: string | string[];
  campaignId?: string | string[];
  adsetId?: string | string[];
  sort?: string | string[];
  direction?: string | string[];
  preset?: string | string[];
  startDate?: string | string[];
  endDate?: string | string[];
};

type SortKey = "spend" | "impressions" | "reach" | "clicks" | "linkClicks" | "metaLeads" | "metaCpl" | "ctr" | "linkCtr" | "cpc" | "costPerLinkClick" | "status";

const sortableColumns: Array<{ key: SortKey; label: string }> = [
  { key: "status", label: "Status" },
  { key: "spend", label: "Spend" },
  { key: "metaLeads", label: "Meta lead actions" },
  { key: "metaCpl", label: "Meta CPL" },
  { key: "impressions", label: "Impressions" },
  { key: "reach", label: "Reach" },
  { key: "clicks", label: "Clicks" },
  { key: "linkClicks", label: "Link clicks" },
  { key: "ctr", label: "CTR" },
  { key: "linkCtr", label: "Link CTR" },
  { key: "cpc", label: "CPC" },
  { key: "costPerLinkClick", label: "Cost per link click" },
];

function first(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

function dateString(value: Date) {
  return value.toISOString().slice(0, 10);
}

function utcDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || dateString(date) !== value ? null : date;
}

function resolveDateRange(searchParams: ReportSearchParams): DateRange {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const requested = first(searchParams.preset);
  const preset = requested === "today" || requested === "last-7" || requested === "custom" ? requested : "last-30";
  const customStart = first(searchParams.startDate);
  const customEnd = first(searchParams.endDate);
  const start = customStart ? utcDate(customStart) : null;
  const end = customEnd ? utcDate(customEnd) : null;
  if (preset === "custom" && start && end && start <= end) {
    const lt = new Date(end);
    lt.setUTCDate(lt.getUTCDate() + 1);
    return { preset, start: customStart!, end: customEnd!, gte: start, lt };
  }
  const days = preset === "today" ? 1 : preset === "last-7" ? 7 : 30;
  const gte = new Date(today);
  gte.setUTCDate(gte.getUTCDate() - (days - 1));
  const lt = new Date(today);
  lt.setUTCDate(lt.getUTCDate() + 1);
  return { preset: preset === "custom" ? "last-30" : preset, start: dateString(gte), end: dateString(today), gte, lt };
}

function sumMetrics(metrics: Metric[]): TotalMetric {
  return metrics.reduce<TotalMetric>(
    (total, metric) => ({
      spendCents: total.spendCents + metric.spendCents,
      impressions: total.impressions + metric.impressions,
      reach: total.reach + metric.reach,
      clicks: total.clicks + metric.clicks,
      linkClicks: total.linkClicks === null || metric.linkClicks === null ? null : total.linkClicks + metric.linkClicks,
      leads: total.leads + metric.leads,
      metaLeadCostCents: total.metaLeadCostCents + (metric.metaLeadCostCents ?? (metric.leads > 0 ? metric.spendCents : 0)),
    }),
    { spendCents: 0, impressions: 0, reach: 0, clicks: 0, linkClicks: 0 as number | null, leads: 0, metaLeadCostCents: 0 },
  );
}

function currency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function number(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function optionalNumber(value: number | null) {
  return value === null ? "—" : number(value);
}

function ctr(metrics: Metric) {
  const value = metricCtr(metrics);
  return value === null ? "—" : `${value.toFixed(2)}%`;
}

function linkCtr(metrics: Metric) {
  const value = metrics.linkClicks === null || metrics.impressions <= 0 ? null : (metrics.linkClicks / metrics.impressions) * 100;
  return value === null ? "—" : `${value.toFixed(2)}%`;
}

function cpc(metrics: Metric) {
  return metrics.clicks > 0 ? currency(metrics.spendCents / metrics.clicks) : "—";
}

function costPerLinkClick(metrics: Metric) {
  return metrics.linkClicks !== null && metrics.linkClicks > 0 ? currency(metrics.spendCents / metrics.linkClicks) : "—";
}

function metricCtr(metrics: Metric) {
  return metrics.impressions > 0 ? (metrics.clicks / metrics.impressions) * 100 : null;
}

function date(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "No dated metrics";
}

export async function ClientMetaReport({
  level,
  requestedClientId,
  searchParams,
}: {
  level: ReportLevel;
  requestedClientId?: string | string[];
  searchParams: ReportSearchParams;
}) {
  const config = reportConfig[level];
  const range = resolveDateRange(searchParams);
  const clients = await prisma.client.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true },
  });
  const clientId = selectedClientId(clients, requestedClientId);

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
      where: { clientId, level, date: { gte: range.gte, lt: range.lt } },
      _count: { _all: true },
      _min: { date: true },
      _max: { date: true },
      _sum: { spendCents: true },
    }),
    loadRows(clientId, level, range, { campaignId: first(searchParams.campaignId), adsetId: first(searchParams.adsetId) }),
  ]);
  const rowTotals = rows.map((row) => sumMetrics(row.metrics));
  const sort = resolveSort(searchParams);
  const sortedRows = rows
    .map((row, index) => ({ row, metrics: rowTotals[index] }))
    .sort((left, right) => compareRows(left.row, left.metrics, right.row, right.metrics, sort));
  const totals = rowTotals.reduce<TotalMetric>(
    (total, row) => ({
      spendCents: total.spendCents + row.spendCents,
      impressions: total.impressions + row.impressions,
      reach: total.reach + row.reach,
      clicks: total.clicks + row.clicks,
      linkClicks: total.linkClicks === null || row.linkClicks === null ? null : total.linkClicks + row.linkClicks,
      leads: total.leads + row.leads,
      metaLeadCostCents: total.metaLeadCostCents + row.metaLeadCostCents,
    }),
    { spendCents: 0, impressions: 0, reach: 0, clicks: 0, linkClicks: 0 as number | null, leads: 0, metaLeadCostCents: 0 },
  );
  const crmTotals = sumCrmMetrics(rows.map((row) => row.crm));
  const path = level === "CAMPAIGN" ? "/campaigns" : level === "ADSET" ? "/adsets" : "/ads";

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
        <ClientSelector clients={clients} clientId={client.id} path={path} searchParams={searchParams} />
        <Link href={`/clients/${client.id}`} className="ml-auto text-xs text-zinc-500 hover:text-zinc-200">Client workspace</Link>
      </section>
      <DateFilters clientId={client.id} path={path} range={range} parentId={level === "ADSET" ? first(searchParams.campaignId) : level === "AD" ? first(searchParams.adsetId) : undefined} parentKey={level === "ADSET" ? "campaignId" : level === "AD" ? "adsetId" : undefined} />
      <div className="m-5 space-y-5 sm:m-8">
        <section className="grid gap-3 md:grid-cols-3">
          <CoverageCard label="Stored daily rows" value={number(coverage._count._all)} detail={`${config.singular}-level rows in selected dates`} />
          <CoverageCard label="Metric coverage" value={date(coverage._min.date)} detail={coverage._max.date ? `through ${date(coverage._max.date)}` : "No synced insight dates"} />
          <CoverageCard label="Level spend" value={currency(coverage._sum.spendCents ?? 0)} detail="Summed from selected delivery dates" />
        </section>
        <section className="overflow-hidden rounded-lg border border-[#272722] bg-[#0c0c0b]">
          <div className="border-b border-[#272722] px-4 py-3">
            <h2 className="text-sm font-medium text-zinc-200">{client.name} CRM outcomes and {config.singular.toLowerCase()} delivery</h2>
            <p className="mt-0.5 text-xs text-zinc-600">{range.start} through {range.end} · CRM Leads are the primary business count: attributed GHL contacts with the exact normalized tag “new lead”, counted once. Booked is updated from that contact’s exact normalized “booked appointment”, “appointment booked”, or “booked estimate” tag. Meta lead actions and Meta CPL remain delivery metrics, not CRM business lead counts.</p>
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
                    <CrmHeaders />
                    {sortableColumns.map((column) => <SortableHeader key={column.key} column={column} path={path} clientId={client.id} range={range} parentId={level === "ADSET" ? first(searchParams.campaignId) : level === "AD" ? first(searchParams.adsetId) : undefined} parentKey={level === "ADSET" ? "campaignId" : level === "AD" ? "adsetId" : undefined} sort={sort} />)}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[#272722] bg-[#090909] font-medium text-zinc-300">
                    <td className="px-4 py-3">Total</td><td> </td>
                    <CrmCells crm={crmTotals} spendCents={totals.spendCents} /><MetricCells metrics={totals} />
                  </tr>
                  {sortedRows.map(({ row, metrics }) => (
                    <tr key={row.id} className="border-b border-[#272722] text-zinc-400 last:border-b-0">
                      <td className="px-4 py-3"><RowName row={row} level={level} clientId={client.id} range={range} />{row.detail && <p className="mt-1 text-[11px] text-zinc-600">{row.detail}</p>}</td>
                      <td className="px-3 py-3 text-zinc-500">{row.parent ?? "—"}</td>
                      <CrmCells crm={row.crm} spendCents={metrics.spendCents} drilldown={{ clientId: client.id, level, id: row.id, range }} />
                      <td className="px-3 py-3"><Status status={row.status} /></td>
                      <MetricCells metrics={metrics} />
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

function metaCpl(metrics: TotalMetric) {
  return metrics.leads > 0 ? currency(metrics.metaLeadCostCents / metrics.leads) : "—";
}

function MetricCells({ metrics }: { metrics: TotalMetric }) {
  return <><td className="numeric px-3 py-3">{currency(metrics.spendCents)}</td><td className="numeric px-3 py-3">{number(metrics.leads)}</td><td className="numeric px-3 py-3">{metaCpl(metrics)}</td><td className="numeric px-3 py-3">{number(metrics.impressions)}</td><td className="numeric px-3 py-3">{number(metrics.reach)}</td><td className="numeric px-3 py-3">{number(metrics.clicks)}</td><td className="numeric px-3 py-3">{optionalNumber(metrics.linkClicks)}</td><td className="numeric px-3 py-3">{ctr(metrics)}</td><td className="numeric px-3 py-3">{linkCtr(metrics)}</td><td className="numeric px-3 py-3">{cpc(metrics)}</td><td className="numeric px-4 py-3">{costPerLinkClick(metrics)}</td></>;
}

function sumCrmMetrics(values: CrmMetrics[]) {
  return values.reduce((total, value) => ({ leads: total.leads + value.leads, booked: total.booked + value.booked }), { leads: 0, booked: 0 });
}

function CrmHeaders() {
  return <><th className="numeric px-3 py-3 font-medium">CRM Leads</th><th className="numeric px-3 py-3 font-medium">Booked</th><th className="numeric px-3 py-3 font-medium">CRM CPL</th><th className="numeric px-4 py-3 font-medium">Cost / Booked</th></>;
}

function CrmCells({ crm, spendCents, drilldown }: { crm: CrmMetrics; spendCents: number; drilldown?: { clientId: string; level: ReportLevel; id: string; range: DateRange } }) {
  const href = (booked: boolean) => drilldown
    ? reportHref("/leads", { clientId: drilldown.clientId, crmLevel: drilldown.level, crmId: drilldown.id, booked: booked ? "true" : undefined, preset: "custom", startDate: drilldown.range.start, endDate: drilldown.range.end })
    : undefined;
  return <><td className="numeric px-3 py-3">{href(false) ? <Link href={href(false)!} className="text-[#71d8ef] hover:underline">{number(crm.leads)}</Link> : number(crm.leads)}</td><td className="numeric px-3 py-3">{href(true) ? <Link href={href(true)!} className="text-[#71d8ef] hover:underline">{number(crm.booked)}</Link> : number(crm.booked)}</td><td className="numeric px-3 py-3">{crm.leads > 0 ? currency(spendCents / crm.leads) : "—"}</td><td className="numeric px-4 py-3">{crm.booked > 0 ? currency(spendCents / crm.booked) : "—"}</td></>;
}

function resolveSort(searchParams: ReportSearchParams): { key: SortKey; direction: "asc" | "desc" } {
  const requestedKey = first(searchParams.sort);
  const key = sortableColumns.some((column) => column.key === requestedKey) ? requestedKey as SortKey : "spend";
  return { key, direction: first(searchParams.direction) === "asc" ? "asc" : "desc" };
}

function sortValue(row: ReportRow, metrics: TotalMetric, key: SortKey): number | string | null {
  switch (key) {
    case "status": return row.status?.trim().toLocaleLowerCase() || null;
    case "spend": return metrics.spendCents;
    case "metaLeads": return metrics.leads;
    case "metaCpl": return metrics.leads > 0 ? metrics.metaLeadCostCents / metrics.leads : null;
    case "impressions": return metrics.impressions;
    case "reach": return metrics.reach;
    case "clicks": return metrics.clicks;
    case "linkClicks": return metrics.linkClicks;
    case "ctr": return metricCtr(metrics);
    case "linkCtr": return metrics.linkClicks === null || metrics.impressions <= 0 ? null : (metrics.linkClicks / metrics.impressions) * 100;
    case "cpc": return metrics.clicks > 0 ? metrics.spendCents / metrics.clicks : null;
    case "costPerLinkClick": return metrics.linkClicks !== null && metrics.linkClicks > 0 ? metrics.spendCents / metrics.linkClicks : null;
  }
}

function compareRows(leftRow: ReportRow, leftMetrics: TotalMetric, rightRow: ReportRow, rightMetrics: TotalMetric, sort: { key: SortKey; direction: "asc" | "desc" }) {
  const left = sortValue(leftRow, leftMetrics, sort.key);
  const right = sortValue(rightRow, rightMetrics, sort.key);
  if (left === null && right === null) return leftRow.name.localeCompare(rightRow.name);
  if (left === null) return 1;
  if (right === null) return -1;
  const comparison = typeof left === "string" && typeof right === "string" ? left.localeCompare(right) : (left as number) - (right as number);
  return (sort.direction === "asc" ? comparison : -comparison) || leftRow.name.localeCompare(rightRow.name);
}

function SortableHeader({ column, path, clientId, range, parentId, parentKey, sort }: { column: { key: SortKey; label: string }; path: string; clientId: string; range: DateRange; parentId?: string; parentKey?: "campaignId" | "adsetId"; sort: { key: SortKey; direction: "asc" | "desc" } }) {
  const active = sort.key === column.key;
  const direction = active && sort.direction === "desc" ? "asc" : "desc";
  const href = reportHref(path, { clientId, ...(parentId && parentKey ? { [parentKey]: parentId } : {}), preset: range.preset, startDate: range.preset === "custom" ? range.start : undefined, endDate: range.preset === "custom" ? range.end : undefined, sort: column.key, direction });
  return <th className="numeric px-3 py-3 font-medium"><Link href={href} className="inline-flex items-center gap-1 hover:text-zinc-300">{column.label}<span aria-hidden className={active ? "text-[#71d8ef]" : "text-zinc-700"}>{active ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}</span><span className="sr-only">{active ? `sorted ${sort.direction === "asc" ? "ascending" : "descending"}` : "sort"}</span></Link></th>;
}

function CoverageCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-lg border border-[#272722] bg-[#0c0c0b] p-4"><p className="text-xs text-zinc-500">{label}</p><p className="numeric mt-2 text-xl font-semibold text-zinc-200">{value}</p><p className="mt-2 text-[11px] text-zinc-600">{detail}</p></div>;
}

function EmptyState({ title, copy, compact = false }: { title: string; copy: string; compact?: boolean }) {
  return <div className={`grid place-items-center px-6 text-center ${compact ? "min-h-56 py-10" : "m-5 min-h-80 rounded-lg border border-[#1d2c37] bg-[#0d161e] py-16 sm:m-8"}`}><div className="max-w-md"><h2 className="text-base font-medium text-zinc-200">{title}</h2><p className="mt-2 text-sm leading-6 text-zinc-500">{copy}</p><Link href="/clients/new" className="mt-5 inline-block text-xs font-medium text-[#27b7df]">Add client →</Link></div></div>;
}

function reportHref(path: string, params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  return `${path}?${query.toString()}`;
}

function DateFilters({ clientId, path, range, parentId, parentKey }: { clientId: string; path: string; range: DateRange; parentId?: string; parentKey?: "campaignId" | "adsetId" }) {
  const preserved = { clientId, ...(parentId && parentKey ? { [parentKey]: parentId } : {}) };
  const presets: Array<[DateRange["preset"], string]> = [["today", "Today"], ["last-7", "Last 7 days"], ["last-30", "Last 30 days"]];
  return <section className="flex flex-wrap items-end gap-2 border-b border-[#272722] bg-[#080808] px-5 py-3 sm:px-8">
    <span className="mr-1 text-xs text-zinc-600">Delivery date:</span>
    {presets.map(([preset, label]) => <Link key={preset} href={reportHref(path, { ...preserved, preset })} className={`rounded-md border px-3 py-1.5 text-xs ${range.preset === preset ? "border-[#27b7df]/50 bg-[#27b7df]/10 text-[#71d8ef]" : "bg-[#0d161e] text-zinc-400"}`}>{label}</Link>)}
    <form action={path} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="clientId" value={clientId} />
      {parentId && parentKey && <input type="hidden" name={parentKey} value={parentId} />}
      <input type="hidden" name="preset" value="custom" />
      <label className="text-[11px] text-zinc-600">From<input aria-label="Start date" type="date" name="startDate" defaultValue={range.start} className="ml-1 rounded-md border border-[#272722] bg-[#0d161e] px-2 py-1 text-xs text-zinc-300" /></label>
      <label className="text-[11px] text-zinc-600">To<input aria-label="End date" type="date" name="endDate" defaultValue={range.end} className="ml-1 rounded-md border border-[#272722] bg-[#0d161e] px-2 py-1 text-xs text-zinc-300" /></label>
      <button type="submit" className="rounded-md border border-[#272722] bg-[#0d161e] px-3 py-1.5 text-xs text-zinc-300">Apply custom</button>
    </form>
  </section>;
}

function Status({ status }: { status: string | null }) {
  const normalized = status?.toUpperCase();
  const color = normalized === "ACTIVE" ? "bg-emerald-800" : normalized === "PAUSED" ? "bg-yellow-400" : normalized === "DRAFT" ? "bg-zinc-500" : "bg-zinc-600";
  return <span className="inline-flex items-center gap-1.5"><span aria-hidden className={`h-2 w-2 rounded-full ${color}`} /><span>{status ?? "Unknown"}</span></span>;
}

function RowName({ row, level, clientId, range }: { row: ReportRow; level: ReportLevel; clientId: string; range: DateRange }) {
  const href = level === "CAMPAIGN"
    ? reportHref("/adsets", { clientId, campaignId: row.id, preset: range.preset, startDate: range.preset === "custom" ? range.start : undefined, endDate: range.preset === "custom" ? range.end : undefined })
    : level === "ADSET"
      ? reportHref("/ads", { clientId, adsetId: row.id, preset: range.preset, startDate: range.preset === "custom" ? range.start : undefined, endDate: range.preset === "custom" ? range.end : undefined })
      : undefined;
  return href ? <Link href={href} className="font-medium text-zinc-200 hover:text-[#71d8ef]">{row.name}</Link> : <p className="font-medium text-zinc-200">{row.name}</p>;
}

async function loadRows(clientId: string, level: ReportLevel, range: DateRange, parent: { campaignId?: string; adsetId?: string }): Promise<ReportRow[]> {
  const metricSelect = { spendCents: true, impressions: true, reach: true, clicks: true, linkClicks: true, leads: true, metaLeadCostCents: true } as const;
  const metricWhere = { level, date: { gte: range.gte, lt: range.lt } };
  const crmById = await loadCrmMetrics(clientId, level, range);
  if (level === "CAMPAIGN") {
    const campaigns = await prisma.clientMetaCampaign.findMany({
      where: { clientId },
      select: { id: true, name: true, status: true, effectiveStatus: true, objective: true, startsAt: true, metaCreatedAt: true, metrics: { where: metricWhere, select: metricSelect } },
    });
    return sortRowsNewest(campaigns.map((campaign) => ({
      id: campaign.id, name: campaign.name, status: campaign.effectiveStatus ?? campaign.status, parent: null, detail: campaign.objective,
      metaTimestamp: campaign.startsAt ?? campaign.metaCreatedAt, metrics: campaign.metrics, crm: crmById.get(campaign.id) ?? { leads: 0, booked: 0 },
    })));
  }
  if (level === "ADSET") {
    const adsets = await prisma.clientMetaAdset.findMany({
      where: { clientId, ...(parent.campaignId ? { campaignId: parent.campaignId } : {}) },
      select: { id: true, name: true, status: true, startsAt: true, metaCreatedAt: true, campaign: { select: { name: true } }, metrics: { where: metricWhere, select: metricSelect } },
    });
    return sortRowsNewest(adsets.map((adset) => ({
      id: adset.id, name: adset.name, status: adset.status, parent: adset.campaign.name, detail: null,
      metaTimestamp: adset.startsAt ?? adset.metaCreatedAt, metrics: adset.metrics, crm: crmById.get(adset.id) ?? { leads: 0, booked: 0 },
    })));
  }
  const ads = await prisma.clientMetaAd.findMany({
    where: { clientId, ...(parent.adsetId ? { adsetId: parent.adsetId } : {}) },
    select: { id: true, name: true, status: true, metaCreatedAt: true, adset: { select: { name: true, campaign: { select: { name: true } } } }, metrics: { where: metricWhere, select: metricSelect } },
  });
  return sortRowsNewest(ads.map((ad) => ({
    id: ad.id, name: ad.name, status: ad.status, parent: `${ad.adset.campaign.name} / ${ad.adset.name}`, detail: null,
    metaTimestamp: ad.metaCreatedAt, metrics: ad.metrics, crm: crmById.get(ad.id) ?? { leads: 0, booked: 0 },
  })));
}

async function loadCrmMetrics(clientId: string, level: ReportLevel, range: DateRange) {
  const leads = await prisma.clientCrmLead.findMany({
    where: { clientId, leadCreatedAt: { gte: range.gte, lt: range.lt } },
    select: { contactId: true, matchedCampaignId: true, matchedAdsetId: true, matchedAdId: true, booked: true },
  });
  return aggregateCanonicalCrmMetrics(leads, level);
}

function sortRowsNewest(rows: ReportRow[]) {
  return rows.sort((left, right) => {
    const leftTimestamp = left.metaTimestamp?.getTime() ?? 0;
    const rightTimestamp = right.metaTimestamp?.getTime() ?? 0;
    return rightTimestamp - leftTimestamp || left.name.localeCompare(right.name);
  });
}
