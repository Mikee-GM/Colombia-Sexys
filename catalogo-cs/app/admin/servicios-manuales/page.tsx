import { redirect } from "next/navigation";

import SolicitudesListado from "@/components/admin/servicios-manuales/solicitudes-listado";
import { getSolicitudesManuales } from "@/lib/actions/servicios-manuales";
import { getCurrentUser } from "@/lib/auth";
import { optionalSource } from "@/lib/optional-source";

export const dynamic = "force-dynamic";

export default async function ServiciosManualesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");
  if (!["admin", "jefe"].includes(user.rol)) redirect("/admin");

  const solicitudes = await optionalSource(
    getSolicitudesManuales("pendiente"),
    [],
    "solicitudes de servicio manual",
  );

  return <SolicitudesListado inicial={solicitudes} />;
}
