import JefesDashboard from "@/components/admin/JefesDashboard";
import { getJefesAction } from "@/lib/actions/jefes";
import { getOffDutyStaff } from "@/lib/actions/work-shift";

export const dynamic = "force-dynamic";

export default async function JefesPage() {
  const [initialJefes, offDuty] = await Promise.all([
    getJefesAction(),
    getOffDutyStaff(),
  ]);

  return <JefesDashboard initialJefes={initialJefes} offDuty={offDuty} />;
}
