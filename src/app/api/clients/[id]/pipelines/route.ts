import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/secrets";
import { z } from "zod";

const mappingSchema = z.object({ pipelines: z.array(z.object({ ghlId: z.string().min(1), selected: z.boolean(), bookedStageIds: z.array(z.string().min(1)) })).max(100) });

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
    await prisma.$transaction(pipelines.map((pipeline: { id: string; name: string; stages?: unknown[] }) => prisma.clientPipeline.upsert({
      where: { clientId_ghlId: { clientId: id, ghlId: pipeline.id } },
      create: { clientId: id, ghlId: pipeline.id, name: pipeline.name, stagesJson: JSON.stringify(pipeline.stages ?? []) },
      update: { name: pipeline.name, stagesJson: JSON.stringify(pipeline.stages ?? []) },
    })));
    return NextResponse.json({ count: pipelines.length, pipelines: pipelines.map((pipeline: { id: string; name: string; stages?: unknown[] }) => ({ id: pipeline.id, name: pipeline.name, stages: pipeline.stages ?? [] })) });
  } catch {
    return NextResponse.json({ error: "Unable to retrieve pipelines. Check the GHL token, scopes, and location ID." }, { status: 502 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = mappingSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid pipeline booking mapping." }, { status: 400 });
  const stored = await prisma.clientPipeline.findMany({ where: { clientId: id }, select: { ghlId: true } });
  const known = new Set(stored.map((pipeline) => pipeline.ghlId));
  if (parsed.data.pipelines.some((pipeline) => !known.has(pipeline.ghlId))) return NextResponse.json({ error: "Refresh GHL pipelines before saving mappings." }, { status: 400 });
  await prisma.$transaction(parsed.data.pipelines.map((pipeline) => prisma.clientPipeline.update({
    where: { clientId_ghlId: { clientId: id, ghlId: pipeline.ghlId } },
    data: { selected: pipeline.selected, bookedStageIdsJson: JSON.stringify([...new Set(pipeline.bookedStageIds)]) },
  })));
  return NextResponse.json({ ok: true });
}
