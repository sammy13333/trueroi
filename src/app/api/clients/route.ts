import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const createClientSchema = z.object({
  name: z.string().trim().min(1, "Client name is required").max(120),
  metaAdAccountId: z.string().trim().max(80).optional(),
  ghlLocationId: z.string().trim().max(120).optional(),
  industry: z.string().trim().max(80).optional(),
});

export async function GET() {
  const clients = await prisma.client.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, metaAdAccountId: true, ghlLocationId: true, industry: true, lifecycle: true, updatedAt: true },
  });
  return NextResponse.json(clients);
}

export async function POST(request: Request) {
  const parsed = createClientSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid client details", issues: parsed.error.issues }, { status: 400 });
  }
  const client = await prisma.client.create({ data: parsed.data });
  return NextResponse.json({ id: client.id, name: client.name }, { status: 201 });
}
