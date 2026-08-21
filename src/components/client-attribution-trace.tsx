"use client";

import { useState } from "react";

type Trace = {
  contactId: string;
  liveAttributionRaw: Array<{ path: string; value: string }>;
  customFields: Array<{ id: string; name: string | null; value: string; resolved: boolean }>;
  customFieldDefinitionStatus: string;
  extraction: Array<{ source: string; extractedField: string; rawValue: string | null; normalizedValue: string | null; canonicalField: string }>;
  stored: { contact: Record<string, unknown> | null; opportunities: Array<Record<string, unknown>>; canonicalLead: Record<string, unknown> | null };
  metaCandidates: { values: Array<{ field: string; original: string | null; normalized: string | null; exactMatches: string[] }>; resolution: { method: string | null; unmatchedReason: string | null } | null; matchedHierarchy: Record<string, unknown> | null };
  reporting: { range: { start: string; end: string }; leadCreatedAt: string | null; dateQualifies: boolean; countedAtCampaignLevel: boolean; parentRollup: Record<string, unknown> | null };
  rootCause: { code: string; evidence: string };
};

function Value({ value }: { value: unknown }) {
  return <code className="break-all text-[11px] text-zinc-400">{value === null || value === undefined || value === "" ? "—" : typeof value === "string" ? value : JSON.stringify(value)}</code>;
}

export function ClientAttributionTrace({ clientId }: { clientId: string }) {
  const [contactId, setContactId] = useState("");
  const [trace, setTrace] = useState<Trace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function runTrace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(null); setTrace(null);
    try {
      const response = await fetch(`/api/clients/${clientId}/attribution-trace`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactId }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) setError(result.error ?? "The attribution trace could not be completed.");
      else setTrace(result as Trace);
    } catch {
      setError("Could not reach the attribution trace API.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="overflow-hidden rounded-lg border border-[#3c2a0a] bg-[#100d07]">
    <div className="border-b border-[#3c2a0a] px-4 py-3">
      <h2 className="text-sm font-medium text-amber-100">Owner-only Attribution Trace</h2>
      <p className="mt-1 text-xs text-amber-200/60">Fetches this contact from GoHighLevel without storing it. The response excludes names, email, phone, tokens, headers, and unrelated contact fields.</p>
    </div>
    <form onSubmit={runTrace} className="flex flex-wrap items-end gap-2 px-4 py-4">
      <label className="text-xs text-zinc-400">GHL Contact ID<input required value={contactId} onChange={(event) => setContactId(event.target.value)} className="mt-1 block w-72 rounded-md border border-[#4b3820] bg-[#090806] px-3 py-2 font-mono text-xs text-zinc-200" /></label>
      <button disabled={busy} className="rounded-md border border-amber-900 bg-amber-950/40 px-3 py-2 text-xs text-amber-200 disabled:opacity-50">{busy ? "Tracing…" : "Trace attribution"}</button>
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    </form>
    {trace && <div className="space-y-4 border-t border-[#3c2a0a] p-4 text-xs">
      <p className="font-mono text-zinc-500">Contact ID: {trace.contactId}</p>
      <TraceSection title="Live attribution-only raw fields">{trace.liveAttributionRaw.length ? trace.liveAttributionRaw.map((item) => <Row key={item.path} label={item.path} value={item.value} />) : <Empty />}</TraceSection>
      <TraceSection title="Relevant GoHighLevel custom fields" note={trace.customFieldDefinitionStatus}>{trace.customFields.length ? trace.customFields.map((item) => <div key={`${item.id}-${item.value}`} className="border-b border-[#302514] py-2 last:border-0"><Row label="ID" value={item.id} /><Row label="Resolved name" value={item.name ?? "Unresolved"} /><Row label="Value" value={item.value} /></div>) : <Empty />}</TraceSection>
      <TraceSection title="Extraction trace (same extractor used by GHL sync)">{trace.extraction.length ? trace.extraction.map((item, index) => <div key={`${item.source}-${index}`} className="border-b border-[#302514] py-2 last:border-0"><Row label="Raw field" value={item.source} /><Row label="Extracted field" value={item.extractedField} /><Row label="Raw value" value={item.rawValue} /><Row label="Normalized value" value={item.normalizedValue} /><Row label="Canonical field" value={item.canonicalField} /></div>) : <Empty />}</TraceSection>
      <TraceSection title="Stored CRM records (non-PII)"><Record label="Stored contact" value={trace.stored.contact} /><Record label="Stored opportunities" value={trace.stored.opportunities} /><Record label="Canonical ClientCrmLead" value={trace.stored.canonicalLead} /></TraceSection>
      <TraceSection title="Meta candidate trace">{trace.metaCandidates.values.length ? trace.metaCandidates.values.map((item) => <div key={item.field} className="border-b border-[#302514] py-2 last:border-0"><Row label="Field" value={item.field} /><Row label="Original" value={item.original} /><Row label="Normalized" value={item.normalized} /><Row label="Exact matches" value={item.exactMatches.join(", ") || "None"} /></div>) : <Empty />}<Row label="Match method" value={trace.metaCandidates.resolution?.method} /><Row label="Match reason" value={trace.metaCandidates.resolution?.unmatchedReason ?? "Matched"} /><Record label="Matched hierarchy" value={trace.metaCandidates.matchedHierarchy} /></TraceSection>
      <TraceSection title="Reporting trace"><Row label="Current Ads cohort" value={`${trace.reporting.range.start} through ${trace.reporting.range.end} UTC`} /><Row label="Canonical lead-created date" value={trace.reporting.leadCreatedAt} /><Row label="Date qualifies" value={String(trace.reporting.dateQualifies)} /><Row label="Canonical lead counted by campaign metrics" value={String(trace.reporting.countedAtCampaignLevel)} /><Record label="Parent rollup" value={trace.reporting.parentRollup} /></TraceSection>
      <TraceSection title={`Evidence-based root cause: ${trace.rootCause.code}`}><p className="text-zinc-400">{trace.rootCause.evidence}</p></TraceSection>
    </div>}
  </section>;
}

function TraceSection({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) { return <section className="rounded border border-[#302514] bg-[#0b0906] p-3"><h3 className="font-medium text-zinc-200">{title}</h3>{note && <p className="mt-1 text-[11px] text-zinc-500">{note}</p>}<div className="mt-2 space-y-1">{children}</div></section>; }
function Row({ label, value }: { label: string; value: unknown }) { return <p className="grid grid-cols-[10rem_1fr] gap-2"><span className="text-zinc-600">{label}</span><Value value={value} /></p>; }
function Record({ label, value }: { label: string; value: unknown }) { return <div className="py-1"><span className="text-zinc-600">{label}: </span><Value value={value} /></div>; }
function Empty() { return <p className="text-zinc-600">No attribution-related data was returned.</p>; }
