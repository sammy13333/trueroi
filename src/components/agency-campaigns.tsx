import Link from "next/link";
import { AppShell, FilterBar, PageHeader } from "@/components/app-shell";

const columns = [
  "Campaign", "Status", "Ad Spend", "Total Leads", "CPL", "Total Bookings",
  "Cost Per Booking", "Appointment %", "Cost Per Call Taken", "Total Cancelled Calls",
  "Total No Shows", "Show Up Rate %", "Close Rate", "% of Leads", "Total Closed",
  "ROAS", "Average Cash Collected", "Total Unqualified Leads", "Total Unqualified Leads %",
  "Recommendations", "Action",
];

const numericColumns = new Set(columns.slice(2));

function EmptyCampaignState() {
  return (
    <div className="grid min-h-80 place-items-center px-6 py-16">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-full border border-[#d4af37]/30 bg-[#d4af37]/10 text-[#d4af37]">+</div>
        <h2 className="text-base font-medium text-zinc-200">No synced campaign delivery data</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          Add your Meta ad account in Agency Settings, then run a Meta sync. Campaign leads are always sourced from attributed GHL records—not Meta form counts.
        </p>
        <Link href="/agency/settings" className="mt-5 inline-flex rounded-md bg-[#d4af37] px-3.5 py-2 text-xs font-semibold text-black hover:bg-[#e2c457]">
          Connect Meta & GHL
        </Link>
      </div>
    </div>
  );
}

export function AgencyCampaigns() {
  return (
    <AppShell>
      <PageHeader
        title="Campaign performance"
        description="Business KPIs joined from Meta delivery and attributed CRM outcomes."
        actions={
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-zinc-600 sm:inline">No Meta metrics synced</span>
            <Link href="/agency/settings" className="rounded-md border border-[#3b3520] bg-[#16140d] px-3 py-2 text-xs font-medium text-[#e6c45a]">Sync Meta</Link>
          </div>
        }
      />
      <FilterBar />
      <section className="m-5 overflow-hidden rounded-lg border border-[#272722] bg-[#0c0c0b] sm:m-8">
        <div className="flex items-center justify-between border-b border-[#272722] px-4 py-3">
          <div>
            <h2 className="text-sm font-medium text-zinc-200">Campaign business KPIs</h2>
            <p className="mt-0.5 text-xs text-zinc-600">Totals use aggregate numerator and denominator math.</p>
          </div>
          <button className="text-xs text-zinc-500 hover:text-zinc-200">Columns</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-max min-w-full border-collapse text-left text-xs">
            <thead className="bg-[#10100f] text-[10px] uppercase tracking-wide text-zinc-600">
              <tr>{columns.map((column, index) => (
                <th key={column} className={`whitespace-nowrap border-b px-3 py-3 font-medium ${index === 0 ? "sticky left-0 z-[1] min-w-56 bg-[#10100f] table-shadow" : ""}`}>
                  {column}
                </th>
              ))}</tr>
            </thead>
            <tbody>
              <tr className="border-b border-[#272722] bg-[#090909] font-medium text-zinc-400">
                {columns.map((column, index) => (
                  <td key={column} className={`whitespace-nowrap px-3 py-3 ${index === 0 ? "sticky left-0 z-[1] bg-[#090909] table-shadow text-zinc-300" : "numeric"}`}>
                    {index === 0 ? "Total" : numericColumns.has(column) ? "—" : "—"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <EmptyCampaignState />
      </section>
      <div className="mx-5 mb-8 grid gap-3 sm:mx-8 lg:grid-cols-3">
        {[
          ["Attribution coverage", "Connect GHL to calculate matched vs. unattributed CRM leads."],
          ["Spend coverage", "No dated Meta metrics are available for this selected range."],
          ["Recommendation engine", "Recommendations appear after a campaign has enough delivery and CRM outcome volume."],
        ].map(([title, copy]) => (
          <div key={title} className="rounded-lg border border-[#272722] bg-[#0c0c0b] p-4">
            <p className="text-xs font-medium text-zinc-300">{title}</p>
            <p className="mt-2 text-xs leading-5 text-zinc-600">{copy}</p>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
