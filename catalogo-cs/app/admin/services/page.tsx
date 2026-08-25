import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { optionalSource } from "@/lib/optional-source";
import { getServices } from "@/lib/data/services";
import { getEmployees } from "@/lib/data/employees";
import { getJefesAction } from "@/lib/actions/jefes";
import OperacionClient from "@/components/erp/operacion-client";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");

  /*
   * Las tres fuentes se piden en paralelo y se degradan por separado: si cae la
   * lista de jefes o la de empleadas, la torre de control sigue mostrando los
   * servicios, que es lo que no puede faltar.
   */
  const contexto = "la torre de control";
  const [services, employees, jefes] = await Promise.all([
    optionalSource(getServices(), [], contexto),
    optionalSource(getEmployees(), [], contexto),
    optionalSource(getJefesAction(), [], contexto),
  ]);

  return (
    <OperacionClient
      services={services ?? []}
      employees={employees ?? []}
      jefes={jefes ?? []}
    />
  );
}
