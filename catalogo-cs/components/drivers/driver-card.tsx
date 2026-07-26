import {
 MapPin,
 Phone,
} from "lucide-react";
import Link from "next/link";

type Props = {
 id: string;
 name: string;
 phone: string;
 available: boolean;
 latitude?: string | null;
 longitude?: string | null;
};

export default function DriverCard({
 id,
 name,
 phone,
 available,
 latitude,
 longitude,
}: Props) {

 const hasLocation = Boolean(latitude && longitude);

 return (
  <Link
   href={`/drivers/${id}`}
   className="
   block
   rounded-2xl
   border
   border-zinc-800
   bg-zinc-950
   p-6
   hover:border-yellow-500/30
   transition-all
   "
  >
   <div className="flex justify-between">
    <div>
     <h3
      className="
      text-lg
      font-semibold
      "
     >
      {name}
     </h3>

     <p className="text-zinc-400">
      Driver
     </p>
    </div>

    <span
     className={`
      px-3
      py-1
      rounded-full
      text-xs
      ${available ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}
     `}
    >
     {available ? "Disponible" : "Ocupado"}
    </span>
   </div>

   <div className="mt-5 space-y-3">
    <div className="flex items-center gap-3">
      <Phone size={18} />
      <span>{phone}</span>
    </div>

    <div className="flex items-center gap-3">
      <MapPin size={18} />
      <span>{hasLocation ? `${latitude}, ${longitude}` : "Sin ubicación"}</span>
    </div>
   </div>

   <div
    className="
    mt-6
    w-full
    rounded-xl
    bg-yellow-500
    py-2
    text-black
    font-medium
    hover:bg-yellow-400
    transition
    text-center
    "
   >
    Ver perfil
   </div>
  </Link>
 );
}
