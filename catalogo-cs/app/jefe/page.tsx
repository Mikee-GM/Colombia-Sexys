import AvisosPush from "@/components/jefe/AvisosPush";
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
      <div className="mb-6 max-w-xs">
        <WorkShiftToggle initialStatus={workShift} />
      </div>
      {/* La suscripcion es por dispositivo, asi que la tarjeta aparece en cada
          equipo hasta que se activa en ese. */}
      <div className="mb-6 max-w-md">
        <AvisosPush />
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
