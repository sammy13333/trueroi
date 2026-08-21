"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputClass = "mt-1.5 w-full rounded-md border border-[#263947] bg-[#080e14] px-3 py-2.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-700 focus:border-[#27b7df]/70";

export function ClientConnectionForm() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", industry: "", metaAdAccountId: "", metaAccessToken: "", metaPageId: "", metaLeadFormIds: "", ghlLocationId: "", ghlPrivateToken: "", ghlCalendarId: "", targetDealDollars: "5000", monthlyRetainerDollars: "", revSharePercent: "", setupFeeDollars: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const update = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const dollarsToCents = (value: string) => value ? Math.round(Number(value) * 100) : undefined;
    const response = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        targetDealCents: dollarsToCents(form.targetDealDollars),
        monthlyRetainerCents: dollarsToCents(form.monthlyRetainerDollars),
        setupFeeCents: dollarsToCents(form.setupFeeDollars),
        revSharePercent: form.revSharePercent ? Number(form.revSharePercent) : undefined,
      }),
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) {
      setError(result.error ?? "Could not save the client.");
      return;
    }
    router.push(`/clients/${result.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl space-y-5">
      <section className="rounded-lg border border-[#272722] bg-[#0c0c0b] p-5">
        <h2 className="text-sm font-medium text-zinc-200">Client account</h2>
        <p className="mt-1 text-xs text-zinc-600">Create an isolated client workspace before connecting delivery sources.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-medium text-zinc-400">Client name<input required value={form.name} onChange={(event) => update("name")(event.target.value)} placeholder="Acme Home Services" className={inputClass} /></label>
          <label className="text-xs font-medium text-zinc-400">Industry<input value={form.industry} onChange={(event) => update("industry")(event.target.value)} placeholder="Home services" className={inputClass} /></label>
        </div>
      </section>
      <section className="rounded-lg border border-[#272722] bg-[#0c0c0b] p-5">
        <h2 className="text-sm font-medium text-zinc-200">Meta integration</h2>
        <p className="mt-1 text-xs text-zinc-600">Required for campaigns, ad sets, ads, spend, and lead-form delivery data.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-medium text-zinc-400">Meta ad account ID<input required value={form.metaAdAccountId} onChange={(event) => update("metaAdAccountId")(event.target.value)} placeholder="act_…" className={inputClass} /></label>
          <label className="text-xs font-medium text-zinc-400">Meta access token<input required type="password" autoComplete="new-password" value={form.metaAccessToken} onChange={(event) => update("metaAccessToken")(event.target.value)} placeholder="Paste long-lived Meta token" className={inputClass} /></label>
          <label className="text-xs font-medium text-zinc-400">Meta page ID <span className="font-normal text-zinc-600">(optional)</span><input value={form.metaPageId} onChange={(event) => update("metaPageId")(event.target.value)} placeholder="Used to discover lead forms" className={inputClass} /></label>
          <label className="text-xs font-medium text-zinc-400">Meta lead form IDs <span className="font-normal text-zinc-600">(comma-separated, optional)</span><input value={form.metaLeadFormIds} onChange={(event) => update("metaLeadFormIds")(event.target.value)} placeholder="123456789, 987654321" className={inputClass} /></label>
        </div>
        <p className="mt-4 text-[11px] leading-5 text-zinc-600">The token is encrypted before storage and is never displayed after saving.</p>
      </section>
      <section className="rounded-lg border border-[#272722] bg-[#0c0c0b] p-5">
        <h2 className="text-sm font-medium text-zinc-200">GoHighLevel integration</h2>
        <p className="mt-1 text-xs text-zinc-600">Required for contacts, opportunities, stages, and outcome attribution.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-medium text-zinc-400">GoHighLevel location ID<input required value={form.ghlLocationId} onChange={(event) => update("ghlLocationId")(event.target.value)} placeholder="Location ID" className={inputClass} /></label>
          <label className="text-xs font-medium text-zinc-400">Private integration token<input required type="password" autoComplete="new-password" value={form.ghlPrivateToken} onChange={(event) => update("ghlPrivateToken")(event.target.value)} placeholder="pit-…" className={inputClass} /></label>
          <label className="text-xs font-medium text-zinc-400">Calendar ID <span className="font-normal text-zinc-600">(optional)</span><input value={form.ghlCalendarId} onChange={(event) => update("ghlCalendarId")(event.target.value)} placeholder="Calendar ID" className={inputClass} /></label>
        </div>
        <p className="mt-4 text-[11px] leading-5 text-zinc-600">The private integration token is encrypted before storage and is never displayed after saving.</p>
      </section>
      <section className="rounded-lg border border-[#272722] bg-[#0c0c0b] p-5">
        <h2 className="text-sm font-medium text-zinc-200">Revenue defaults</h2>
        <p className="mt-1 text-xs text-zinc-600">Optional planning values. Revenue is never auto-created from these fields.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-medium text-zinc-400">Target deal size ($)<input type="number" min="0" value={form.targetDealDollars} onChange={(event) => update("targetDealDollars")(event.target.value)} className={inputClass} /></label>
          <label className="text-xs font-medium text-zinc-400">Monthly retainer ($)<input type="number" min="0" value={form.monthlyRetainerDollars} onChange={(event) => update("monthlyRetainerDollars")(event.target.value)} placeholder="Optional" className={inputClass} /></label>
          <label className="text-xs font-medium text-zinc-400">Rev share percent<input type="number" min="0" max="100" step="0.1" value={form.revSharePercent} onChange={(event) => update("revSharePercent")(event.target.value)} placeholder="Optional" className={inputClass} /></label>
          <label className="text-xs font-medium text-zinc-400">Setup fee ($)<input type="number" min="0" value={form.setupFeeDollars} onChange={(event) => update("setupFeeDollars")(event.target.value)} placeholder="Optional" className={inputClass} /></label>
        </div>
      </section>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex justify-end"><button disabled={saving} className="rounded-md bg-[#27b7df] px-4 py-2.5 text-xs font-semibold text-[#061116] hover:bg-[#55cae8] disabled:opacity-60">{saving ? "Creating…" : "Create client workspace"}</button></div>
    </form>
  );
}
