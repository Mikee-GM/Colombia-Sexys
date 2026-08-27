import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { optionalSource } from "@/lib/optional-source";
import { getLiquidationReport } from "../actions";
import { getEmployeeTransferReceipts } from "@/lib/actions/evidence";
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

  /*
   * Un corte que no existe termina en 404, pero una sesion caida tiene que
   * llegar al login: sin distinguirlas, la empleada correcta se veia como si
   * no existiera.
   */
  const [report, comprobantes] = await Promise.all([
    optionalSource(
      getLiquidationReport(startDate, endDate, id),
      null,
      "el corte de la empleada",
    ),
    /*
     * Las capturas son un apoyo del corte, no el corte: si el listado de
     * evidencias falla, la pagina tiene que seguir mostrando las cifras.
     */
    optionalSource(
      getEmployeeTransferReceipts(id, startDate, endDate),
      { items: [], nextCursor: null },
      "los comprobantes de la empleada",
    ),
  ]);
  if (!report) notFound();

  return (
    <LiquidacionEmpleada
      report={report}
      startDate={startDate}
      endDate={endDate}
      puedeEditarComision={user.rol === "admin"}
      comprobantes={comprobantes.items}
    />
  );
}
