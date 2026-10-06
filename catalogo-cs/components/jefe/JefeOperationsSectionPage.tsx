import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import TeamOperations from "@/components/jefe/TeamOperations";
import {
  getGroupServiceRequests,
  getJefeCashObligations,
  getJefeEmployees,
  getJefeServices,
} from "@/lib/actions/jefe-panel";

export type JefeOperationsSection =
  | "equipo"
  | "efectivo"
  | "historial"
  | "grupos";

export default async function JefeOperationsSectionPage({
  section,
}: {
  section: JefeOperationsSection;
}) {
  const [employees, services, cashSummary, groupRequests] = await Promise.all([
    getJefeEmployees(),
    getJefeServices(),
    getJefeCashObligations(),
    getGroupServiceRequests(),
  ]);

  return (
    <>
      <Link
        href="/jefe"
        className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-zinc-800 px-3.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-400 hover:border-[#C5A55A] hover:text-[#C5A55A]"
      >
        <ArrowLeft size={14} /> Volver a Hoy
      </Link>
      <TeamOperations
        initialEmployees={employees}
        initialServices={services}
        initialCashSummary={cashSummary}
        initialGroupRequests={groupRequests}
        fixedTab={section}
      />
    </>
  );
}
