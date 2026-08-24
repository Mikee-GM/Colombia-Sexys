import { redirect } from "next/navigation";

import { ErpPageHeader } from "@/components/erp/primitives";
import CentroDeMando from "@/components/erp/centro-de-mando";
import GodEyeDashboard from "@/components/admin/god-eye/GodEyeDashboard";
import {
  getGodEyeOverviewAction,
  getGodEyeActorsAction,
} from "@/lib/actions/god-eye";
import { getPendingAppeals } from "@/lib/actions/discipline";
import { getCurrentUser } from "@/lib/auth";
import { optionalSource } from "@/lib/optional-source";

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

  const [overview, actors, appeals] = await Promise.all([
    optionalSource(getGodEyeOverviewAction(), OVERVIEW_VACIO, "el centro de mando"),
    optionalSource(
      getGodEyeActorsAction(),
      { employees: [], drivers: [], bosses: [] },
      "el centro de mando",
    ),
    optionalSource(getPendingAppeals(), [], "el centro de mando"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <ErpPageHeader
        title="Centro de Mando"
        description="Estado de la operacion, alertas y accesos a cada modulo"
      />

      {/* Resumen del ERP; debajo queda el tablero detallado que ya existia. */}
      <CentroDeMando overview={overview} />

      <GodEyeDashboard
        initialOverview={overview}
        initialActors={actors}
        initialAppeals={appeals}
      />
    </div>
  );
}
