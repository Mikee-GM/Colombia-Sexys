import { Circle, DollarSign, Star } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

type Props = {
  id: string;
  name: string;
  realName: string;
  photoUrl?: string | null;
  pricePerHour: string;
  available: boolean;
  catalogActive: boolean;
};

export default function EmployeeCard({
  id,
  name,
  realName,
  photoUrl,
  pricePerHour,
  available,
  catalogActive,
}: Props) {
  return (
    <Link
      href={`/employees/${id}`}
      className="
      block
      bg-zinc-950
      border
      border-zinc-800
      rounded-2xl
      p-6
      hover:border-yellow-500/40
      transition-all
      "
    >
      <div className="flex items-center gap-4">
        {photoUrl ? (
          <Image
            src={photoUrl}
            alt={name}
            width={56}
            height={56}
            className="h-14 w-14 rounded-full object-cover"
          />
        ) : (
          <div className="h-14 w-14 rounded-full bg-gradient-to-br from-yellow-500 to-yellow-700" />
        )}

        <div>
          <h3 className="font-semibold text-white">
            {name}
          </h3>

          <p className="text-zinc-400 text-sm">
            {realName}
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <div className="flex items-center gap-2">
          <Star
            size={16}
            className="text-yellow-500"
          />

          <span>{catalogActive ? "Catálogo activo" : "Catálogo inactivo"}</span>
        </div>

        <div className="flex items-center gap-2">
          <DollarSign size={16} className="text-zinc-400" />
          <span>${Number(pricePerHour).toLocaleString("es-MX")}/h</span>
        </div>

        <div className="flex items-center gap-2">
          <Circle
            size={12}
            fill={
              available ? "#22c55e" : "#ef4444"
            }
            className={
              available
                ? "text-green-500"
                : "text-red-500"
            }
          />

          <span>
            {available ? "Disponible" : "No disponible"}
          </span>
        </div>
      </div>
    </Link>
  );
}
