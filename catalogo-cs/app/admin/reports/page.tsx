import { redirect } from "next/navigation";
import DisciplineDashboard from "@/components/employee-reports/discipline-dashboard";
import {
  getConductReports,
  getPendingAppeals,
  getSanctions,
} from "@/lib/actions/discipline";
import { getCurrentUser } from "@/lib/auth";

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");
  if (user.rol === "jefe") redirect("/jefe/reportes");
  if (user.rol !== "admin") redirect("/admin");

  const [reports, sanctions, appeals] = await Promise.all([
    getConductReports(),
    getSanctions(),
    getPendingAppeals(),
  ]);

  return (
    <DisciplineDashboard
      role="admin"
      initialReports={reports}
      initialSanctions={sanctions}
      initialAppeals={appeals}
    />
  );
}
