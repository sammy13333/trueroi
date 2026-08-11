import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/secrets";

const createClientSchema = z.object({
  name: z.string().trim().min(1, "Client name is required").max(120),
  metaAdAccountId: z.string().trim().max(80).optional(),
  metaAccessToken: z.string().trim().min(20, "Enter a valid Meta access token").max(2000),
  ghlLocationId: z.string().trim().max(120).optional(),
  ghlPrivateToken: z.string().trim().min(20, "Enter a valid GoHighLevel private integration token").max(2000),
  metaPageId: z.string().trim().max(100).optional(),
  metaLeadFormIds: z.string().trim().max(1000).optional(),
  ghlCalendarId: z.string().trim().max(120).optional(),
  industry: z.string().trim().max(80).optional(),
  targetDealCents: z.coerce.number().int().min(0).optional(),
  monthlyRetainerCents: z.coerce.number().int().min(0).optional(),
  revSharePercent: z.coerce.number().min(0).max(100).optional(),
  setupFeeCents: z.coerce.number().int().min(0).optional(),
});

export async function GET() {
  const clients = await prisma.client.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, metaAdAccountId: true, metaPageId: true, metaLeadFormIds: true, ghlLocationId: true, ghlCalendarId: true, industry: true, lifecycle: true, targetDealCents: true, monthlyRetainerCents: true, revSharePercent: true, setupFeeCents: true, updatedAt: true },
  });
  return NextResponse.json(clients);
}

export async function POST(request: Request) {
  const parsed = createClientSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid client details", issues: parsed.error.issues }, { status: 400 });
  }
  let metaAccessTokenEnc: string;
  let ghlPrivateTokenEnc: string;
  try {
    [metaAccessTokenEnc, ghlPrivateTokenEnc] = await Promise.all([
      encryptSecret(parsed.data.metaAccessToken),
      encryptSecret(parsed.data.ghlPrivateToken),
    ]);
  } catch {
    return NextResponse.json({ error: "Secure credential storage is unavailable." }, { status: 500 });
  }
  const client = await prisma.client.create({
    data: {
      name: parsed.data.name,
      industry: parsed.data.industry,
      metaAdAccountId: parsed.data.metaAdAccountId,
      ghlLocationId: parsed.data.ghlLocationId,
      metaPageId: parsed.data.metaPageId,
      metaLeadFormIds: parsed.data.metaLeadFormIds,
      ghlCalendarId: parsed.data.ghlCalendarId,
      targetDealCents: parsed.data.targetDealCents,
      monthlyRetainerCents: parsed.data.monthlyRetainerCents,
      revSharePercent: parsed.data.revSharePercent,
      setupFeeCents: parsed.data.setupFeeCents,
      metaAccessTokenEnc,
      ghlPrivateTokenEnc,
    },
  });
  return NextResponse.json({ id: client.id, name: client.name }, { status: 201 });
}
