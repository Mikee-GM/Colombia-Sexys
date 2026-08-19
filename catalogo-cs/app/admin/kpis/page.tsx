import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEmployeeKpis } from "@/lib/data/employees";
import { getDriverKpis } from "@/lib/data/drivers";
import KpiDashboard from "@/components/kpis/kpi-dashboard";

export default async function KpisPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");
  if (user.rol !== "admin") redirect("/admin");

  const [employees, drivers] = await Promise.all([
    getEmployeeKpis(),
    getDriverKpis(),
  ]);

  return <KpiDashboard employees={employees} drivers={drivers} />;
}
