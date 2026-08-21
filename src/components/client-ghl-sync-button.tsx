"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ClientGhlSyncButton({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/clients/${clientId}/ghl-sync`, { method: "POST" });
      const result = await response.json().catch(() => ({}));
      setMessage(
        response.ok
          ? `GHL sync completed: ${result.providers.ghl.opportunities} opportunities and ${result.providers.ghl.contacts} contacts stored.`
          : result.providers?.ghl?.error ?? result.error ?? "GoHighLevel sync failed.",
      );
      if (response.ok) router.refresh();
    } catch {
      setMessage("Could not reach the sync API. Check your network connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="flex flex-wrap items-center gap-3"><button onClick={sync} disabled={busy} className="rounded-md border border-emerald-900 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300 disabled:opacity-50">{busy ? "Syncing GHL…" : "Sync GHL CRM leads"}</button>{message && <p className="text-xs text-zinc-500">{message}</p>}</div>;
}
