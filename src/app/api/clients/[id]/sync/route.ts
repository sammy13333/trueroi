import { NextResponse } from "next/server";
import { syncClientMeta } from "@/lib/client-meta-sync";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await syncClientMeta(id);
  if (!result) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  return NextResponse.json(result, { status: result.status === "COMPLETED" ? 200 : 422 });
}
