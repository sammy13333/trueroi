import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/secrets";

const schema = z.object({ ghlPrivateToken: z.string().trim().min(20).optional(), metaAccessToken: z.string().trim().min(20).optional() });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid replacement token." }, { status: 400 });
  const data: { ghlPrivateTokenEnc?: string; metaAccessTokenEnc?: string } = {};
  if (parsed.data.ghlPrivateToken) data.ghlPrivateTokenEnc = await encryptSecret(parsed.data.ghlPrivateToken);
  if (parsed.data.metaAccessToken) data.metaAccessTokenEnc = await encryptSecret(parsed.data.metaAccessToken);
  await prisma.client.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}
