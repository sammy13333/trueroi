import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const updateStatusSchema = z.object({
  status: z.enum(["OWED", "PAID"]),
  paidDate: z.coerce.date().nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const parsed = updateStatusSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payment status", issues: parsed.error.issues }, { status: 400 });
  }

  const { id } = await params;
  try {
    const receivable = await prisma.clientReceivable.update({
      where: { id },
      data: {
        status: parsed.data.status,
        paidDate: parsed.data.status === "PAID" ? (parsed.data.paidDate ?? new Date()) : null,
      },
      include: { client: { select: { id: true, name: true } } },
    });
    return NextResponse.json(receivable);
  } catch {
    return NextResponse.json({ error: "Payment was not found." }, { status: 404 });
  }
}
