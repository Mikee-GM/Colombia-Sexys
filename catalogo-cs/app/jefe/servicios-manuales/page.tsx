import { redirect } from "next/navigation";

import SolicitudesListado from "@/components/admin/servicios-manuales/solicitudes-listado";
import { getSolicitudesManuales } from "@/lib/actions/servicios-manuales";
import { getCurrentUser } from "@/lib/auth";
import { optionalSource } from "@/lib/optional-source";

export const dynamic = "force-dynamic";

/**
 * El jefe es quien autoriza estos registros, asi que la pantalla vive tambien
 * en su panel. Es el mismo listado que ve el admin: el backend ya le muestra
 * solo las solicitudes de sus empleadas.
 */
export default async function JefeServiciosManualesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");
  if (user.rol === "admin") redirect("/admin/servicios-manuales");
  if (user.rol !== "jefe") redirect("/admin");

  const solicitudes = await optionalSource(
    getSolicitudesManuales("pendiente"),
    [],
    "solicitudes de servicio manual",
  );

  return <SolicitudesListado inicial={solicitudes} />;
}
