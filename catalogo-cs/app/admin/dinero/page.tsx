import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { optionalSource } from "@/lib/optional-source";
import { getOperationalWeek } from "@/lib/week-range";
import DineroListado from "@/components/erp/dinero-listado";
import { getMoneyOverview } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Punto unico de entrada al dinero del personal.
 *
 * Antes cada cifra vivia en una pantalla distinta —el corte en liquidaciones,
 * el efectivo sin entregar en transporte, las deudas en cartera— y ninguna de
 * las tres estaba en el menu: se llegaba a ellas desde enlaces sueltos dentro
 * de otras fichas. Para saber cuanto se le paga hoy a una persona habia que
 * abrir tres sitios, acordarse de los tres y restar a mano.
 */
export default async function DineroPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");
  if (user.rol !== "admin" && user.rol !== "jefe") redirect("/admin/dashboard");

  const semana = getOperationalWeek();
  const { start, end } = await searchParams;
  const startDate = start || semana.startDate;
  const endDate = end || semana.endDate;

  const filas = await optionalSource(
    getMoneyOverview(startDate, endDate),
    [],
    "el panel de dinero",
  );

  return (
    <DineroListado
      filas={filas ?? []}
      startDate={startDate}
      endDate={endDate}
      esAdmin={user.rol === "admin"}
    />
  );
}
