import ModelosDashboard from "@/components/admin/ModelosDashboard";
import { getModelosAction, getJefesAction, getApartmentsAction } from "@/lib/actions/modelos";
import { getOffDutyStaff } from "@/lib/actions/work-shift";

export const dynamic = "force-dynamic";

export default async function ModelosPage() {
  const [initialModelos, jefes, apartments, offDuty] = await Promise.all([
    getModelosAction(false),
    getJefesAction(),
    getApartmentsAction(),
    getOffDutyStaff(),
  ]);

  return (
    <ModelosDashboard
      initialModelos={initialModelos}
      initialJefes={jefes}
      initialApartments={apartments}
      offDuty={offDuty}
    />
  );
}

