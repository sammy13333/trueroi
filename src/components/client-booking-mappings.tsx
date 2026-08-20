"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Pipeline = { ghlId: string; name: string; selected: boolean; bookedStageIds: string[]; stages: Array<{ id?: string; name?: string }> };

export function ClientBookingMappings({ clientId, pipelines }: { clientId: string; pipelines: Pipeline[] }) {
  const router = useRouter();
  const [values, setValues] = useState(pipelines);
  const [status, setStatus] = useState<string | null>(null);
  const toggleStage = (pipelineId: string, stageId: string) => setValues((current) => current.map((pipeline) => pipeline.ghlId !== pipelineId ? pipeline : {
    ...pipeline, bookedStageIds: pipeline.bookedStageIds.includes(stageId) ? pipeline.bookedStageIds.filter((id) => id !== stageId) : [...pipeline.bookedStageIds, stageId],
  }));
  async function save() {
    setStatus(null);
    const response = await fetch(`/api/clients/${clientId}/pipelines`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pipelines: values.map(({ ghlId, selected, bookedStageIds }) => ({ ghlId, selected, bookedStageIds })) }) });
    setStatus(response.ok ? "Booking mapping saved." : (await response.json()).error ?? "Unable to save mapping.");
    if (response.ok) router.refresh();
  }
  if (!values.length) return null;
  return <section className="mt-5 rounded-md border bg-[#090909] p-4"><p className="text-[11px] uppercase tracking-wide text-zinc-600">Booked appointment mapping</p><p className="mt-1 text-xs text-zinc-500">Select reporting pipelines and their exact booked stages. Once any mapping is selected, it replaces conventional stage/tag fallback.</p><div className="mt-3 space-y-3">{values.map((pipeline) => <div key={pipeline.ghlId} className="rounded border border-[#272722] p-3"><label className="flex gap-2 text-sm text-zinc-300"><input type="checkbox" checked={pipeline.selected} onChange={() => setValues((current) => current.map((item) => item.ghlId === pipeline.ghlId ? { ...item, selected: !item.selected } : item))} />{pipeline.name}</label>{pipeline.selected && <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 pl-5">{pipeline.stages.filter((stage) => stage.id).map((stage) => <label key={stage.id} className="text-xs text-zinc-400"><input className="mr-1" type="checkbox" checked={pipeline.bookedStageIds.includes(stage.id!)} onChange={() => toggleStage(pipeline.ghlId, stage.id!)} />{stage.name ?? stage.id}</label>)}</div>}</div>)}</div><button onClick={save} className="mt-4 rounded-md border border-[#27b7df]/50 px-3 py-2 text-xs text-[#71d8ef]">Save booking mapping</button>{status && <p className="mt-2 text-xs text-zinc-500">{status}</p>}</section>;
}
