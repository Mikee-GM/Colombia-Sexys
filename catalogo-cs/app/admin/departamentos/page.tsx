import { getApartmentsAction } from "@/lib/actions/apartments";
import DepartamentosDashboard from "@/components/admin/DepartamentosDashboard";

export const dynamic = "force-dynamic";

export default async function DepartamentosPage() {
  const initialDepartments = await getApartmentsAction();

  return <DepartamentosDashboard initialDepartments={initialDepartments} />;
}
