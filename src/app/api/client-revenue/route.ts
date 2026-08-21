import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const receivableSchema = z.object({
  customerName: z.string().trim().min(1, "Customer or deal name is required").max(160),
  clientId: z.string().cuid().nullable().optional(),
  type: z.enum(["RETAINER", "SETUP_FEE", "REV_SHARE", "OTHER"]),
  amountCents: z.coerce.number().int().positive("Amount must be greater than zero"),
  dueDate: z.coerce.date(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export async function GET() {
  const receivables = await prisma.clientReceivable.findMany({
    include: { client: { select: { id: true, name: true } } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(receivables);
}

export async function POST(request: Request) {
  const parsed = receivableSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payment details", issues: parsed.error.issues }, { status: 400 });
  }

  const clientId = parsed.data.clientId ?? null;
  if (clientId) {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) return NextResponse.json({ error: "Selected client was not found." }, { status: 400 });
  }

  const receivable = await prisma.clientReceivable.create({
    data: {
      customerName: parsed.data.customerName,
      clientId,
      type: parsed.data.type,
      amountCents: parsed.data.amountCents,
      dueDate: parsed.data.dueDate,
      notes: parsed.data.notes || null,
    },
    include: { client: { select: { id: true, name: true } } },
  });
  return NextResponse.json(receivable, { status: 201 });
}
