import { redirect } from "next/navigation";

import { ErpPageHeader } from "@/components/erp/primitives";
import CentroDeMando from "@/components/erp/centro-de-mando";
import SemanaEnCurso from "@/components/erp/semana-en-curso";
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
  },
  activeServices: [],
  pendingReports: [],
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");

  const contexto = "el centro de mando";
  const { startDate, endDate } = getOperationalWeek();

  const [overview, actors, appeals, services, summary, offDuty] =
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
    ]);

  return (
    <div className="flex flex-col gap-6">
      <ErpPageHeader
        title="Centro de Mando"
        description="Estado de la operacion, alertas y accesos a cada modulo"
      />

      {/* Resumen del ERP; debajo queda el tablero detallado que ya existia. */}
      <CentroDeMando overview={overview} offDuty={offDuty ?? []} />

      <SemanaEnCurso
        services={services ?? []}
        summary={summary ?? []}
        startDate={startDate}
        endDate={endDate}
      />

      <GodEyeDashboard
        initialOverview={overview}
        initialActors={actors}
        initialAppeals={appeals}
      />
    </div>
  );
}
