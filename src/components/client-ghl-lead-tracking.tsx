import Link from "next/link";
import { ClientSelector, selectedClientId } from "@/components/client-selector";
import { LocalDateTime } from "@/components/local-date-time";
import { resolveCrmAttribution, type AttributionOpportunity } from "@/lib/client-crm-attribution";
import { prisma } from "@/lib/prisma";

function displayContact(contact: { ghlId: string; firstName: string | null; lastName: string | null; email: string | null; phone: string | null } | null) {
  const name = [contact?.firstName, contact?.lastName].filter(Boolean).join(" ");
  return { name: name || "Name not returned by GHL", id: contact?.ghlId ?? "No contact ID returned", email: contact?.email, phone: contact?.phone };
}

function displayTags(value: string | null | undefined) {
  try {
    const parsed: unknown = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string" && Boolean(tag.trim())).join(", ") || "No tags" : "No tags";
  } catch {
    return "No tags";
  }
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

function evidenceValues(evidence: Array<{ scope: string; source: string; value: string }>) {
  return evidence.map((item) => `${item.scope} · ${item.source}: ${item.value}`);
}

export async function ClientGhlLeadTracking({ requestedClientId, searchParams }: { requestedClientId?: string | string[]; searchParams?: Record<string, string | string[] | undefined> }) {
  const clients = await prisma.client.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true } });
  const clientId = selectedClientId(clients, requestedClientId);
  if (!clientId) return <div className="m-5 grid min-h-80 place-items-center rounded-lg border border-[#272722] bg-[#0c0c0b] p-8 text-center sm:m-8"><div><h2 className="text-base font-medium text-zinc-200">No client account is available</h2><Link href="/clients/new" className="mt-5 inline-block text-xs text-[#71d8ef]">Add a client →</Link></div></div>;
  const parameter = (name: string) => typeof searchParams?.[name] === "string" ? searchParams[name] as string : undefined;
  const crmId = parameter("crmId");
  const crmLevel = parameter("crmLevel");
  const bookedOnly = parameter("booked") === "true";
  const start = parameter("startDate");
  const end = parameter("endDate");
  if (crmId && (crmLevel === "CAMPAIGN" || crmLevel === "ADSET" || crmLevel === "AD")) {
    const gte = start && /^\d{4}-\d{2}-\d{2}$/.test(start) ? new Date(`${start}T00:00:00.000Z`) : undefined;
    const lt = end && /^\d{4}-\d{2}-\d{2}$/.test(end) ? new Date(`${end}T00:00:00.000Z`) : undefined;
    if (lt) lt.setUTCDate(lt.getUTCDate() + 1);
    const leads = await prisma.clientCrmLead.findMany({
      where: {
        clientId, ...(bookedOnly ? { booked: true } : {}),
        ...(gte || lt ? { leadCreatedAt: { ...(gte ? { gte } : {}), ...(lt ? { lt } : {}) } } : {}),
        ...(crmLevel === "CAMPAIGN" ? { matchedCampaignId: crmId } : crmLevel === "ADSET" ? { matchedAdsetId: crmId } : { matchedAdId: crmId }),
      },
      orderBy: { leadCreatedAt: "desc" },
      select: {
        ghlContactId: true, ghlOpportunityId: true, leadCreatedAt: true,
        booked: true, attributionMethod: true, unmatchedReason: true, utmSource: true, utmMedium: true, utmCampaign: true, utmContent: true, utmTerm: true,
        campaignMetaId: true, adsetMetaId: true, adMetaId: true,
        contact: { select: { firstName: true, lastName: true, email: true, phone: true, tagsJson: true } },
      },
    });
    return <CrmLeadDrilldown clientId={clientId} clientName={(await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { name: true } })).name} leads={leads} bookedOnly={bookedOnly} />;
  }

  const [client, opportunities, campaigns, adsets, ads] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { id: true, name: true } }),
    prisma.clientGhlOpportunity.findMany({
      where: { clientId },
      orderBy: [{ sourceUpdatedAt: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true, name: true, status: true, pipelineStageName: true, monetaryValueCents: true, sourceCreatedAt: true,
        attributionSource: true, utmSource: true, utmMedium: true, utmCampaign: true, utmContent: true, utmTerm: true, campaignMetaId: true, adsetMetaId: true, adMetaId: true, attributionEvidenceJson: true,
        contact: { select: { ghlId: true, firstName: true, lastName: true, email: true, phone: true, tagsJson: true } },
        pipeline: { select: { name: true } },
      },
    }),
    prisma.clientMetaCampaign.findMany({ where: { clientId }, select: { id: true, metaId: true, name: true } }),
    prisma.clientMetaAdset.findMany({ where: { clientId }, select: { id: true, metaId: true, name: true, campaignId: true } }),
    prisma.clientMetaAd.findMany({ where: { clientId }, select: { id: true, metaId: true, name: true, adsetId: true } }),
  ]);

  return <div className="m-5 space-y-5 sm:m-8">
    <section className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-xs text-zinc-600">Client:</span>
      <ClientSelector clients={clients} clientId={client.id} path="/leads" searchParams={searchParams} />
      <Link href={`/clients/${client.id}`} className="ml-auto text-xs text-zinc-500 hover:text-zinc-200">Client workspace</Link>
    </section>
    <section className="overflow-hidden rounded-lg border border-[#272722] bg-[#0c0c0b]">
      <div className="border-b border-[#272722] px-4 py-3">
        <h2 className="text-sm font-medium text-zinc-200">{client.name} GoHighLevel contacts and opportunities</h2>
        <p className="mt-0.5 text-xs text-zinc-600">CRM outcomes use exact normalized live contact tags: “new lead” creates a CRM lead, while “booked appointment”, “appointment booked”, or “booked estimate” marks that lead booked. Meta delivery action counts are separate.</p>
      </div>
      {opportunities.length === 0 ? <div className="px-6 py-12 text-center"><p className="text-sm text-zinc-400">No GHL opportunities have been synced yet.</p><p className="mt-2 text-xs text-zinc-600">Save this client’s GHL location ID and private integration token, ensure it can read opportunities and contacts, then use “Sync GHL CRM leads” in the client workspace.</p></div> : <div className="overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="bg-[#10100f] text-[10px] uppercase tracking-wide text-zinc-600"><tr><th className="min-w-56 px-4 py-3 font-medium">Name / contact ID</th><th className="min-w-52 px-3 py-3 font-medium">Contact details</th><th className="min-w-48 px-3 py-3 font-medium">Opportunity</th><th className="min-w-40 px-3 py-3 font-medium">Pipeline</th><th className="min-w-48 px-3 py-3 font-medium">Contact tags</th><th className="min-w-64 px-3 py-3 font-medium">Attribution method / evidence</th><th className="min-w-64 px-3 py-3 font-medium">Unmatched reason</th><th className="px-3 py-3 font-medium">Status</th><th className="numeric px-3 py-3 font-medium">Value</th><th className="min-w-44 px-4 py-3 font-medium">Lead received</th></tr></thead><tbody>{opportunities.map((opportunity) => { const contact = displayContact(opportunity.contact); const rawAttribution = attributionValues(opportunity); const resolution = resolveCrmAttribution(opportunity as AttributionOpportunity, { campaigns, adsets, ads }); const evidence = evidenceValues(resolution.evidence); return <tr key={opportunity.id} className="border-b border-[#272722] text-zinc-400 last:border-b-0"><td className="px-4 py-3"><p className="font-medium text-zinc-200">{contact.name}</p><p className="mt-1 font-mono text-[10px] text-zinc-600">{contact.id}</p></td><td className="px-3 py-3 text-[11px] text-zinc-500">{contact.email && <p>{contact.email}</p>}{contact.phone && <p className={contact.email ? "mt-1" : ""}>{contact.phone}</p>}{!contact.email && !contact.phone && <p>Not returned by GHL</p>}</td><td className="px-3 py-3 text-zinc-300">{opportunity.name ?? "Unnamed opportunity"}</td><td className="px-3 py-3">{opportunity.pipeline?.name ?? "Pipeline unavailable"}</td><td className="px-3 py-3 text-[11px] text-zinc-500">{displayTags(opportunity.contact?.tagsJson)}</td><td className="px-3 py-3 text-[11px] text-zinc-500">{resolution.method && <p className="mb-1 text-emerald-300">{resolution.method}</p>}{evidence.length ? evidence.map((value) => <p key={value} className="mb-1 break-all last:mb-0">{value}</p>) : rawAttribution.length ? rawAttribution.map((value) => <p key={value} className="mb-1 last:mb-0">{value}</p>) : "No attribution evidence returned"}</td><td className="px-3 py-3 text-[11px] text-zinc-500">{resolution.unmatchedReason ?? "Matched"}</td><td className="px-3 py-3">{opportunity.status ?? "Unknown"}</td><td className="numeric px-3 py-3">{currency(opportunity.monetaryValueCents)}</td><td className="px-4 py-3"><LocalDateTime value={opportunity.sourceCreatedAt?.toISOString() ?? null} /></td></tr>; })}</tbody></table></div>}
    </section>
  </div>;
}

function CrmLeadDrilldown({
  clientId, clientName, leads, bookedOnly,
}: {
  clientId: string;
  clientName: string;
  bookedOnly: boolean;
  leads: Array<{
    ghlContactId: string; ghlOpportunityId: string | null; leadCreatedAt: Date | null;
    booked: boolean; attributionMethod: string | null; unmatchedReason: string | null; utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; utmContent: string | null; utmTerm: string | null;
    campaignMetaId: string | null; adsetMetaId: string | null; adMetaId: string | null;
    contact: { firstName: string | null; lastName: string | null; email: string | null; phone: string | null; tagsJson: string };
  }>;
}) {
  return <div className="m-5 space-y-5 sm:m-8">
    <div className="flex items-center justify-between"><div><h2 className="text-base font-medium text-zinc-200">{bookedOnly ? "Booked CRM lead drilldown" : "CRM lead drilldown"}</h2><p className="mt-1 text-xs text-zinc-600">{clientName} · one persisted acquisition record per GHL contact</p></div><Link href={`/leads?clientId=${clientId}`} className="text-xs text-[#71d8ef]">All opportunities →</Link></div>
    <section className="overflow-x-auto rounded-lg border border-[#272722] bg-[#0c0c0b]"><table className="min-w-full text-left text-xs"><thead className="bg-[#10100f] text-[10px] uppercase tracking-wide text-zinc-600"><tr><th className="px-4 py-3">Lead / GHL IDs</th><th className="px-3 py-3">Opportunity</th><th className="px-3 py-3">Lead date</th><th className="px-3 py-3">Contact tags</th><th className="px-3 py-3">Booked</th><th className="px-3 py-3">Meta hierarchy</th><th className="min-w-64 px-3 py-3">UTM / method</th></tr></thead><tbody>{leads.map((lead) => { const name = [lead.contact.firstName, lead.contact.lastName].filter(Boolean).join(" ") || "Name not returned by GHL"; return <tr key={lead.ghlContactId} className="border-t border-[#272722] text-zinc-400"><td className="px-4 py-3"><p className="font-medium text-zinc-200">{name}</p><p className="font-mono text-[10px] text-zinc-600">Contact {lead.ghlContactId}</p>{lead.contact.email && <p className="text-[11px]">{lead.contact.email}</p>}</td><td className="px-3 py-3 font-mono text-[10px]">{lead.ghlOpportunityId ?? "No opportunity"}</td><td className="px-3 py-3"><LocalDateTime value={lead.leadCreatedAt?.toISOString() ?? null} /></td><td className="px-3 py-3 text-[11px] text-zinc-500">{displayTags(lead.contact.tagsJson)}</td><td className="px-3 py-3">{lead.booked ? "Yes" : "No"}</td><td className="px-3 py-3 font-mono text-[10px]">{[lead.campaignMetaId, lead.adsetMetaId, lead.adMetaId].filter(Boolean).join(" / ") || "Name/UTM match"}</td><td className="px-3 py-3 text-[11px]">{[lead.utmSource && `source=${lead.utmSource}`, lead.utmMedium && `medium=${lead.utmMedium}`, lead.utmCampaign && `campaign=${lead.utmCampaign}`, lead.utmContent && `content=${lead.utmContent}`, lead.utmTerm && `term=${lead.utmTerm}`].filter(Boolean).map((item) => <p key={item}>{item}</p>)}<p className="mt-1 text-emerald-300">{lead.attributionMethod ?? lead.unmatchedReason ?? "No attribution method"}</p></td></tr>; })}</tbody></table>{leads.length === 0 && <p className="p-8 text-center text-sm text-zinc-500">No matching canonical CRM leads in this cohort.</p>}</section>
  </div>;
}
