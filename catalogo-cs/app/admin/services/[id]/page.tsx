import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getServiceByIdAction } from "@/lib/data/services";
import ServicioDetalle from "@/components/erp/servicio-detalle";

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

  return <ServicioDetalle service={result.data} />;
}
