import Link from "next/link";
import { ClientSelector, selectedClientId } from "@/components/client-selector";
import { LocalDateTime } from "@/components/local-date-time";
import { prisma } from "@/lib/prisma";

function displayContact(contact: { ghlId: string; firstName: string | null; lastName: string | null; email: string | null; phone: string | null } | null) {
  const name = [contact?.firstName, contact?.lastName].filter(Boolean).join(" ");
  return { name: name || "Name not returned by GHL", id: contact?.ghlId ?? "No contact ID returned", email: contact?.email, phone: contact?.phone };
}

function currency(cents: number | null) {
  return cents === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function attributionValues(opportunity: {
  attributionSource: string | null; utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; utmContent: string | null; utmTerm: string | null;
}) {
  return [
    opportunity.attributionSource && `Source: ${opportunity.attributionSource}`,
    opportunity.utmSource && `UTM source: ${opportunity.utmSource}`,
    opportunity.utmMedium && `UTM medium: ${opportunity.utmMedium}`,
    opportunity.utmCampaign && `UTM campaign: ${opportunity.utmCampaign}`,
    opportunity.utmContent && `UTM content: ${opportunity.utmContent}`,
    opportunity.utmTerm && `UTM term: ${opportunity.utmTerm}`,
  ].filter(Boolean);
}

export async function ClientGhlLeadTracking({ requestedClientId, searchParams }: { requestedClientId?: string | string[]; searchParams?: Record<string, string | string[] | undefined> }) {
  const clients = await prisma.client.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true } });
  const clientId = selectedClientId(clients, requestedClientId);
  if (!clientId) return <div className="m-5 grid min-h-80 place-items-center rounded-lg border border-[#272722] bg-[#0c0c0b] p-8 text-center sm:m-8"><div><h2 className="text-base font-medium text-zinc-200">No client account is available</h2><Link href="/clients/new" className="mt-5 inline-block text-xs text-[#71d8ef]">Add a client →</Link></div></div>;

  const [client, opportunities] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { id: true, name: true } }),
    prisma.clientGhlOpportunity.findMany({
      where: { clientId },
      orderBy: [{ sourceUpdatedAt: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true, name: true, status: true, pipelineStageName: true, monetaryValueCents: true, sourceCreatedAt: true,
        attributionSource: true, utmSource: true, utmMedium: true, utmCampaign: true, utmContent: true, utmTerm: true,
        contact: { select: { ghlId: true, firstName: true, lastName: true, email: true, phone: true } },
        pipeline: { select: { name: true } },
      },
    }),
  ]);

  return <div className="m-5 space-y-5 sm:m-8">
    <section className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-xs text-zinc-600">Client:</span>
      <ClientSelector clients={clients} clientId={client.id} path="/leads" searchParams={searchParams} />
      <Link href={`/clients/${client.id}`} className="ml-auto text-xs text-zinc-500 hover:text-zinc-200">Client workspace</Link>
    </section>
    <section className="overflow-hidden rounded-lg border border-[#272722] bg-[#0c0c0b]">
      <div className="border-b border-[#272722] px-4 py-3">
        <h2 className="text-sm font-medium text-zinc-200">{client.name} CRM opportunities</h2>
        <p className="mt-0.5 text-xs text-zinc-600">All stored GoHighLevel opportunities for this client. Meta delivery action counts are not CRM leads and are not shown here.</p>
      </div>
      {opportunities.length === 0 ? <div className="px-6 py-12 text-center"><p className="text-sm text-zinc-400">No GHL opportunities have been synced yet.</p><p className="mt-2 text-xs text-zinc-600">Save this client’s GHL location ID and private integration token, ensure it can read opportunities and contacts, then use “Sync GHL CRM leads” in the client workspace.</p></div> : <div className="overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="bg-[#10100f] text-[10px] uppercase tracking-wide text-zinc-600"><tr><th className="min-w-56 px-4 py-3 font-medium">Name / contact ID</th><th className="min-w-52 px-3 py-3 font-medium">Contact details</th><th className="min-w-48 px-3 py-3 font-medium">Opportunity</th><th className="min-w-40 px-3 py-3 font-medium">Pipeline</th><th className="px-3 py-3 font-medium">Stage</th><th className="min-w-56 px-3 py-3 font-medium">Attribution</th><th className="px-3 py-3 font-medium">Status</th><th className="numeric px-3 py-3 font-medium">Value</th><th className="min-w-44 px-4 py-3 font-medium">Lead received</th></tr></thead><tbody>{opportunities.map((opportunity) => { const contact = displayContact(opportunity.contact); const attribution = attributionValues(opportunity); return <tr key={opportunity.id} className="border-b border-[#272722] text-zinc-400 last:border-b-0"><td className="px-4 py-3"><p className="font-medium text-zinc-200">{contact.name}</p><p className="mt-1 font-mono text-[10px] text-zinc-600">{contact.id}</p></td><td className="px-3 py-3 text-[11px] text-zinc-500">{contact.email && <p>{contact.email}</p>}{contact.phone && <p className={contact.email ? "mt-1" : ""}>{contact.phone}</p>}{!contact.email && !contact.phone && <p>Not returned by GHL</p>}</td><td className="px-3 py-3 text-zinc-300">{opportunity.name ?? "Unnamed opportunity"}</td><td className="px-3 py-3">{opportunity.pipeline?.name ?? "Pipeline unavailable"}</td><td className="px-3 py-3">{opportunity.pipelineStageName ?? "Stage unavailable"}</td><td className="px-3 py-3 text-[11px] text-zinc-500">{attribution.length ? attribution.map((value) => <p key={value} className="mb-1 last:mb-0">{value}</p>) : "—"}</td><td className="px-3 py-3">{opportunity.status ?? "Unknown"}</td><td className="numeric px-3 py-3">{currency(opportunity.monetaryValueCents)}</td><td className="px-4 py-3"><LocalDateTime value={opportunity.sourceCreatedAt?.toISOString() ?? null} /></td></tr>; })}</tbody></table></div>}
    </section>
  </div>;
}
