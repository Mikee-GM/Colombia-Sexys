import { Star } from "lucide-react";

type CustomerRatingProps = {
  average?: number | null;
  count?: number;
  compact?: boolean;
  className?: string;
};

export default function CustomerRating({
  average,
  count = 0,
  compact = false,
  className = "",
}: CustomerRatingProps) {
  if (average == null || count === 0) {
    return (
      <p className={`text-[11px] text-zinc-500 ${className}`}>
        Sin opiniones de clientes
      </p>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="flex items-center gap-1 text-[#E8D5A3]">
        <Star
          size={compact ? 12 : 14}
          className="fill-[#C5A55A] text-[#C5A55A]"
          aria-hidden="true"
        />
        <span className="text-xs font-semibold">{average.toFixed(2)}</span>
      </span>
      <span className="text-[10px] text-zinc-500">
        {count} {count === 1 ? "opinión de cliente" : "opiniones de clientes"}
      </span>
    </div>
  );
}
