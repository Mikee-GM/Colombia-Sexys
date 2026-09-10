import { notFound, redirect } from "next/navigation";

import CasoDelServicioPanel from "@/components/erp/caso-del-servicio";
import { getCasoDelServicio } from "@/lib/actions/discipline";
import { getCurrentUser } from "@/lib/auth";
import { optionalSource } from "@/lib/optional-source";

export const dynamic = "force-dynamic";

/**
 * El caso disciplinario de un servicio.
 *
 * Se llega desde la bandeja del centro de mando: al tocar un reporte o una
 * apelacion se abre todo lo que se puso sobre ese mismo servicio, en vez de la
 * lista general donde cada pieza aparece suelta.
 */
export default async function CasoDelServicioPage({
  params,
}: {
  params: Promise<{ servicioId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");
  if (user.rol !== "admin" && user.rol !== "jefe") redirect("/admin");

  const { servicioId } = await params;

  /*
   * Sin caso no hay pantalla que enseñar: un id que no existe --o un servicio
   * de otra zona para un jefe-- es un 404, no un tablero vacio.
   */
  const caso = await optionalSource(
    getCasoDelServicio(servicioId),
    null,
    "el caso del servicio",
  );
  if (!caso) notFound();

  return <CasoDelServicioPanel caso={caso} />;
}
