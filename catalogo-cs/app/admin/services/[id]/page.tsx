import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getServiceByIdAction } from "@/lib/data/services";
import ServicioDetalle from "@/components/erp/servicio-detalle";
import { getEmployees } from "@/lib/data/employees";
import { getChoferesAction } from "@/lib/actions/choferes";
import { optionalSource } from "@/lib/optional-source";

export const dynamic = "force-dynamic";

export default async function ServicioDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");

  const { id } = await params;
  const result = await getServiceByIdAction(id);

  if (!result.success || !result.data) notFound();

  /*
   * Las modelos son para poder reasignar. Se degrada a lista vacia si la
   * consulta falla: entonces el bloque de reasignar no aparece, pero el resto
   * de la ficha --que es lo que casi siempre se viene a ver-- sigue en pie.
   */
  const modelos = await optionalSource(
    getEmployees(),
    [],
    "modelos disponibles para reasignar",
  );

  const choferes = await optionalSource(
    getChoferesAction(),
    [],
    "choferes disponibles para reasignar",
  );

  return (
    <ServicioDetalle
      service={result.data}
      modelos={modelos}
      choferes={choferes}
    />
  );
}
