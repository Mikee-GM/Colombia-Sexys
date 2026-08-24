import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getLiquidationReport } from "../actions";
import { getOperationalWeek } from "@/lib/week-range";
import LiquidacionEmpleada from "@/components/erp/liquidacion-empleada";

export const dynamic = "force-dynamic";

/**
 * Corte de una empleada. El id de la ruta es el de la empleada y el periodo
 * llega en start y end; sin ellos se usa la semana operativa en curso.
 */
export default async function LiquidacionEmpleadaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");
  if (user.rol !== "admin" && user.rol !== "jefe") redirect("/admin/dashboard");

  const [{ id }, { start, end }] = await Promise.all([params, searchParams]);
  const semana = getOperationalWeek();
  const startDate = start ?? semana.startDate;
  const endDate = end ?? semana.endDate;

  const report = await getLiquidationReport(startDate, endDate, id).catch(
    () => null,
  );
  if (!report) notFound();

  return (
    <LiquidacionEmpleada
      report={report}
      startDate={startDate}
      endDate={endDate}
    />
  );
}
