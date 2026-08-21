import { SignJWT, jwtVerify } from "jose";

const secretSource = process.env.AUTH_SECRET ?? process.env.DATABASE_URL ?? process.env.STORAGE_URL ?? "trueroi-development-only";
const secret = new TextEncoder().encode(secretSource);
export const SESSION_COOKIE = "trueroi_session";

export type Session = { userId: string; email: string; role: string };

export async function createSession(session: Session) {
  return new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function readSession(token?: string): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    if (typeof payload.userId !== "string" || typeof payload.email !== "string" || typeof payload.role !== "string") return null;
    return { userId: payload.userId, email: payload.email, role: payload.role };
  } catch {
    return null;
  }
}
