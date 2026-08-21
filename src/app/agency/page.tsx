import Link from "next/link";
import { AppShell, FilterBar, PageHeader } from "@/components/app-shell";

const cards = [
  ["Ad spend", "—", "Connect Meta to load delivery spend"],
  ["Attributed leads", "—", "Connect GHL and run attribution"],
  ["Bookings", "—", "No outcome data in selected range"],
  ["Cash collected", "—", "CRM deal values only; not processor P&L"],
  ["ROAS", "—", "Requires Meta spend and attributed revenue"],
];

export default function AgencyOverviewPage() {
  return (
    <AppShell>
      <PageHeader
        title="Agency overview"
        description="Acquisition performance, CRM outcomes, and financial health in one operating surface."
        actions={<Link href="/agency/settings" className="rounded-md bg-[#27b7df] px-3.5 py-2 text-xs font-semibold text-[#061116] hover:bg-[#55cae8]">Connect data sources</Link>}
      />
      <FilterBar />
      <div className="p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {cards.map(([label, value, note]) => (
            <div key={label} className="rounded-lg border border-[#272722] bg-[#0c0c0b] p-4">
              <p className="text-xs text-zinc-500">{label}</p>
              <p className="numeric mt-3 text-2xl font-semibold text-zinc-200">{value}</p>
              <p className="mt-3 text-[11px] leading-4 text-zinc-600">{note}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-[1.45fr_1fr]">
          <section className="rounded-lg border border-[#272722] bg-[#0c0c0b] p-5">
            <div className="flex items-center justify-between"><div><h2 className="text-sm font-medium text-zinc-200">Acquisition funnel</h2><p className="mt-1 text-xs text-zinc-600">Leads → booked → showed → sold</p></div><Link href="/agency/leads" className="text-xs text-[#27b7df] hover:text-[#71d8ef]">View lead tracking</Link></div>
            <div className="mt-10 grid grid-cols-4 gap-2 text-center">
              {["Leads", "Booked", "Showed", "Sold"].map((step) => <div key={step}><div className="h-1.5 rounded-full bg-zinc-800" /><p className="mt-3 text-xs text-zinc-500">{step}</p><p className="numeric mt-1 text-lg text-zinc-300">—</p></div>)}
            </div>
            <p className="mt-9 rounded-md border border-dashed border-[#263947] px-3 py-2.5 text-xs text-zinc-600">Connect GHL to identify where the funnel is breaking. “Showed” is calculated as booked without a no-show outcome.</p>
          </section>
          <section className="rounded-lg border border-[#272722] bg-[#0c0c0b] p-5">
            <h2 className="text-sm font-medium text-zinc-200">Sync health</h2>
            <div className="mt-5 space-y-4 text-xs">
              <div className="flex justify-between"><span className="text-zinc-500">Meta delivery</span><span className="text-amber-300">Not connected</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">GHL outcomes</span><span className="text-amber-300">Not connected</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Payment ledger</span><span className="text-zinc-600">Not configured</span></div>
            </div>
            <Link href="/agency/settings" className="mt-8 block rounded-md border border-[#263947] px-3 py-2 text-center text-xs text-zinc-400">Open sync settings</Link>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
