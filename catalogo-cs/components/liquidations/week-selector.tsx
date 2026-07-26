"use client";

import { getStartAndEndOfWeek, getWeekStringFromDate } from "@/lib/calculations";
import { Button } from "@/components/ui/button";

interface Props {
  currentDate: Date;
  onPrev: () => void;
  onNext: () => void;
}

export default function WeekSelector({ currentDate, onPrev, onNext }: Props) {
  const { start, end } = getStartAndEndOfWeek(currentDate);
  const weekLabel = getWeekStringFromDate(currentDate);

  const formatShort = (d: Date) => d.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });

  return (
    <div className="flex items-center gap-4 bg-zinc-900 border border-brand-gold/30 rounded-full px-6 py-2 shadow-[0_0_15px_rgba(197,165,90,0.1)]">
      <Button variant="ghost" className="text-zinc-400 hover:text-brand-gold" onClick={onPrev}>
        {"<"} Ant
      </Button>
      <div className="text-center min-w-[200px]">
        <span className="text-brand-gold font-bold text-lg block">{weekLabel}</span>
        <span className="text-xs text-zinc-400">
          {formatShort(start)} - {formatShort(end)}
        </span>
      </div>
      <Button variant="ghost" className="text-zinc-400 hover:text-brand-gold" onClick={onNext}>
        Sig {">"}
      </Button>
    </div>
  );
}
