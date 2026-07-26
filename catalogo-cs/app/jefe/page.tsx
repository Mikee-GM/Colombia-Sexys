import TeamOperations from "@/components/jefe/TeamOperations";
import { getGroupServiceRequests, getJefeCashObligations, getJefeEmployees, getJefeServices } from "@/lib/actions/jefe-panel";

export default async function JefePage() {
  const [employees, services, cashSummary, groupRequests] = await Promise.all([getJefeEmployees(), getJefeServices(), getJefeCashObligations(), getGroupServiceRequests()]);
  return <TeamOperations initialEmployees={employees} initialServices={services} initialCashSummary={cashSummary} initialGroupRequests={groupRequests} />;
}
