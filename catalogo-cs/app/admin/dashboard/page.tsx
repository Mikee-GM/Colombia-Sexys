import { redirect } from "next/navigation";

import { ErpPageHeader } from "@/components/erp/primitives";
import {
  bloquesDeCentroDeMando,
  SeparadorTableroDetallado,
} from "@/components/erp/centro-de-mando";
import { bloquesDeSemanaEnCurso } from "@/components/erp/semana-en-curso";
import TableroPersonalizable from "@/components/erp/tablero-personalizable";
import { getDashboardLayout } from "@/lib/actions/dashboard-layout";
import GodEyeDashboard from "@/components/admin/god-eye/GodEyeDashboard";
import {
  getGodEyeOverviewAction,
  getGodEyeActorsAction,
} from "@/lib/actions/god-eye";
import { getPendingAppeals } from "@/lib/actions/discipline";
import { getWeeklySummary } from "@/app/admin/liquidations/actions";
import { getServices } from "@/lib/data/services";
import { getCurrentUser } from "@/lib/auth";
import { optionalSource } from "@/lib/optional-source";
import { getOperationalWeek } from "@/lib/week-range";
import { getOffDutyStaff } from "@/lib/actions/work-shift";

export const dynamic = "force-dynamic";

/** Tablero en blanco cuando el resumen no responde. */
const OVERVIEW_VACIO = {
  metrics: {
    activeServices: 0,
    employeesTotal: 0,
    employeesAvailable: 0,
    employeesBusy: 0,
    driversTotal: 0,
    driversActive: 0,
    pendingReceipts: 0,
    recentNegativeRatings: 0,
    cashInStreet: 0,
    activeSanctions: 0,
    pendingAppeals: 0,
    pendingReports: 0,
    clientsTotal: 0,
    pendingOffers: 0,
    revenueToday: 0,
    revenueWeek: 0,
  },
  activeServices: [],
  pendingReports: [],
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");

  const contexto = "el centro de mando";
  const { startDate, endDate } = getOperationalWeek();

  const [overview, actors, appeals, services, summary, offDuty, layout] =
    await Promise.all([
    optionalSource(getGodEyeOverviewAction(), OVERVIEW_VACIO, contexto),
    optionalSource(
      getGodEyeActorsAction(),
      { employees: [], drivers: [], bosses: [] },
      contexto,
    ),
    optionalSource(getPendingAppeals(), [], contexto),
    optionalSource(getServices(), [], contexto),
    optionalSource(getWeeklySummary(startDate, endDate), [], contexto),
    optionalSource(getOffDutyStaff(), [], contexto),
    // Sin disposicion guardada se usa el orden por defecto, no un tablero vacio.
    optionalSource(getDashboardLayout(), null, contexto),
    ]);

  const { kpis, paneles } = bloquesDeCentroDeMando({
    overview,
    offDuty: offDuty ?? [],
  });

  const semana = bloquesDeSemanaEnCurso({
    services: services ?? [],
    summary: summary ?? [],
    startDate,
    endDate,
  });

  /*
   * Los indicadores y los paneles van en grupos distintos porque son piezas de
   * tamaños incompatibles: una tarjeta de KPI intercalada entre dos paneles
   * anchos queda ridicula. Dentro de cada grupo se reordenan libremente.
   */
  const grupos = [
    {
      id: "indicadores",
      gridClassName:
        "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6",
      bloques: kpis,
    },
    {
      id: "paneles",
      gridClassName: "grid grid-cols-1 gap-6 xl:grid-cols-2",
      bloques: [
        ...paneles,
        ...semana,
        {
          id: "tablero-detallado",
          titulo: "Tablero detallado",
          anchoCompleto: true,
          contenido: (
            <div className="flex flex-col gap-6">
              <SeparadorTableroDetallado />
              <GodEyeDashboard
                initialOverview={overview}
                initialActors={actors}
                initialAppeals={appeals}
              />
            </div>
          ),
        },
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <ErpPageHeader
        title="Centro de Mando"
        description="Estado de la operacion, alertas y accesos a cada modulo"
      />

      <TableroPersonalizable grupos={grupos} layoutInicial={layout} />
    </div>
  );
}
