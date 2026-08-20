"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ClientSyncAllButton({ clientCount }: { clientCount: number }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function syncAll() {
    setRunning(true);
    setMessage(null);
    const response = await fetch("/api/clients/sync-all", { method: "POST" });
    const result = await response.json();
    setRunning(false);
    const providerFailures = result.results?.filter((item: { status: string }) => item.status === "FAILED").map((item: { clientName: string; providers: { meta: { error?: string } } }) => `${item.clientName}: ${item.providers.meta.error}`).join(" ") ?? "";
    setMessage(response.ok ? `${result.message}${result.skipped?.length ? ` ${result.skipped.length} skipped.` : ""}${providerFailures ? ` ${providerFailures}` : ""}` : "Unable to sync the client accounts.");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {message && <span className="text-xs text-zinc-500">{message}</span>}
      <button onClick={syncAll} disabled={!clientCount || running} className="rounded-md border border-[#1d5870] bg-[#0a2430] px-3.5 py-2 text-xs font-medium text-[#71d8ef] disabled:cursor-not-allowed disabled:opacity-40">
        {running ? "Syncing clients…" : "Sync all clients"}
      </button>
    </div>
  );
}
