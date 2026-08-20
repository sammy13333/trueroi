import Link from "next/link";
import { prisma } from "@/lib/prisma";

function displayContact(contact: { firstName: string | null; lastName: string | null; email: string | null; phone: string | null } | null) {
  const name = [contact?.firstName, contact?.lastName].filter(Boolean).join(" ");
  return { name: name || "Contact not returned by GHL", detail: contact?.email ?? contact?.phone ?? "No email or phone returned" };
}

function currency(cents: number | null) {
  return cents === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export async function ClientGhlLeadTracking({ requestedClientId }: { requestedClientId?: string | string[] }) {
  const clients = await prisma.client.findMany({ orderBy: { updatedAt: "desc" }, select: { id: true, name: true } });
  const requestedId = typeof requestedClientId === "string" ? requestedClientId : undefined;
  const clientId = clients.some((client) => client.id === requestedId) ? requestedId! : clients[0]?.id;
  if (!clientId) return <div className="m-5 grid min-h-80 place-items-center rounded-lg border border-[#272722] bg-[#0c0c0b] p-8 text-center sm:m-8"><div><h2 className="text-base font-medium text-zinc-200">No client account is available</h2><Link href="/clients/new" className="mt-5 inline-block text-xs text-[#71d8ef]">Add a client →</Link></div></div>;

  const [client, opportunities] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { id: true, name: true } }),
    prisma.clientGhlOpportunity.findMany({
      where: { clientId },
      orderBy: [{ sourceUpdatedAt: "desc" }, { updatedAt: "desc" }],
      take: 200,
      select: {
        id: true, name: true, status: true, pipelineStageName: true, monetaryValueCents: true, sourceCreatedAt: true,
        contact: { select: { firstName: true, lastName: true, email: true, phone: true } },
        pipeline: { select: { name: true } },
      },
    }),
  ]);

  return <div className="m-5 space-y-5 sm:m-8">
    <section className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-xs text-zinc-600">Client:</span>
      {clients.map((item) => <Link key={item.id} href={`/leads?clientId=${item.id}`} className={`rounded-md border px-3 py-1.5 text-xs ${item.id === client.id ? "border-[#27b7df]/50 bg-[#27b7df]/10 text-[#71d8ef]" : "bg-[#0d161e] text-zinc-400"}`}>{item.name}</Link>)}
      <Link href={`/clients/${client.id}`} className="ml-auto text-xs text-zinc-500 hover:text-zinc-200">Client workspace</Link>
    </section>
    <section className="overflow-hidden rounded-lg border border-[#272722] bg-[#0c0c0b]">
      <div className="border-b border-[#272722] px-4 py-3">
        <h2 className="text-sm font-medium text-zinc-200">{client.name} CRM opportunities</h2>
        <p className="mt-0.5 text-xs text-zinc-600">Synced from GoHighLevel. Meta delivery action counts are not CRM leads and are not shown here.</p>
      </div>
      {opportunities.length === 0 ? <div className="px-6 py-12 text-center"><p className="text-sm text-zinc-400">No GHL opportunities have been synced yet.</p><p className="mt-2 text-xs text-zinc-600">Use “Sync GHL CRM leads” in the client workspace after saving a location ID and private integration token.</p></div> : <div className="overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="bg-[#10100f] text-[10px] uppercase tracking-wide text-zinc-600"><tr><th className="min-w-48 px-4 py-3 font-medium">Contact</th><th className="min-w-48 px-3 py-3 font-medium">Opportunity</th><th className="min-w-40 px-3 py-3 font-medium">Source pipeline</th><th className="px-3 py-3 font-medium">Stage</th><th className="px-3 py-3 font-medium">Status</th><th className="numeric px-3 py-3 font-medium">Value</th><th className="px-4 py-3 font-medium">Created</th></tr></thead><tbody>{opportunities.map((opportunity) => { const contact = displayContact(opportunity.contact); return <tr key={opportunity.id} className="border-b border-[#272722] text-zinc-400 last:border-b-0"><td className="px-4 py-3"><p className="font-medium text-zinc-200">{contact.name}</p><p className="mt-1 text-[11px] text-zinc-600">{contact.detail}</p></td><td className="px-3 py-3 text-zinc-300">{opportunity.name ?? "Unnamed opportunity"}</td><td className="px-3 py-3">{opportunity.pipeline?.name ?? "Pipeline unavailable"}</td><td className="px-3 py-3">{opportunity.pipelineStageName ?? "Stage unavailable"}</td><td className="px-3 py-3">{opportunity.status ?? "Unknown"}</td><td className="numeric px-3 py-3">{currency(opportunity.monetaryValueCents)}</td><td className="px-4 py-3">{opportunity.sourceCreatedAt?.toISOString().slice(0, 10) ?? "—"}</td></tr>; })}</tbody></table></div>}
    </section>
  </div>;
}
