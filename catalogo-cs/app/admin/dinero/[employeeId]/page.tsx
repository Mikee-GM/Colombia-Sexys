import { notFound, redirect } from "next/navigation";

import { getCurrentUser, isRedirectError } from "@/lib/auth";
import { getOperationalWeek } from "@/lib/week-range";
import DineroFicha from "@/components/erp/dinero-ficha";
import { getEmployeeMoney } from "../actions";

export const dynamic = "force-dynamic";

/**
 * Ficha de dinero de una persona.
 *
 * No degrada con `optionalSource`: aqui no hay varias fuentes que puedan caer
 * por separado, es una sola respuesta y sin ella la pantalla no dice nada. Una
 * ficha dibujada con ceros seria peor que un error, porque un saldo en cero se
 * lee como "no debe nada".
 *
 * El `catch` reemite las redirecciones: `apiFetch` corta la sesion caducada
 * invocando `redirect`, que viaja como excepcion, y tragarsela aqui mandaria a
 * un "no encontrado" a quien solo tenia que volver a entrar.
 */
export default async function FichaDineroPage({
  params,
  searchParams,
}: {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");
  if (user.rol !== "admin" && user.rol !== "jefe") redirect("/admin/dashboard");

  const { employeeId } = await params;
  const semana = getOperationalWeek();
  const { start, end } = await searchParams;
  const startDate = start || semana.startDate;
  const endDate = end || semana.endDate;

  const detalle = await getEmployeeMoney(employeeId, startDate, endDate).catch(
    (error: unknown) => {
      if (isRedirectError(error)) throw error;
      console.error("Ficha de dinero no disponible:", error);
      return null;
    },
  );
  if (!detalle) notFound();

  return (
    <DineroFicha
      detalle={detalle}
      startDate={startDate}
      endDate={endDate}
      esAdmin={user.rol === "admin"}
    />
  );
}
