import { redirect } from "next/navigation";

import DisciplinaClient from "@/components/erp/disciplina-client";
import { getConductReports, getSanctions } from "@/lib/actions/discipline";
import { getDirectorio } from "@/lib/actions/directorio";
import { getCurrentUser, isRedirectError } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Degrada una fuente sin tragarse las redirecciones de sesion de apiFetch. */
async function opcional<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("Fuente no disponible en disciplina:", error);
    return fallback;
  }
}

export default async function JefeReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");
  if (user.rol === "admin") redirect("/admin/reports");
  if (user.rol !== "jefe") redirect("/admin");

  /* El jefe no ve apelaciones: /discipline/appeals es solo de admin. */
  const [reports, sanctions, directorio] = await Promise.all([
    opcional(getConductReports(), []),
    opcional(getSanctions(), []),
    getDirectorio(),
  ]);

  return (
    <DisciplinaClient
      role="jefe"
      initialReports={reports ?? []}
      initialSanctions={sanctions ?? []}
      directorio={directorio}
    />
  );
}
