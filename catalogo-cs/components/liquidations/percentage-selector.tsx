"use client";

interface Props {
  selected: number;
}

const values = [25, 30, 35, 40, 45, 50, 55, 60];

export default function PercentageSelector({
  selected,
}: Props) {
  return (
    <div className="flex flex-wrap gap-3">
      {values.map((value) => (
        <button
          key={value}
          className={`
          px-4 py-2 rounded-full border
          ${
            selected === value
              ? "border-yellow-500 bg-yellow-500/10 text-yellow-400"
              : "border-zinc-700 text-zinc-400"
          }
          `}
        >
          {value}%
        </button>
      ))}
    </div>
  );
}