import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const settingsSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  metaAdAccountId: z.string().trim().max(80).optional(),
  ghlLocationId: z.string().trim().max(120).optional(),
  defaultRevSharePct: z.coerce.number().min(0).max(100).optional(),
  defaultDateBasis: z.enum(["lead_created", "outcome_date", "stage_moved"]).optional(),
});

export async function GET() {
  const profile = await prisma.agencyProfile.findUnique({ where: { id: "default" } });
  return NextResponse.json(profile ? {
    name: profile.name,
    metaAdAccountId: profile.metaAdAccountId,
    ghlLocationId: profile.ghlLocationId,
    defaultRevSharePct: profile.defaultRevSharePct,
    defaultDateBasis: profile.defaultDateBasis,
    configured: Boolean(profile.metaAccessTokenEnc || profile.ghlApiTokenEnc),
  } : null);
}

export async function PUT(request: Request) {
  const parsed = settingsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid agency settings", issues: parsed.error.issues }, { status: 400 });
  }
  const profile = await prisma.agencyProfile.upsert({
    where: { id: "default" },
    create: { id: "default", ...parsed.data },
    update: parsed.data,
  });
  return NextResponse.json({
    name: profile.name,
    metaAdAccountId: profile.metaAdAccountId,
    ghlLocationId: profile.ghlLocationId,
    defaultRevSharePct: profile.defaultRevSharePct,
    defaultDateBasis: profile.defaultDateBasis,
  });
}
