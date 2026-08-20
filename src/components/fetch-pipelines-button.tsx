"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function FetchPipelinesButton({ clientId }: { clientId: string }) {
  const router = useRouter(); const [message, setMessage] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function fetchPipelines() { setBusy(true); const response = await fetch(`/api/clients/${clientId}/pipelines`, { method: "POST" }); const data = await response.json(); setBusy(false); setMessage(response.ok ? `${data.count} pipelines imported.` : data.error); if (response.ok) router.refresh(); }
  return <div><button onClick={fetchPipelines} disabled={busy} className="rounded-md border px-3 py-2 text-xs text-[#e6c45a] disabled:opacity-50">{busy ? "Fetching pipelines…" : "Fetch GHL pipelines"}</button>{message && <p className="mt-2 text-xs text-zinc-500">{message}</p>}</div>;
}
