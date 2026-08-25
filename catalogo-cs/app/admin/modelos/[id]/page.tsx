import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { optionalSource } from "@/lib/optional-source";
import { getEmployee } from "@/lib/data/employees";
import { getDossier, getEmployeeRatingComments } from "@/lib/actions/discipline";
import { getDebts, getLiquidationReport } from "@/app/admin/liquidations/actions";
import { getOperationalWeek } from "@/lib/week-range";
import ExpedienteModelo from "@/components/erp/expediente-modelo";

export const dynamic = "force-dynamic";

/**
 * Expediente de una modelo. Cada fuente se pide en paralelo y se degrada por
 * separado: si falla la disciplina o la liquidacion, el resto de la ficha
 * sigue mostrandose.
 */
export default async function ExpedienteModeloPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");
  if (user.rol !== "admin" && user.rol !== "jefe") redirect("/admin/dashboard");

  const { id } = await params;
  const { startDate, endDate } = getOperationalWeek();

  const contexto = "el expediente de la modelo";

  /* Una modelo inexistente da 404; una sesion caida tiene que ir al login. */
  const employee = await optionalSource(getEmployee(id), null, contexto);
  if (!employee) notFound();

  const [dossier, debts, report, ratings] = await Promise.all([
    optionalSource(getDossier("employee", id), null, contexto),
    optionalSource(getDebts(id), [], contexto),
    optionalSource(getLiquidationReport(startDate, endDate, id), null, contexto),
    optionalSource(getEmployeeRatingComments(id), [], contexto),
  ]);

  return (
    <ExpedienteModelo
      employee={employee}
      dossier={dossier}
      debts={debts ?? []}
      report={report}
      ratings={ratings ?? []}
      startDate={startDate}
      endDate={endDate}
    />
  );
}
