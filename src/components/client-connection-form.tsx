"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputClass = "mt-1.5 w-full rounded-md border border-[#302f2a] bg-[#090909] px-3 py-2.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-700 focus:border-[#d4af37]/70";

export function ClientConnectionForm() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", metaAdAccountId: "", metaAccessToken: "", ghlLocationId: "", ghlPrivateToken: "", industry: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const update = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const response = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
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
        <h2 className="text-sm font-medium text-zinc-200">Delivery sources</h2>
        <p className="mt-1 text-xs text-zinc-600">Identifiers are stored per client and are never used in Agency ROI reporting.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-medium text-zinc-400">Meta ad account ID<input required value={form.metaAdAccountId} onChange={(event) => update("metaAdAccountId")(event.target.value)} placeholder="act_…" className={inputClass} /></label>
          <label className="text-xs font-medium text-zinc-400">Meta access token<input required type="password" autoComplete="new-password" value={form.metaAccessToken} onChange={(event) => update("metaAccessToken")(event.target.value)} placeholder="Paste long-lived Meta token" className={inputClass} /></label>
          <label className="text-xs font-medium text-zinc-400">GHL location ID<input required value={form.ghlLocationId} onChange={(event) => update("ghlLocationId")(event.target.value)} placeholder="Location ID" className={inputClass} /></label>
          <label className="text-xs font-medium text-zinc-400">GHL private integration token<input required type="password" autoComplete="new-password" value={form.ghlPrivateToken} onChange={(event) => update("ghlPrivateToken")(event.target.value)} placeholder="Paste GHL private integration token" className={inputClass} /></label>
        </div>
        <p className="mt-4 text-[11px] leading-5 text-zinc-600">Tokens are encrypted before being stored and are never displayed after saving. Connection validation and manual syncing are available from the client workspace.</p>
      </section>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex justify-end"><button disabled={saving} className="rounded-md bg-[#d4af37] px-4 py-2.5 text-xs font-semibold text-black hover:bg-[#e2c457] disabled:opacity-60">{saving ? "Creating…" : "Create client workspace"}</button></div>
    </form>
  );
}
