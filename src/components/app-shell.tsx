"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";

const clientNav = [
  ["Clients", "/clients"],
  ["Client revenue", "/client-revenue"],
  ["Leads", "/leads"],
  ["Attribution", "/attribution"],
  ["Campaigns", "/campaigns"],
  ["Ad sets", "/adsets"],
  ["Ads", "/ads"],
  ["Insights", "/insights"],
  ["Diagnostics", "/diagnostics"],
];

const agencyNav = [
  ["Overview", "/agency"],
  ["Lead tracking", "/agency/leads"],
  ["Attribution", "/agency/attribution"],
  ["Campaigns", "/agency/campaigns"],
  ["Ad sets", "/agency/adsets"],
  ["Ads", "/agency/ads"],
  ["Insights", "/agency/insights"],
  ["Monthly stats", "/agency/monthly"],
  ["Expenses & P&L", "/agency/expenses"],
];

function NavSection({
  label,
  items,
  clientId,
}: {
  label: string;
  items: string[][];
  clientId?: string | null;
}) {
  const pathname = usePathname();
  return (
    <section className="mb-6">
      <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.16em] text-zinc-600">
        {label}
      </p>
      <div className="space-y-0.5">
        {items.map(([name, href]) => {
          const active = href === "/agency" ? pathname === href : pathname.startsWith(href);
          const navigationHref = clientId && href !== "/clients" ? `${href}?clientId=${encodeURIComponent(clientId)}` : href;
          return (
            <Link
              key={href}
              href={navigationHref}
              className={`flex items-center justify-between rounded-md px-3 py-2 text-[13px] transition ${
                active
                  ? "bg-[#27b7df]/10 font-medium text-[#71d8ef]"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
              }`}
            >
              {name}
              {active && <span className="h-1.5 w-1.5 rounded-full bg-[#27b7df]" />}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function ClientNavigation() {
  const clientId = useSearchParams().get("clientId");
  return <NavSection label="Client ROI" items={clientNav} clientId={clientId} />;
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#060a0f]">
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-60 border-r border-[#1d2c37] bg-[#080e14] px-3 py-5 lg:block">
        <Link href="/agency" className="mb-8 flex items-center gap-2 px-3">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-[#27b7df] text-sm font-black text-[#061116]">T</span>
          <span className="text-sm font-semibold tracking-tight">TrueROI <span className="font-normal text-zinc-400">by TundraWeb</span></span>
        </Link>
        <nav className="h-[calc(100vh-150px)] overflow-y-auto pr-1">
          <Suspense fallback={<NavSection label="Client ROI" items={clientNav} />}>
            <ClientNavigation />
          </Suspense>
          <NavSection label="Agency ROI" items={agencyNav} />
        </nav>
        <Link href="/agency/settings" className="absolute bottom-5 left-3 right-3 rounded-md px-3 py-2 text-[13px] text-zinc-500 hover:bg-zinc-900 hover:text-zinc-100">
          Settings
        </Link>
      </aside>
      <main className="lg:pl-60">{children}</main>
    </div>
  );
}

export function PageHeader({
  eyebrow = "Agency ROI",
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-[#1d2c37] px-5 py-5 sm:px-8 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[.16em] text-[#27b7df]">{eyebrow}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">{title}</h1>
        <p className="mt-1 text-sm text-zinc-500">{description}</p>
      </div>
      {actions}
    </header>
  );
}

export function FilterBar() {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[#1d2c37] bg-[#080e14] px-5 py-3 sm:px-8">
      <button className="rounded-md border border-[#263947] bg-[#0d161e] px-3 py-1.5 text-xs text-zinc-300">Last 30 days <span className="ml-2 text-zinc-600">⌄</span></button>
      <button className="rounded-md border border-[#263947] bg-[#0d161e] px-3 py-1.5 text-xs text-zinc-400">All campaigns <span className="ml-2 text-zinc-600">⌄</span></button>
      <button className="rounded-md border border-[#263947] bg-[#0d161e] px-3 py-1.5 text-xs text-zinc-400">Lead created <span className="ml-2 text-zinc-600">⌄</span></button>
      <div className="ml-auto text-xs text-zinc-600">Meta spend filters by delivery date</div>
    </div>
  );
}
