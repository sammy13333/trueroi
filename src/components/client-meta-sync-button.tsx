"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ClientMetaSyncButton({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/clients/${clientId}/sync`, { method: "POST" });
    const result = await response.json();
    setBusy(false);
    setMessage(response.ok ? "Meta sync completed." : result.providers?.meta?.error ?? result.error ?? "Meta sync failed.");
    router.refresh();
  }

  return <div className="flex flex-wrap items-center gap-3"><button onClick={sync} disabled={busy} className="rounded-md border border-[#1d5870] bg-[#0a2430] px-3 py-2 text-xs text-[#71d8ef] disabled:opacity-50">{busy ? "Syncing Meta…" : "Sync Meta data"}</button>{message && <p className="text-xs text-zinc-500">{message}</p>}</div>;
}
