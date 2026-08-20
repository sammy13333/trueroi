"use client";

import { useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";

function Field({ label, placeholder, secret = false, value, onChange }: { label: string; placeholder: string; secret?: boolean; value?: string; onChange?: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-zinc-400">{label}</span>
      <input
        type={secret ? "password" : "text"}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        className="w-full rounded-md border border-[#263947] bg-[#080e14] px-3 py-2.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-700 focus:border-[#27b7df]/70"
      />
      {secret && <span className="mt-1.5 block text-[11px] text-zinc-600">Stored encrypted. This value is never displayed after saving.</span>}
    </label>
  );
}

export function AgencySettings() {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [settings, setSettings] = useState({ name: "", metaAdAccountId: "", ghlLocationId: "", defaultRevSharePct: "7.5" });
  const update = (key: keyof typeof settings) => (value: string) => setSettings((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setSaving(true);
    setNotice(null);
    const response = await fetch("/api/agency/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...settings, defaultRevSharePct: Number(settings.defaultRevSharePct) }),
    });
    setSaving(false);
    setSaved(response.ok);
    setNotice(response.ok ? "Connection identifiers saved. Add secure token storage before running a platform sync." : "Unable to save settings. Check the database connection.");
  };
  return (
    <AppShell>
      <PageHeader title="Agency settings" description="Connections, attribution mapping, and manual sync controls for the agency account." />
      <div className="mx-auto max-w-5xl px-5 py-7 sm:px-8">
        <div className="mb-6 rounded-lg border border-[#1d5870] bg-[#27b7df]/[.06] px-4 py-3 text-xs leading-5 text-[#a8ddea]">
          Credentials are not configured. Save connections before syncing. TrueROI by TundraWeb never exposes stored processor or platform secrets in the UI.
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-lg border border-[#272722] bg-[#0c0c0b] p-5">
            <div className="mb-5">
              <p className="text-sm font-medium text-zinc-200">Agency profile</p>
              <p className="mt-1 text-xs text-zinc-600">These settings are isolated from all client locations and accounts.</p>
            </div>
            <div className="space-y-4">
              <Field label="Agency name" placeholder="Your agency" value={settings.name} onChange={update("name")} />
              <Field label="Default revenue share %" placeholder="7.5" value={settings.defaultRevSharePct} onChange={update("defaultRevSharePct")} />
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-zinc-400">Default lead date basis</span>
                <select className="w-full rounded-md border border-[#263947] bg-[#080e14] px-3 py-2.5 text-sm text-zinc-400 outline-none focus:border-[#27b7df]/70">
                  <option>Lead created</option><option>Outcome date</option><option>Stage moved</option>
                </select>
              </label>
            </div>
          </section>
          <section className="rounded-lg border border-[#272722] bg-[#0c0c0b] p-5">
            <div className="mb-5">
              <p className="text-sm font-medium text-zinc-200">Meta Marketing API</p>
              <p className="mt-1 text-xs text-zinc-600">Sync hierarchy and daily campaign, ad set, and ad delivery metrics.</p>
            </div>
            <div className="space-y-4">
              <Field label="Ad account ID" placeholder="act_…" value={settings.metaAdAccountId} onChange={update("metaAdAccountId")} />
              <Field label="Access token" placeholder="Paste a long-lived token" secret />
              <div className="flex flex-wrap gap-2 pt-1">
                <button className="rounded-md bg-[#27b7df] px-3.5 py-2 text-xs font-semibold text-[#061116] opacity-50" disabled>Sync quick 30</button>
                <button className="rounded-md border px-3.5 py-2 text-xs text-zinc-500" disabled>Full sync</button>
              </div>
              <p className="text-[11px] text-zinc-600">Synces only when triggered. Campaign spend uses direct campaign metrics first, then an ID-based child rollup.</p>
            </div>
          </section>
          <section className="rounded-lg border border-[#272722] bg-[#0c0c0b] p-5">
            <div className="mb-5"><p className="text-sm font-medium text-zinc-200">GoHighLevel</p><p className="mt-1 text-xs text-zinc-600">Contacts, opportunities, tags, stages, and canonical agency leads.</p></div>
            <div className="space-y-4">
              <Field label="Location ID" placeholder="Location ID" value={settings.ghlLocationId} onChange={update("ghlLocationId")} />
              <Field label="API token" placeholder="Paste private integration token" secret />
              <Field label="Pipelines (up to 3)" placeholder="Comma-separated pipeline IDs" />
              <button className="rounded-md border px-3.5 py-2 text-xs text-zinc-500" disabled>Sync GHL</button>
            </div>
          </section>
          <section className="rounded-lg border border-[#272722] bg-[#0c0c0b] p-5">
            <div className="mb-5"><p className="text-sm font-medium text-zinc-200">Outcome & attribution rules</p><p className="mt-1 text-xs text-zinc-600">Tags have priority over stages. Highest outcome always wins.</p></div>
            <div className="space-y-3 text-xs text-zinc-500">
              <div className="rounded-md border bg-[#090909] p-3">Priority: Sold → No show → Showed → Booked → Canceled → Archived → Unqualified → Follow up → Lost → Not ready → Lead</div>
              <div className="rounded-md border bg-[#090909] p-3">Match order: campaign ID → ad set ID → ad ID → UTM campaign → UTM content → unambiguous campaign name.</div>
              <button className="text-[#27b7df] hover:text-[#71d8ef]">Configure stage & tag mappings →</button>
            </div>
          </section>
        </div>
        <div className="mt-6 flex items-center justify-end gap-3 border-t pt-5">
          {(saved || notice) && <span className={`text-xs ${saved ? "text-emerald-400" : "text-amber-300"}`}>{notice}</span>}
          <button onClick={save} disabled={saving} className="rounded-md bg-[#27b7df] px-4 py-2.5 text-xs font-semibold text-[#061116] hover:bg-[#55cae8] disabled:opacity-70">{saving ? "Saving…" : "Save agency settings"}</button>
        </div>
      </div>
    </AppShell>
  );
}
