"use client";

import { useState } from "react";

export type LeadVolumePoint = {
  label: string;
  leads: number;
  spendCents: number | null;
  cplCents: number | null;
};

type Period = "day" | "week" | "month";

const labels: Record<Period, string> = {
  day: "Daily",
  week: "Weekly",
  month: "Monthly",
};

function currency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function leadLabel(leads: number) {
  return `${leads} CRM lead${leads === 1 ? "" : "s"}`;
}

function spendLabel(point: LeadVolumePoint) {
  return point.spendCents === null ? "Not synced" : currency(point.spendCents);
}

function cplLabel(point: LeadVolumePoint) {
  return point.cplCents === null ? "Unavailable" : currency(point.cplCents);
}

function pointDetail(point: LeadVolumePoint) {
  const spend = point.spendCents === null ? "Meta spend not synced for this period" : `Meta spend ${spendLabel(point)}`;
  const cpl = point.cplCents === null ? "CRM CPL unavailable" : `CRM CPL ${cplLabel(point)}`;
  return `${point.label}: ${leadLabel(point.leads)} · ${spend} · ${cpl}`;
}

export function ClientLeadVolumeChart({ series }: { series: Record<Period, LeadVolumePoint[]> }) {
  const [period, setPeriod] = useState<Period>("day");
  const points = series[period];
  const maximum = Math.max(...points.map((point) => point.leads), 1);

  return (
    <section className="rounded-lg border border-[#272722] bg-[#0c0c0b] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-zinc-200">CRM leads over time</h2>
          <p className="mt-1 text-xs text-zinc-600">Every bucket shows its CRM leads, stored Meta spend, and blended CRM CPL. Hover a bar for the full detail.</p>
        </div>
        <div className="flex rounded-md border border-[#272722] bg-[#090909] p-0.5">
          {(Object.keys(labels) as Period[]).map((item) => (
            <button key={item} type="button" onClick={() => setPeriod(item)} className={`rounded px-2.5 py-1 text-xs ${period === item ? "bg-[#27b7df]/15 text-[#71d8ef]" : "text-zinc-500 hover:text-zinc-300"}`}>{labels[item]}</button>
          ))}
        </div>
      </div>
      <div className="mt-5 flex h-52 items-end gap-1 border-b border-[#272722] pb-1">
        {points.map((point) => (
          <div key={point.label} className="group relative flex h-full min-w-0 flex-1 items-end" title={pointDetail(point)}>
            <div
              aria-label={pointDetail(point)}
              className="w-full rounded-t bg-[#27b7df]/70 transition-colors group-hover:bg-[#71d8ef]"
              style={{ height: `${(point.leads / maximum) * 100}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-zinc-600"><span>{points[0]?.label}</span><span>{points.at(-1)?.label}</span></div>
      <div className="mt-4">
        <h3 className="text-xs font-medium text-zinc-300">{labels[period]} bucket metrics</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {points.map((point) => (
            <dl key={point.label} className="rounded-md border border-[#272722] bg-[#090909] px-3 py-2 text-[11px]">
              <dt className="font-medium text-zinc-300">{point.label}</dt>
              <dd className="mt-1 grid grid-cols-3 gap-2 text-zinc-500">
                <span><span className="block text-[10px] uppercase tracking-wide text-zinc-600">Leads</span>{leadLabel(point.leads)}</span>
                <span><span className="block text-[10px] uppercase tracking-wide text-zinc-600">Spend</span>{spendLabel(point)}</span>
                <span><span className="block text-[10px] uppercase tracking-wide text-zinc-600">CRM CPL</span>{cplLabel(point)}</span>
              </dd>
            </dl>
          ))}
        </div>
      </div>
    </section>
  );
}
