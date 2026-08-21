import Link from "next/link";
import { AppShell, FilterBar, PageHeader } from "@/components/app-shell";

export default async function AgencySectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const title = section.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  return (
    <AppShell>
      <PageHeader title={title} description="This report will populate from your isolated agency Meta and GHL sync data." actions={<Link href="/agency/settings" className="rounded-md border px-3 py-2 text-xs text-zinc-400">Configure sync</Link>} />
      <FilterBar />
      <div className="m-5 grid min-h-80 place-items-center rounded-lg border border-[#272722] bg-[#0c0c0b] p-8 text-center sm:m-8">
        <div className="max-w-md">
          <h2 className="text-base font-medium text-zinc-200">No synced data to report</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-500">TrueROI by TundraWeb keeps agency acquisition and client delivery records in separate data stores. Connect a source and run a manual sync to populate this report.</p>
          <Link href="/agency/settings" className="mt-5 inline-block text-xs font-medium text-[#27b7df] hover:text-[#71d8ef]">Open agency settings →</Link>
        </div>
      </div>
    </AppShell>
  );
}
