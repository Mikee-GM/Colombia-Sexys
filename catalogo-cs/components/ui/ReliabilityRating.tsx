interface ReliabilityRatingProps {
  score?: number | null;
  compact?: boolean;
  className?: string;
}

function Star({ filled }: { filled: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`h-full w-full ${
        filled ? "text-[#D4AF37]" : "text-zinc-700"
      }`}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    >
      <path d="m12 2.75 2.82 5.72 6.31.92-4.57 4.45 1.08 6.29L12 17.16l-5.64 2.97 1.08-6.29-4.57-4.45 6.31-.92L12 2.75Z" />
    </svg>
  );
}

export default function ReliabilityRating({
  score,
  compact = false,
  className = "",
}: ReliabilityRatingProps) {
  const hasScore = typeof score === "number" && Number.isFinite(score);
  const rating = hasScore ? Math.min(5, Math.max(1, Math.round(score))) : 0;
  const description = hasScore ? `${rating} de 5` : "Sin evaluar";

  return (
    <div
      className={`flex ${
        compact ? "items-center gap-2" : "flex-col items-start gap-2"
      } ${className}`}
    >
      {!compact && (
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
          Nivel de confiabilidad
        </span>
      )}
      <div className="flex items-center gap-2">
        <div
          className={`flex items-center ${compact ? "gap-0.5" : "gap-1"}`}
          role="img"
          aria-label={`Nivel de confiabilidad: ${description}`}
          title={`Nivel de confiabilidad: ${description}`}
        >
          {Array.from({ length: 5 }, (_, index) => (
            <span
              key={index}
              className={compact ? "h-3.5 w-3.5" : "h-5 w-5"}
            >
              <Star filled={index < rating} />
            </span>
          ))}
        </div>
        <span
          className={`font-medium text-zinc-400 ${
            compact ? "text-[10px]" : "text-xs"
          }`}
        >
          {description}
        </span>
      </div>
    </div>
  );
}
