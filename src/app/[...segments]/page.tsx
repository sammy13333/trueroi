import Link from "next/link";
import { AppShell, FilterBar, PageHeader } from "@/components/app-shell";
import { ClientConnectionForm } from "@/components/client-connection-form";
import { ClientSyncAllButton } from "@/components/client-sync-all-button";
import { ClientMetaSyncButton } from "@/components/client-meta-sync-button";
import { FetchPipelinesButton } from "@/components/fetch-pipelines-button";
import { ClientMetaReport } from "@/components/client-meta-report";
import { ClientGhlLeadTracking } from "@/components/client-ghl-lead-tracking";
import { ClientInsights } from "@/components/client-insights";
import { ClientReportPlaceholder } from "@/components/client-report-placeholder";
import { ClientGhlSyncButton } from "@/components/client-ghl-sync-button";
import { ClientDiagnostics } from "@/components/client-diagnostics";
import { prisma } from "@/lib/prisma";

const clientTitles: Record<string, [string, string]> = {
  clients: ["Clients", "Manage client delivery accounts, lifecycle, sync health, and MRR."],
  leads: ["Client lead tracking", "CRM leads are shown separately from Meta delivery diagnostics."],
  attribution: ["Client attribution", "Inspect campaign matching, UTM evidence, and unattributed leads."],
  campaigns: ["Client campaigns", "Business performance for the selected client delivery account."],
  adsets: ["Client ad sets", "Ad set performance uses permanent Meta IDs, never campaign names."],
  ads: ["Client ads", "Ad-level delivery and recommendations for client delivery accounts."],
  insights: ["Client insights", "Best and worst performance after real delivery and CRM data sync."],
  diagnostics: ["Account diagnostics", "Read stored coverage data without triggering an automatic sync."],
};

export default async function ClientRoutePage({
  params,
  searchParams,
}: {
  params: Promise<{ segments: string[] }>;
  searchParams: Promise<{
    clientId?: string | string[];
    campaignId?: string | string[];
    adsetId?: string | string[];
    preset?: string | string[];
    startDate?: string | string[];
    endDate?: string | string[];
  }>;
}) {
  const { segments } = await params;
  const [section, detail] = segments;
  const filters = await searchParams;
  if (section === "campaigns" || section === "adsets" || section === "ads") {
    return <ClientMetaReport level={section === "campaigns" ? "CAMPAIGN" : section === "adsets" ? "ADSET" : "AD"} requestedClientId={filters.clientId} searchParams={filters} />;
  }
  if (section === "leads") {
    return <AppShell><PageHeader eyebrow="Client ROI" title="Client lead tracking" description="GoHighLevel CRM opportunities by client, pipeline, and stage. Meta delivery actions are excluded." /><ClientGhlLeadTracking requestedClientId={filters.clientId} searchParams={filters} /></AppShell>;
  }
  if (section === "insights") {
    return <ClientInsights requestedClientId={filters.clientId} />;
  }
  if (section === "diagnostics") {
    return <ClientDiagnostics requestedClientId={filters.clientId} searchParams={filters} />;
  }
  if (section === "attribution") {
    const [title, description] = clientTitles[section];
    return <AppShell><PageHeader eyebrow="Client ROI" title={title} description={description} /><ClientReportPlaceholder section={section} title={title} description="This report remains scoped to the selected client. Sync delivery and CRM data to populate its findings." searchParams={filters} /></AppShell>;
  }
  const [title, description] = clientTitles[section] ?? [
    "Client ROI",
    "This route is ready for the client reporting workspace.",
  ];
  const isNewClient = section === "clients" && detail === "new";
  const isClientDetail = section === "clients" && detail && detail !== "new";
  const client = isClientDetail ? await prisma.client.findUnique({
    where: { id: detail },
    select: {
      id: true, name: true, industry: true, metaAdAccountId: true, ghlLocationId: true, metaAccessTokenEnc: true, ghlPrivateTokenEnc: true, lifecycle: true,
      pipelines: { select: { id: true, ghlId: true, name: true } },
      syncLogs: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, message: true, latestMetricDate: true, completedAt: true, createdAt: true } },
      dailyMetaMetrics: { orderBy: { date: "desc" }, take: 1, select: { date: true } },
      _count: { select: { dailyMetaMetrics: true } },
    },
  }) : null;
  const clients = section === "clients" && !detail ? await prisma.client.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, industry: true, metaAdAccountId: true, ghlLocationId: true, metaAccessTokenEnc: true, ghlPrivateTokenEnc: true, lifecycle: true },
  }) : [];

  return (
    <AppShell>
      <PageHeader
        eyebrow="Client ROI"
        title={isNewClient ? "Add client" : isClientDetail ? "Client workspace" : title}
        description={isNewClient ? "Connect one client Meta ad account and one GHL location. These records never mix with Agency ROI." : description}
        actions={<Link href="/agency/settings" className="rounded-md border px-3 py-2 text-xs text-zinc-400">Agency settings</Link>}
      />
      {!isNewClient && <FilterBar />}
      {isNewClient ? (
        <div className="m-5 sm:m-8"><ClientConnectionForm /></div>
      ) : isClientDetail && client ? (
        <div className="m-5 max-w-3xl space-y-4 sm:m-8">
          <div className="rounded-lg border border-emerald-900/70 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-300">Client workspace created successfully. Credentials are stored securely and ready for validation/sync.</div>
          <section className="rounded-lg border border-[#272722] bg-[#0c0c0b] p-5">
            <div className="flex items-start justify-between"><div><h2 className="text-lg font-medium text-zinc-100">{client.name}</h2><p className="mt-1 text-xs text-zinc-500">{client.industry || "Industry not set"} · {client.lifecycle}</p></div><Link href={`/clients/${client.id}/edit`} className="rounded-md border px-3 py-2 text-xs text-zinc-400">Edit client</Link></div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border bg-[#090909] p-3"><p className="text-[11px] uppercase tracking-wide text-zinc-600">Meta</p><p className="mt-2 text-sm text-zinc-300">{client.metaAdAccountId || "No ad account"}</p><p className={`mt-1 text-xs ${client.metaAccessTokenEnc ? "text-emerald-400" : "text-amber-300"}`}>{client.metaAccessTokenEnc ? "Access token configured" : "Token missing"}</p></div>
              <div className="rounded-md border bg-[#090909] p-3"><p className="text-[11px] uppercase tracking-wide text-zinc-600">GoHighLevel</p><p className="mt-2 text-sm text-zinc-300">{client.ghlLocationId || "No location"}</p><p className={`mt-1 text-xs ${client.ghlPrivateTokenEnc ? "text-emerald-400" : "text-amber-300"}`}>{client.ghlPrivateTokenEnc ? "Private token configured" : "Token missing"}</p></div>
            </div>
            <div className="mt-5 border-t pt-5"><ClientMetaSyncButton clientId={client.id} /></div>
            <div className="mt-5 border-t pt-5"><ClientGhlSyncButton clientId={client.id} /></div>
            {(() => {
              const lastSync = client.syncLogs[0];
              const latestCoverage = client.dailyMetaMetrics[0]?.date ?? lastSync?.latestMetricDate;
              return <section className="mt-5 rounded-md border bg-[#090909] p-4">
                <p className="text-[11px] uppercase tracking-wide text-zinc-600">Meta sync result and coverage</p>
                {lastSync ? <><p className={`mt-2 text-sm ${lastSync.status === "COMPLETED" ? "text-emerald-400" : lastSync.status === "FAILED" ? "text-red-400" : "text-amber-300"}`}>{lastSync.status === "COMPLETED" ? "Last sync completed" : lastSync.status === "FAILED" ? "Last sync failed" : "Sync in progress"}</p><p className="mt-1 text-xs text-zinc-500">{lastSync.message ?? "No provider message recorded."}</p></> : <p className="mt-2 text-sm text-zinc-500">No Meta sync has run yet.</p>}
                <p className="mt-3 text-xs text-zinc-500">Stored daily metric rows: {client._count.dailyMetaMetrics} · Latest coverage: {latestCoverage ? latestCoverage.toISOString().slice(0, 10) : "No daily insights stored"}</p>
              </section>;
            })()}
            <div className="mt-5 border-t pt-5"><FetchPipelinesButton clientId={client.id} />{client.pipelines.length > 0 && <p className="mt-3 text-xs text-emerald-400">Imported pipelines: {client.pipelines.map((pipeline) => pipeline.name).join(", ")}</p>}<p className="mt-3 text-xs text-zinc-500">CRM outcomes use live GHL contact tags: <span className="font-mono">new lead</span> for CRM leads and <span className="font-mono">booked appointment</span> or <span className="font-mono">appointment booked</span> for booked appointments.</p></div>
          </section>
        </div>
      ) : section === "clients" ? (
        <div className="m-5 max-w-5xl sm:m-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-zinc-600">Sync all fetches and stores Meta data for each configured client; incomplete accounts are skipped.</p><div className="flex items-center gap-2"><ClientSyncAllButton clientCount={clients.length} /><Link href="/clients/new" className="rounded-md bg-[#27b7df] px-3.5 py-2 text-xs font-semibold text-[#061116] hover:bg-[#55cae8]">Add client</Link></div></div>
          <div className="overflow-hidden rounded-lg border border-[#272722] bg-[#0c0c0b]">
            {clients.length === 0 ? <p className="p-8 text-center text-sm text-zinc-500">No clients yet. Add your first client connection.</p> : clients.map((item) => <Link key={item.id} href={`/clients/${item.id}`} className="flex items-center justify-between border-b border-[#272722] px-5 py-4 last:border-b-0 hover:bg-zinc-900/50"><div><p className="text-sm font-medium text-zinc-200">{item.name}</p><p className="mt-1 text-xs text-zinc-600">{item.industry || "Industry not set"} · {item.lifecycle}</p></div><div className="text-right text-xs"><p className={item.metaAccessTokenEnc && item.ghlPrivateTokenEnc ? "text-emerald-400" : "text-amber-300"}>{item.metaAccessTokenEnc && item.ghlPrivateTokenEnc ? "Connections configured" : "Setup incomplete"}</p><p className="mt-1 text-zinc-600">{item.metaAdAccountId || "No Meta account"}</p></div></Link>)}
          </div>
        </div>
      ) : (
        <div className="m-5 grid min-h-80 place-items-center rounded-lg border border-[#272722] bg-[#0c0c0b] p-8 text-center sm:m-8">
          <div className="max-w-md">
            <h2 className="text-base font-medium text-zinc-200">No client data is synced yet</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-500">Once a client source is connected and synced, this surface will report only that client’s delivery and CRM outcomes.</p>
            <Link href="/clients/new" className="mt-5 inline-block text-xs font-medium text-[#27b7df] hover:text-[#71d8ef]">Add a client →</Link>
          </div>
        </div>
      )}
    </AppShell>
  );
}
