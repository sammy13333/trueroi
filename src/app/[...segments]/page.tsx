import Link from "next/link";
import { AppShell, FilterBar, PageHeader } from "@/components/app-shell";
import { ClientConnectionForm } from "@/components/client-connection-form";

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
}: {
  params: Promise<{ segments: string[] }>;
}) {
  const { segments } = await params;
  const [section, detail] = segments;
  const [title, description] = clientTitles[section] ?? [
    "Client ROI",
    "This route is ready for the client reporting workspace.",
  ];
  const isNewClient = section === "clients" && detail === "new";
  const isClientDetail = section === "clients" && detail && detail !== "new";

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
      ) : (
        <div className="m-5 grid min-h-80 place-items-center rounded-lg border border-[#272722] bg-[#0c0c0b] p-8 text-center sm:m-8">
          <div className="max-w-md">
            <h2 className="text-base font-medium text-zinc-200">No client data is synced yet</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-500">Once a client source is connected and synced, this surface will report only that client’s delivery and CRM outcomes.</p>
            <Link href="/clients/new" className="mt-5 inline-block text-xs font-medium text-[#d4af37]">Add a client →</Link>
          </div>
        </div>
      )}
    </AppShell>
  );
}
