"use client";

import { Button } from "@/components/ui/button";
import { APP_LOCALE, APP_TIME_ZONE } from "@/lib/locale";

interface Props {
  period: { start: Date; end: Date; weekLabel: string };
  onPrev: () => void;
  onNext: () => void;
}

export default function WeekSelector({ period, onPrev, onNext }: Props) {
  const { start, end, weekLabel } = period;

  const formatShort = (d: Date) =>
    d.toLocaleDateString(APP_LOCALE, {
      day: "2-digit",
      month: "short",
      timeZone: APP_TIME_ZONE,
    });

  return (
    <div className="flex w-full max-w-lg min-w-0 items-center justify-between gap-1 bg-zinc-900 border border-brand-gold/30 rounded-2xl px-2 py-2 sm:gap-4 sm:rounded-full sm:px-6 shadow-[0_0_15px_rgba(197,165,90,0.1)]">
      <Button variant="ghost" className="min-h-11 shrink-0 px-2 text-zinc-400 hover:text-brand-gold" aria-label="Semana anterior" onClick={onPrev}>
        {"<"} Ant
      </Button>
      <div className="min-w-0 text-center">
        <span className="text-brand-gold font-bold text-sm sm:text-lg block">{weekLabel}</span>
        <span className="text-xs text-zinc-400">
          {formatShort(start)} - {formatShort(end)}
        </span>
      </div>
      <Button variant="ghost" className="min-h-11 shrink-0 px-2 text-zinc-400 hover:text-brand-gold" aria-label="Semana siguiente" onClick={onNext}>
        Sig {">"}
      </Button>
    </div>
  );
}
