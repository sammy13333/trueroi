"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";

type Client = { id: string; name: string };
type Receivable = {
  id: string;
  customerName: string;
  clientId: string | null;
  client: Client | null;
  type: "RETAINER" | "SETUP_FEE" | "REV_SHARE" | "OTHER";
  amountCents: number;
  dueDate: string;
  status: "OWED" | "PAID";
  paidDate: string | null;
  notes: string | null;
  createdAt: string;
};

const typeLabels: Record<Receivable["type"], string> = {
  RETAINER: "Retainer",
  SETUP_FEE: "Setup fee",
  REV_SHARE: "Rev share",
  OTHER: "Other",
};

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const dateKey = (value: string) => new Date(value).toISOString().slice(0, 10);
const displayDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));

function centsToDollars(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

export function ClientRevenue() {
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [month, setMonth] = useState(() => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [revenueResponse, clientsResponse] = await Promise.all([
        fetch("/api/client-revenue"),
        fetch("/api/clients"),
      ]);
      if (!revenueResponse.ok || !clientsResponse.ok) throw new Error("Unable to load receivables.");
      setReceivables(await revenueResponse.json());
      setClients(await clientsResponse.json());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load receivables.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const monthKey = month.toISOString().slice(0, 7);
  const monthlyDue = useMemo(
    () => receivables.filter((item) => dateKey(item.dueDate).startsWith(monthKey)).reduce((sum, item) => sum + item.amountCents, 0),
    [monthKey, receivables],
  );
  const paidThisMonth = useMemo(
    () => receivables.filter((item) => item.paidDate && dateKey(item.paidDate).startsWith(monthKey)).reduce((sum, item) => sum + item.amountCents, 0),
    [monthKey, receivables],
  );
  const outstanding = useMemo(
    () => receivables.filter((item) => item.status === "OWED").reduce((sum, item) => sum + item.amountCents, 0),
    [receivables],
  );

  const calendarDays = useMemo(() => {
    const firstDay = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
    const start = new Date(firstDay);
    start.setUTCDate(1 - firstDay.getUTCDay());
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start);
      day.setUTCDate(start.getUTCDate() + index);
      return day;
    });
  }, [month]);

  async function addReceivable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    const response = await fetch("/api/client-revenue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: form.get("customerName"),
        clientId: form.get("clientId") || null,
        type: form.get("type"),
        amountCents: centsToDollars(String(form.get("amount"))),
        dueDate: `${form.get("dueDate")}T12:00:00.000Z`,
        notes: form.get("notes") || null,
      }),
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) {
      setError(data.error ?? "Unable to add payment.");
      return;
    }
    setReceivables((current) => [...current, data].sort((a, b) => a.dueDate.localeCompare(b.dueDate)));
    setShowForm(false);
    event.currentTarget.reset();
  }

  async function setStatus(item: Receivable) {
    const nextStatus = item.status === "OWED" ? "PAID" : "OWED";
    setError("");
    const response = await fetch(`/api/client-revenue/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "Unable to update payment.");
      return;
    }
    setReceivables((current) => current.map((entry) => entry.id === item.id ? data : entry));
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Client ROI"
        title="Client revenue"
        description="Track manual retainers, setup fees, rev share, and other receivables by due date."
        actions={<button onClick={() => setShowForm((open) => !open)} className="rounded-md bg-[#27b7df] px-3 py-2 text-xs font-semibold text-[#061116] hover:bg-[#71d8ef]">{showForm ? "Close form" : "+ Add payment"}</button>}
      />
      <div className="space-y-6 p-5 sm:p-8">
        {error && <p className="rounded-md border border-red-900/70 bg-red-950/30 px-3 py-2 text-sm text-red-300">{error}</p>}
        {showForm && (
          <form onSubmit={addReceivable} className="grid gap-3 rounded-lg border border-[#263947] bg-[#080e14] p-4 md:grid-cols-2">
            <label className="text-xs text-zinc-400">Customer or deal name<input required name="customerName" className="mt-1 w-full rounded-md border border-[#263947] bg-[#0d161e] px-3 py-2 text-sm text-zinc-100" placeholder="Acme Co. retainer" /></label>
            <label className="text-xs text-zinc-400">Client (optional)<select name="clientId" className="mt-1 w-full rounded-md border border-[#263947] bg-[#0d161e] px-3 py-2 text-sm text-zinc-100"><option value="">No linked client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
            <label className="text-xs text-zinc-400">Type<select name="type" defaultValue="RETAINER" className="mt-1 w-full rounded-md border border-[#263947] bg-[#0d161e] px-3 py-2 text-sm text-zinc-100">{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="text-xs text-zinc-400">Amount<input required name="amount" type="number" min="0.01" step="0.01" className="mt-1 w-full rounded-md border border-[#263947] bg-[#0d161e] px-3 py-2 text-sm text-zinc-100" placeholder="0.00" /></label>
            <label className="text-xs text-zinc-400">Due date<input required name="dueDate" type="date" className="mt-1 w-full rounded-md border border-[#263947] bg-[#0d161e] px-3 py-2 text-sm text-zinc-100" /></label>
            <label className="text-xs text-zinc-400">Notes (optional)<input name="notes" className="mt-1 w-full rounded-md border border-[#263947] bg-[#0d161e] px-3 py-2 text-sm text-zinc-100" /></label>
            <div className="md:col-span-2"><button disabled={saving} className="rounded-md bg-[#27b7df] px-4 py-2 text-sm font-semibold text-[#061116] disabled:opacity-50">{saving ? "Saving…" : "Add payment"}</button></div>
          </form>
        )}
        <section className="grid gap-3 md:grid-cols-3">
          {[["Monthly Due", monthlyDue, "Due in the displayed month"], ["Paid This Month", paidThisMonth, "Payments recorded in the displayed month"], ["Outstanding", outstanding, "All unpaid receivables"]].map(([label, value, detail]) => <div key={String(label)} className="rounded-lg border border-[#1d2c37] bg-[#080e14] p-4"><p className="text-xs text-zinc-500">{label}</p><p className="mt-2 text-2xl font-semibold text-zinc-100">{currency.format(Number(value) / 100)}</p><p className="mt-1 text-xs text-zinc-600">{detail}</p></div>)}
        </section>
        <section className="rounded-lg border border-[#1d2c37] bg-[#080e14]">
          <div className="flex items-center justify-between border-b border-[#1d2c37] px-4 py-3"><button onClick={() => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1)))} className="rounded px-2 py-1 text-zinc-400 hover:bg-zinc-900">←</button><h2 className="text-sm font-semibold text-zinc-100">{month.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</h2><button onClick={() => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)))} className="rounded px-2 py-1 text-zinc-400 hover:bg-zinc-900">→</button></div>
          <div className="grid grid-cols-7 border-l border-[#1d2c37]">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day} className="border-b border-r border-[#1d2c37] px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-600">{day}</div>)}{calendarDays.map((day) => { const key = day.toISOString().slice(0, 10); const entries = receivables.filter((item) => dateKey(item.dueDate) === key); const inMonth = day.getUTCMonth() === month.getUTCMonth(); return <div key={key} className={`min-h-24 border-b border-r border-[#1d2c37] p-1.5 ${inMonth ? "" : "bg-[#060a0f]/70"}`}><p className={`mb-1 text-xs ${inMonth ? "text-zinc-300" : "text-zinc-700"}`}>{day.getUTCDate()}</p><div className="space-y-1">{entries.map((item) => <div key={item.id} title={`${item.customerName} — ${currency.format(item.amountCents / 100)}`} className={`truncate rounded px-1.5 py-1 text-[10px] ${item.status === "PAID" ? "bg-emerald-950/60 text-emerald-300" : "bg-[#123a48] text-[#8be4f6]"}`}>{item.customerName} · {currency.format(item.amountCents / 100)}</div>)}</div></div>; })}</div>
        </section>
        <section className="overflow-hidden rounded-lg border border-[#1d2c37] bg-[#080e14]"><div className="border-b border-[#1d2c37] px-4 py-3"><h2 className="text-sm font-semibold text-zinc-100">Receivables</h2></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[#0d161e] text-xs uppercase tracking-wide text-zinc-600"><tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Due</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Status</th></tr></thead><tbody>{loading ? <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-500">Loading receivables…</td></tr> : receivables.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-500">No receivables yet. Add a payment to start tracking client revenue.</td></tr> : receivables.map((item) => <tr key={item.id} className="border-t border-[#1d2c37] text-zinc-300"><td className="px-4 py-3"><p>{item.customerName}</p>{item.client && <p className="mt-0.5 text-xs text-zinc-600">{item.client.name}</p>}</td><td className="px-4 py-3 text-zinc-400">{typeLabels[item.type]}</td><td className="px-4 py-3 text-zinc-400">{displayDate(item.dueDate)}</td><td className="px-4 py-3 text-right font-medium">{currency.format(item.amountCents / 100)}</td><td className="px-4 py-3"><button onClick={() => void setStatus(item)} className={`rounded-full px-2 py-1 text-xs font-medium ${item.status === "PAID" ? "bg-emerald-950/60 text-emerald-300" : "bg-amber-950/50 text-amber-300"}`}>{item.status === "PAID" ? "Paid" : "Owed"}</button></td></tr>)}</tbody></table></div></section>
      </div>
    </AppShell>
  );
}
