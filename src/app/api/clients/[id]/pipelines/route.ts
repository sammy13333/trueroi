import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/secrets";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await prisma.client.findUnique({ where: { id }, select: { ghlLocationId: true, ghlPrivateTokenEnc: true } });
  if (!client?.ghlLocationId || !client.ghlPrivateTokenEnc) return NextResponse.json({ error: "Save a GHL location ID and private integration token first." }, { status: 400 });
  try {
    const token = await decryptSecret(client.ghlPrivateTokenEnc);
    const response = await fetch(`https://services.leadconnectorhq.com/opportunities/pipelines?locationId=${encodeURIComponent(client.ghlLocationId)}`, {
      headers: { Authorization: `Bearer ${token}`, Version: "2021-07-28" },
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) return NextResponse.json({ error: payload.message ?? "GoHighLevel rejected the pipeline request." }, { status: response.status });
    const pipelines = Array.isArray(payload.pipelines) ? payload.pipelines : [];
    await prisma.$transaction([
      prisma.clientPipeline.deleteMany({ where: { clientId: id } }),
      prisma.clientPipeline.createMany({ data: pipelines.map((pipeline: { id: string; name: string; stages?: unknown[] }) => ({ clientId: id, ghlId: pipeline.id, name: pipeline.name, stagesJson: JSON.stringify(pipeline.stages ?? []) })) }),
    ]);
    return NextResponse.json({ count: pipelines.length, pipelines: pipelines.map((pipeline: { id: string; name: string; stages?: unknown[] }) => ({ id: pipeline.id, name: pipeline.name, stages: pipeline.stages ?? [] })) });
  } catch {
    return NextResponse.json({ error: "Unable to retrieve pipelines. Check the GHL token, scopes, and location ID." }, { status: 502 });
  }
}
