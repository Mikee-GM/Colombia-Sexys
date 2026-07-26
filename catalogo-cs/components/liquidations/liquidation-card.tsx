import Link from "next/link";

interface Props {
  id: number;
  employee: string;
  services: number;
  sales: number;
  percentage: number;
}

export default function LiquidationCard({
  id,
  employee,
  services,
  sales,
  percentage,
}: Props) {
  return (
    <Link href={`/liquidations/${id}`}>
      <div
        className="
        bg-zinc-950
        border border-zinc-800
        rounded-3xl
        p-6
        hover:border-yellow-500
        transition
        cursor-pointer
        "
      >
        <h3 className="text-xl font-semibold">
          {employee}
        </h3>

        <p className="text-zinc-500 mt-2">
          {services} servicios
        </p>

        <p className="text-3xl font-bold mt-4">
          ${sales.toLocaleString()}
        </p>

        <span
          className="
          mt-4
          inline-flex
          bg-yellow-500/10
          text-yellow-400
          px-3
          py-1
          rounded-full
          "
        >
          {percentage}%
        </span>
      </div>
    </Link>
  );
}