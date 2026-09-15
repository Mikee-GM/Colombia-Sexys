import Link from "next/link";
import { Bell } from "lucide-react";
import TeamOperations from "@/components/jefe/TeamOperations";
import WorkShiftToggle from "@/components/ui/WorkShiftToggle";
import { getMyWorkShift } from "@/lib/actions/work-shift";
import { getGroupServiceRequests, getJefeCashObligations, getJefeEmployees, getJefeServices } from "@/lib/actions/jefe-panel";

interface PageProps {
  // El boton de portal de un solo uso que llega con la notificacion de un
  // servicio grupal trae `?tab=grupos` para aterrizar directo en esa pestaña,
  // igual que el portal de la modelo aterriza en fotos con `?seccion=fotos`.
  searchParams: Promise<{ tab?: string }>;
}

export default async function JefePage({ searchParams }: PageProps) {
  const { tab } = await searchParams;
  const [employees, services, cashSummary, groupRequests, workShift] = await Promise.all([getJefeEmployees(), getJefeServices(), getJefeCashObligations(), getGroupServiceRequests(), getMyWorkShift()]);
  return (
    <>
      {/*
        Estado y ajustes, en una sola linea y arriba del todo.

        La jornada ocupaba un boton de ancho completo con su parrafo debajo, y
        junto al titulo grande y la descripcion empujaban los servicios fuera de
        la primera pantalla del telefono. Ninguna de las dos cosas es una tarea
        del dia: se miran una vez y se dejan.
      */}
      <div className="mb-4 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <WorkShiftToggle initialStatus={workShift} compacto />
        </div>
        <Link
          href="/jefe/ajustes"
          aria-label="Ajustes de avisos"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-800 text-zinc-400 transition-colors hover:border-[#C5A55A] hover:text-[#C5A55A]"
        >
          <Bell size={16} />
        </Link>
      </div>
      <TeamOperations
        initialEmployees={employees}
        initialServices={services}
        initialCashSummary={cashSummary}
        initialGroupRequests={groupRequests}
        tabInicial={tab === "grupos" ? "grupos" : undefined}
      />
    </>
  );
}
