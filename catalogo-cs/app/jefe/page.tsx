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
      {/* Cerrar la jornada avisa al panel de admin; no es lo mismo que estar ocupado. */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="max-w-xs flex-1">
          <WorkShiftToggle initialStatus={workShift} />
        </div>
        {/* La configuracion de avisos se hace una vez y vive en su pantalla:
            ocupando sitio aqui competia cada dia con lo operativo. */}
        <Link
          href="/jefe/ajustes"
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-zinc-800 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 transition-colors hover:border-[#C5A55A] hover:text-[#C5A55A]"
        >
          <Bell size={14} />
          Avisos
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
