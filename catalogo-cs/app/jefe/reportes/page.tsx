import { redirect } from "next/navigation";

import DisciplinaClient from "@/components/erp/disciplina-client";
import { getConductReports, getSanctions } from "@/lib/actions/discipline";
import { getDirectorio } from "@/lib/actions/directorio";
import { getCurrentUser } from "@/lib/auth";
import { optionalSource } from "@/lib/optional-source";

export const dynamic = "force-dynamic";

export default async function JefeReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");
  if (user.rol === "admin") redirect("/admin/reports");
  if (user.rol !== "jefe") redirect("/admin");

  /* El jefe no ve apelaciones: /discipline/appeals es solo de admin. */
  const [reports, sanctions, directorio] = await Promise.all([
    optionalSource(getConductReports(), [], "disciplina"),
    optionalSource(getSanctions(), [], "disciplina"),
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
