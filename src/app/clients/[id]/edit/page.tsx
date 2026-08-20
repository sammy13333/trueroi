import { notFound } from "next/navigation";
import { AppShell, PageHeader } from "@/components/app-shell";
import { ClientEditTokens } from "@/components/client-edit-tokens";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await prisma.client.findUnique({ where: { id }, select: { id: true, name: true, metaAccessTokenEnc: true, ghlPrivateTokenEnc: true } });
  if (!client) notFound();
  return <AppShell><PageHeader eyebrow="Client ROI" title={`Edit ${client.name}`} description="Replace credentials, then fetch real GoHighLevel pipelines from the client workspace." /><div className="m-5 max-w-3xl sm:m-8"><ClientEditTokens clientId={client.id} hasGhlToken={Boolean(client.ghlPrivateTokenEnc)} hasMetaToken={Boolean(client.metaAccessTokenEnc)} /></div></AppShell>;
}
