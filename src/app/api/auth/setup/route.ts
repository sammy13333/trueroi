import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { createSession, SESSION_COOKIE } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({ name: z.string().trim().min(1).max(100), email: z.string().trim().email(), password: z.string().min(12).max(128) });

export async function POST(request: Request) {
  if (await prisma.user.count()) return NextResponse.json({ error: "Owner account is already configured." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Use a valid email and a password with at least 12 characters." }, { status: 400 });
  const user = await prisma.user.create({ data: { name: parsed.data.name, email: parsed.data.email.toLowerCase(), passwordHash: await hash(parsed.data.password, 12), role: "OWNER" } });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createSession({ userId: user.id, email: user.email, role: user.role }), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
  return response;
}
