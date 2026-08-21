import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { readSession, SESSION_COOKIE } from "@/lib/auth";
import { buildClientAttributionTrace } from "@/lib/client-attribution-trace";
import { prisma } from "@/lib/prisma";

const requestSchema = z.object({ contactId: z.string().trim().min(1).max(256) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { role: true } });
  if (user?.role !== "OWNER") return NextResponse.json({ error: "Only an OWNER may run an attribution trace." }, { status: 403 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid GoHighLevel contact ID." }, { status: 400 });
  const { id: clientId } = await params;
  const result = await buildClientAttributionTrace(clientId, parsed.data.contactId);
  return "trace" in result
    ? NextResponse.json(result.trace, { headers: { "Cache-Control": "no-store" } })
    : NextResponse.json({ error: result.error }, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
