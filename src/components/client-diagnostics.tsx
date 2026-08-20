import Link from "next/link";
import { AppShell, PageHeader } from "@/components/app-shell";
import { ClientGhlSyncButton } from "@/components/client-ghl-sync-button";
import { ClientMetaSyncButton } from "@/components/client-meta-sync-button";
import { ClientAttributionTrace } from "@/components/client-attribution-trace";
import { ClientSelector, selectedClientId } from "@/components/client-selector";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { readSession, SESSION_COOKIE } from "@/lib/auth";

type SearchParams = Record<string, string | string[] | undefined>;

function date(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function count(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export async function ClientDiagnostics({
  requestedClientId,
  searchParams,
}: {
  requestedClientId?: string | string[];
  searchParams?: SearchParams;
}) {
  const clients = await prisma.client.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true },
  });
  const clientId = selectedClientId(clients, requestedClientId);
  const session = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  const user = session ? await prisma.user.findUnique({ where: { id: session.userId }, select: { role: true } }) : null;
  const isOwner = user?.role === "OWNER";

  if (!clientId) {
    return (
      <AppShell>
        <PageHeader eyebrow="Client ROI" title="Account diagnostics" description="Read stored coverage data without triggering an automatic sync." />
        <EmptyState title="No client account is available" copy="Add a client before reviewing isolated delivery and CRM coverage." />
      </AppShell>
    );
  }

  const [client, metrics, unmatchedLeads, bookedLeads] = await Promise.all([
    prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      select: {
        id: true,
        name: true,
        metaAdAccountId: true,
        metaAccessTokenEnc: true,
        ghlLocationId: true,
        ghlPrivateTokenEnc: true,
        syncLogs: {
          orderBy: { createdAt: "desc" },
          take: 20,
          select: { mode: true, status: true, message: true, completedAt: true, createdAt: true },
        },
        _count: {
          select: {
            metaCampaigns: true,
            metaAdsets: true,
            metaAds: true,
            dailyMetaMetrics: true,
            pipelines: true,
            ghlOpportunities: true,
            ghlContacts: true,
            crmLeads: true,
          },
        },
      },
    }),
    prisma.clientDailyMetaMetric.aggregate({
      where: { clientId },
      _min: { date: true },
      _max: { date: true },
    }),
    prisma.clientCrmLead.count({ where: { clientId, unmatchedReason: { not: null } } }),
    prisma.clientCrmLead.count({ where: { clientId, booked: true } }),
  ]);

  const latestMetaSync = client.syncLogs.find((log) => log.mode === "META");
  const latestGhlSync = client.syncLogs.find((log) => log.mode === "GHL");
  const missingReason = coverageGap({
    client,
    metricCount: client._count.dailyMetaMetrics,
    latestMetaSync,
    latestGhlSync,
  });
  const metricRange = metrics._min.date && metrics._max.date
    ? `${date(metrics._min.date)} through ${date(metrics._max.date)}`
    : "No daily metrics stored";

  return (
    <AppShell>
      <PageHeader
        eyebrow="Client ROI"
        title="Account diagnostics"
        description="Stored Meta delivery and GoHighLevel CRM coverage for the selected client only."
      />
      <section className="flex flex-wrap items-center gap-2 border-b border-[#272722] bg-[#080808] px-5 py-3 sm:px-8">
        <span className="mr-1 text-xs text-zinc-600">Client:</span>
        <ClientSelector clients={clients} clientId={client.id} path="/diagnostics" searchParams={searchParams} />
        <Link href={`/clients/${client.id}`} className="ml-auto text-xs text-zinc-500 hover:text-zinc-200">Client workspace</Link>
      </section>
      <div className="m-5 max-w-5xl space-y-5 sm:m-8">
        <section className={`rounded-lg border p-4 ${missingReason ? "border-amber-900/70 bg-amber-950/15" : "border-emerald-900/70 bg-emerald-950/15"}`}>
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Coverage status</p>
          <h2 className={`mt-2 text-base font-medium ${missingReason ? "text-amber-200" : "text-emerald-300"}`}>{missingReason ? missingReason.title : "Stored coverage is available"}</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-400">{missingReason ? missingReason.detail : "Meta hierarchy, daily metrics, GHL pipelines, and GHL opportunities have all been stored for this client."}</p>
          {missingReason?.provider === "META" ? <div className="mt-4"><ClientMetaSyncButton clientId={client.id} /></div> : missingReason?.provider === "GHL" ? <div className="mt-4"><ClientGhlSyncButton clientId={client.id} /></div> : null}
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          <CoverageCard label="Meta campaigns" value={count(client._count.metaCampaigns)} detail="Stored hierarchy records" />
          <CoverageCard label="Meta ad sets" value={count(client._count.metaAdsets)} detail="Stored hierarchy records" />
          <CoverageCard label="Meta ads" value={count(client._count.metaAds)} detail="Stored hierarchy records" />
          <CoverageCard label="Daily Meta metrics" value={count(client._count.dailyMetaMetrics)} detail={metricRange} />
          <CoverageCard label="GHL pipelines" value={count(client._count.pipelines)} detail="Stored pipeline records" />
          <CoverageCard label="GHL opportunities" value={count(client._count.ghlOpportunities)} detail="Stored CRM opportunity records" />
          <CoverageCard label="Canonical CRM leads" value={count(client._count.crmLeads)} detail={`${count(bookedLeads)} booked · deduped by GHL contact`} />
          <CoverageCard label="Unmatched CRM leads" value={count(unmatchedLeads)} detail="Exact ID/name matching failures are retained for review" />
        </section>

        <section className="overflow-hidden rounded-lg border border-[#272722] bg-[#0c0c0b]">
          <div className="border-b border-[#272722] px-4 py-3">
            <h2 className="text-sm font-medium text-zinc-200">Stored source checks</h2>
            <p className="mt-0.5 text-xs text-zinc-600">These checks do not call Meta or GoHighLevel.</p>
          </div>
          <div className="divide-y divide-[#272722] text-sm">
            <SourceCheck label="Meta hierarchy" value={`${count(client._count.metaCampaigns)} campaigns · ${count(client._count.metaAdsets)} ad sets · ${count(client._count.metaAds)} ads`} detail={syncDetail(latestMetaSync)} />
            <SourceCheck label="Daily Meta delivery" value={`${count(client._count.dailyMetaMetrics)} metric rows`} detail={metricRange} />
            <SourceCheck label="GoHighLevel CRM" value={`${count(client._count.pipelines)} pipelines · ${count(client._count.ghlContacts)} contacts · ${count(client._count.ghlOpportunities)} opportunities`} detail={`${syncDetail(latestGhlSync)} · ${count(client._count.crmLeads)} canonical contacts, ${count(unmatchedLeads)} unmatched`} />
          </div>
        </section>
        {isOwner && <ClientAttributionTrace clientId={client.id} />}
      </div>
    </AppShell>
  );
}

function coverageGap({
  client,
  metricCount,
  latestMetaSync,
  latestGhlSync,
}: {
  client: {
    metaAdAccountId: string | null;
    metaAccessTokenEnc: string | null;
    ghlLocationId: string | null;
    ghlPrivateTokenEnc: string | null;
    _count: { metaCampaigns: number; metaAdsets: number; metaAds: number; pipelines: number; ghlOpportunities: number };
  };
  metricCount: number;
  latestMetaSync: { status: string; message: string | null } | undefined;
  latestGhlSync: { status: string; message: string | null } | undefined;
}) {
  if (!client.metaAdAccountId || !client.metaAccessTokenEnc) {
    return { provider: "META" as const, title: "Meta connection is incomplete", detail: "Add this client’s Meta ad account ID and access token, then sync Meta to store hierarchy and daily delivery metrics." };
  }
  if (latestMetaSync?.status === "FAILED") {
    return { provider: "META" as const, title: "The latest Meta sync failed", detail: latestMetaSync.message ?? "Review the client’s Meta account access and token, then run the sync again." };
  }
  if (client._count.metaCampaigns === 0 || client._count.metaAdsets === 0 || client._count.metaAds === 0 || metricCount === 0) {
    return { provider: "META" as const, title: "Meta coverage is missing", detail: "Run a Meta sync to store the account hierarchy and daily insight rows for this client." };
  }
  if (!client.ghlLocationId || !client.ghlPrivateTokenEnc) {
    return { provider: "GHL" as const, title: "GoHighLevel connection is incomplete", detail: "Add this client’s GHL location ID and private integration token, then sync CRM data." };
  }
  if (latestGhlSync?.status === "FAILED") {
    return { provider: "GHL" as const, title: "The latest GoHighLevel sync failed", detail: latestGhlSync.message ?? "Verify the client’s GHL token scopes and location ID, then run the CRM sync again." };
  }
  if (client._count.pipelines === 0 || client._count.ghlOpportunities === 0) {
    return { provider: "GHL" as const, title: "GoHighLevel coverage is missing", detail: "Run a GHL CRM sync to store pipelines and opportunities for this client." };
  }
  return null;
}

function syncDetail(sync: { status: string; message: string | null; completedAt: Date | null; createdAt: Date } | undefined) {
  if (!sync) return "No sync has been recorded";
  const when = date(sync.completedAt ?? sync.createdAt);
  return `${sync.status} · ${when}${sync.message ? ` · ${sync.message}` : ""}`;
}

function CoverageCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-lg border border-[#272722] bg-[#0c0c0b] p-4"><p className="text-xs text-zinc-500">{label}</p><p className="numeric mt-2 text-xl font-semibold text-zinc-200">{value}</p><p className="mt-2 text-[11px] text-zinc-600">{detail}</p></div>;
}

function SourceCheck({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="px-4 py-3"><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 text-sm text-zinc-300">{value}</p><p className="mt-1 text-xs text-zinc-600">{detail}</p></div>;
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return <div className="m-5 grid min-h-80 place-items-center rounded-lg border border-[#1d2c37] bg-[#0d161e] p-8 text-center sm:m-8"><div className="max-w-md"><h2 className="text-base font-medium text-zinc-200">{title}</h2><p className="mt-2 text-sm leading-6 text-zinc-500">{copy}</p><Link href="/clients/new" className="mt-5 inline-block text-xs font-medium text-[#27b7df]">Add client →</Link></div></div>;
}
