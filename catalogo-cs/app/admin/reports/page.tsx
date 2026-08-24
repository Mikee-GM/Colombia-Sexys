import { redirect } from "next/navigation";

import DisciplinaClient from "@/components/erp/disciplina-client";
import {
  getConductReports,
  getPendingAppeals,
  getSanctions,
} from "@/lib/actions/discipline";
import { getDirectorio } from "@/lib/actions/directorio";
import { getCurrentUser } from "@/lib/auth";
import { optionalSource } from "@/lib/optional-source";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");
  if (user.rol === "jefe") redirect("/jefe/reportes");
  if (user.rol !== "admin") redirect("/admin");

  const [reports, sanctions, appeals, directorio] = await Promise.all([
    optionalSource(getConductReports(), [], "disciplina"),
    optionalSource(getSanctions(), [], "disciplina"),
    optionalSource(getPendingAppeals(), [], "disciplina"),
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
