import { redirect } from "next/navigation";

import DisciplinaClient from "@/components/erp/disciplina-client";
import {
  getConductReports,
  getPendingAppeals,
  getSanctions,
} from "@/lib/actions/discipline";
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

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");
  if (user.rol === "jefe") redirect("/jefe/reportes");
  if (user.rol !== "admin") redirect("/admin");

  const [reports, sanctions, appeals, directorio] = await Promise.all([
    opcional(getConductReports(), []),
    opcional(getSanctions(), []),
    opcional(getPendingAppeals(), []),
    getDirectorio(),
  ]);

  return (
    <DisciplinaClient
      role="admin"
      initialReports={reports ?? []}
      initialSanctions={sanctions ?? []}
      initialAppeals={appeals ?? []}
      directorio={directorio}
    />
  );
}
