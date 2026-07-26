import { redirect } from "next/navigation";
import DisciplineDashboard from "@/components/employee-reports/discipline-dashboard";
import { getConductReports, getSanctions } from "@/lib/actions/discipline";
import { getCurrentUser } from "@/lib/auth";

export default async function JefeReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");
  if (user.rol === "admin") redirect("/admin/reports");
  if (user.rol !== "jefe") redirect("/admin");

  const [reports, sanctions] = await Promise.all([
    getConductReports(),
    getSanctions(),
  ]);

  return (
    <DisciplineDashboard
      role="jefe"
      initialReports={reports}
      initialSanctions={sanctions}
    />
  );
}
