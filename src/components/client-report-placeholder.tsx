import Link from "next/link";
import { ClientSelector, selectedClientId } from "@/components/client-selector";
import { prisma } from "@/lib/prisma";

export async function ClientReportPlaceholder({
  section,
  title,
  description,
  searchParams,
}: {
  section: "attribution" | "insights";
  title: string;
  description: string;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const clients = await prisma.client.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true } });
  const clientId = selectedClientId(clients, searchParams.clientId);

  if (!clientId) {
    return <div className="m-5 grid min-h-80 place-items-center rounded-lg border border-[#272722] bg-[#0c0c0b] p-8 text-center sm:m-8"><div><h2 className="text-base font-medium text-zinc-200">No client account is available</h2><Link href="/clients/new" className="mt-5 inline-block text-xs text-[#71d8ef]">Add a client →</Link></div></div>;
  }

  const client = clients.find((item) => item.id === clientId)!;
  return (
    <div className="m-5 space-y-5 sm:m-8">
      <section className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs text-zinc-600">Client:</span>
        <ClientSelector clients={clients} clientId={client.id} path={`/${section}`} searchParams={searchParams} />
        <Link href={`/clients/${client.id}`} className="ml-auto text-xs text-zinc-500 hover:text-zinc-200">Client workspace</Link>
      </section>
      <div className="grid min-h-72 place-items-center rounded-lg border border-[#272722] bg-[#0c0c0b] p-8 text-center">
        <div className="max-w-md">
          <h2 className="text-base font-medium text-zinc-200">{title} for {client.name}</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-500">{description}</p>
        </div>
      </div>
    </div>
  );
}
