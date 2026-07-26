import type { LucideIcon } from "lucide-react";

type Props = {
  title: string;
  value: string | number;
  icon: LucideIcon;
  variant?: "default" | "compact";
};

export default function StatCard({
  title,
  value,
  icon: Icon,
  variant = "default",
}: Props) {
  const isCompact = variant === "compact";

  return (
    <div
      className={
        isCompact
          ? "min-w-0 rounded-2xl border border-zinc-800 bg-[#0f0f0f] p-4 sm:p-5"
          : "rounded-3xl border border-zinc-800 bg-[#0f0f0f] p-7"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={
            isCompact
              ? "min-w-0 text-xs leading-snug text-zinc-400 sm:text-sm"
              : "text-zinc-400"
          }
        >
          {title}
        </span>

        <Icon
          size={isCompact ? 18 : 22}
          className="shrink-0 text-[#D4AF37]"
        />
      </div>

      <p
        className={
          isCompact
            ? "mt-3 font-serif text-2xl font-semibold leading-none tracking-tight text-white tabular-nums sm:text-3xl"
            : "mt-5 text-5xl font-bold text-white"
        }
      >
        {value}
      </p>
    </div>
  );
}
