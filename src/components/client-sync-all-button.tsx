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
    setMessage(response.ok ? `${result.message}${result.skipped?.length ? ` ${result.skipped.length} skipped.` : ""}` : "Unable to sync the client accounts.");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {message && <span className="text-xs text-zinc-500">{message}</span>}
      <button onClick={syncAll} disabled={!clientCount || running} className="rounded-md border border-[#3b3520] bg-[#16140d] px-3.5 py-2 text-xs font-medium text-[#e6c45a] disabled:cursor-not-allowed disabled:opacity-40">
        {running ? "Syncing clients…" : "Sync all clients"}
      </button>
    </div>
  );
}
