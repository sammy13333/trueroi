"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AuthForm({ setup = false }: { setup?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch(`/api/auth/${setup ? "setup" : "login"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const result = await response.json(); setBusy(false);
    if (!response.ok) return setError(result.error ?? "Unable to sign in.");
    router.push("/agency"); router.refresh();
  }
  return <form onSubmit={submit} className="mx-auto mt-20 max-w-sm rounded-xl border border-[#1d2c37] bg-[#0d161e] p-6">
    <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#27b7df]">TrueROI by TundraWeb</p>
    <h1 className="mt-2 text-xl font-semibold">{setup ? "Create owner account" : "Sign in"}</h1>
    <p className="mt-2 text-sm text-zinc-500">{setup ? "This first account controls the workspace." : "Use your TrueROI by TundraWeb email and password."}</p>
    <div className="mt-6 space-y-3">
      {setup && <input name="name" required placeholder="Your name" className="w-full rounded-md border border-[#263947] bg-[#080e14] px-3 py-2.5 text-sm" />}
      <input name="email" required type="email" placeholder="Email address" className="w-full rounded-md border border-[#263947] bg-[#080e14] px-3 py-2.5 text-sm" />
      <input name="password" required type="password" minLength={setup ? 12 : 1} placeholder={setup ? "Password (12+ characters)" : "Password"} className="w-full rounded-md border border-[#263947] bg-[#080e14] px-3 py-2.5 text-sm" />
    </div>
    {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    <button disabled={busy} className="mt-5 w-full rounded-md bg-[#27b7df] px-3 py-2.5 text-sm font-semibold text-[#061116] hover:bg-[#55cae8] disabled:opacity-60">{busy ? "Please wait…" : setup ? "Create owner account" : "Sign in"}</button>
  </form>;
}
