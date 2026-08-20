import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncClientMeta } from "@/lib/client-meta-sync";

export async function POST() {
  const clients = await prisma.client.findMany({
    select: { id: true, name: true, metaAdAccountId: true, metaAccessTokenEnc: true },
  });
  const ready = clients.filter((client) => client.metaAdAccountId && client.metaAccessTokenEnc);
  const incomplete = clients.filter((client) => !client.metaAdAccountId || !client.metaAccessTokenEnc);

  const results = [];
  for (const client of ready) {
    const result = await syncClientMeta(client.id);
    if (result) results.push(result);
  }

  const completed = results.filter((result) => result.status === "COMPLETED").length;
  const failed = results.length - completed;
  return NextResponse.json({
    completed,
    failed,
    skipped: incomplete.map((client) => ({ clientId: client.id, name: client.name, error: "Meta ad account ID or access token is missing." })),
    results,
    message: ready.length
      ? `${completed} client account${completed === 1 ? "" : "s"} synced${failed ? `; ${failed} failed` : ""}.`
      : "No clients have a complete Meta connection to sync.",
  });
}
