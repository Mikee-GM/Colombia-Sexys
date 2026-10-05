import type { Service } from "@/lib/types";
import { presentServiceState } from "./today-model";

const TONE = {
  gold: "border-[#C5A55A]/35 bg-[#C5A55A]/10 text-[#E8D5A3]",
  blue: "border-sky-500/25 bg-sky-500/10 text-sky-300",
  green: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  zinc: "border-zinc-800 bg-zinc-900 text-zinc-400",
  red: "border-red-500/25 bg-red-500/10 text-red-300",
} as const;

export default function ServiceStateSummary({ service }: { service: Service }) {
  const presentation = presentServiceState(service);
  return (
    <section className={`rounded-xl border p-3.5 ${TONE[presentation.tone]}`}>
      <p className="text-[9px] font-bold uppercase tracking-[0.16em] opacity-70">
        Estado operacional
      </p>
      <p className="mt-1 text-sm font-semibold">{presentation.label}</p>
      <p className="mt-1 text-xs leading-relaxed opacity-75">
        {presentation.summary}
      </p>
    </section>
  );
}
