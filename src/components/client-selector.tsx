type ClientOption = {
  id: string;
  name: string;
};

type SearchParams = Record<string, string | string[] | undefined>;

export function selectedClientId(clients: ClientOption[], requestedClientId?: string | string[]) {
  const requestedId = typeof requestedClientId === "string" ? requestedClientId : undefined;
  return clients.some((client) => client.id === requestedId) ? requestedId! : clients[0]?.id;
}

export function ClientSelector({
  clients,
  clientId,
  path,
  searchParams = {},
}: {
  clients: ClientOption[];
  clientId: string;
  path: string;
  searchParams?: SearchParams;
}) {
  return (
    <form action={path} className="flex flex-wrap items-center gap-2">
      {Object.entries(searchParams).flatMap(([key, value]) => {
        if (key === "clientId" || value === undefined) return [];
        const values = Array.isArray(value) ? value : [value];
        return values.map((item, index) => <input key={`${key}-${index}`} type="hidden" name={key} value={item} />);
      })}
      <label className="sr-only" htmlFor="client-selector">Client</label>
      <select
        id="client-selector"
        name="clientId"
        defaultValue={clientId}
        className="rounded-md border border-[#263947] bg-[#0d161e] px-3 py-1.5 text-xs text-zinc-200"
      >
        {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
      </select>
      <button type="submit" className="rounded-md border border-[#263947] px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-100">
        View client
      </button>
    </form>
  );
}
