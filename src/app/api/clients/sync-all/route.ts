import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const clients = await prisma.client.findMany({
    select: { id: true, name: true, metaAccessTokenEnc: true, ghlPrivateTokenEnc: true },
  });
  const ready = clients.filter((client) => client.metaAccessTokenEnc && client.ghlPrivateTokenEnc);
  const incomplete = clients.filter((client) => !client.metaAccessTokenEnc || !client.ghlPrivateTokenEnc);

  if (ready.length) {
    await prisma.clientSyncLog.createMany({
      data: ready.map((client) => ({
        clientId: client.id,
        status: "PENDING",
        mode: "ALL",
        message: "Queued for Meta and GoHighLevel sync.",
      })),
    });
  }

  return NextResponse.json({
    queued: ready.length,
    incomplete: incomplete.map((client) => client.name),
    message: ready.length
      ? `${ready.length} client account${ready.length === 1 ? "" : "s"} queued for sync.`
      : "No fully configured client accounts to sync.",
  });
}
