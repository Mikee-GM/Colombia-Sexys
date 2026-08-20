import PageHeader from "@/components/ui/page-header";
import GodEyeDashboard from "@/components/admin/god-eye/GodEyeDashboard";
import {
  getGodEyeOverviewAction,
  getGodEyeActorsAction,
} from "@/lib/actions/god-eye";
import { getPendingAppeals } from "@/lib/actions/discipline";

export default async function DashboardPage() {
  const [overview, actors, appeals] = await Promise.all([
    getGodEyeOverviewAction().catch(() => ({
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
      },
      activeServices: [],
    })),
    getGodEyeActorsAction().catch(() => ({
      employees: [],
      drivers: [],
      bosses: [],
    })),
    getPendingAppeals().catch(() => []),
  ]);

  return (
    <>
      <PageHeader
        title="Ojo de Dios"
        description=""
      />

      <GodEyeDashboard
        initialOverview={overview}
        initialActors={actors}
        initialAppeals={appeals}
      />
    </>
  );
}
