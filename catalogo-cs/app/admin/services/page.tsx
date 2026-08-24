import { redirect } from "next/navigation";

import { getCurrentUser, isRedirectError } from "@/lib/auth";
import { getServices } from "@/lib/data/services";
import { getEmployees } from "@/lib/data/employees";
import { getJefesAction } from "@/lib/actions/jefes";
import OperacionClient from "@/components/erp/operacion-client";

export const dynamic = "force-dynamic";

/**
 * Degrada una fuente a un valor vacio sin tragarse las redirecciones.
 *
 * `apiFetch` corta la sesion invocando `redirect`, que en Next se propaga como
 * una excepcion: un `catch` a secas la atrapa y la pantalla se dibuja vacia en
 * lugar de mandar al login.
 */
async function opcional<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("Fuente no disponible en la torre de control:", error);
    return fallback;
  }
}

export default async function ServicesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");

  /*
   * Las tres fuentes se piden en paralelo y se degradan por separado: si cae la
   * lista de jefes o la de empleadas, la torre de control sigue mostrando los
   * servicios, que es lo que no puede faltar.
   */
  const [services, employees, jefes] = await Promise.all([
    opcional(getServices(), []),
    opcional(getEmployees(), []),
    opcional(getJefesAction(), []),
  ]);

  return (
    <OperacionClient
      services={services ?? []}
      employees={employees ?? []}
      jefes={jefes ?? []}
    />
  );
}
