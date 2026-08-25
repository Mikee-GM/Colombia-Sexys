import TeamOperations from "@/components/jefe/TeamOperations";
import WorkShiftToggle from "@/components/ui/WorkShiftToggle";
import { getMyWorkShift } from "@/lib/actions/work-shift";
import { getGroupServiceRequests, getJefeCashObligations, getJefeEmployees, getJefeServices } from "@/lib/actions/jefe-panel";

export default async function JefePage() {
  const [employees, services, cashSummary, groupRequests, workShift] = await Promise.all([getJefeEmployees(), getJefeServices(), getJefeCashObligations(), getGroupServiceRequests(), getMyWorkShift()]);
  return (
    <>
      {/* Cerrar la jornada avisa al panel de admin; no es lo mismo que estar ocupado. */}
      <div className="mb-6 max-w-xs">
        <WorkShiftToggle initialStatus={workShift} />
      </div>
      <TeamOperations initialEmployees={employees} initialServices={services} initialCashSummary={cashSummary} initialGroupRequests={groupRequests} />
    </>
  );
}
