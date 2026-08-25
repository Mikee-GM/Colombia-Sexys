import ChoferesDashboard from "@/components/admin/ChoferesDashboard";
import { getChoferesAction } from "@/lib/actions/choferes";
import { getOffDutyStaff } from "@/lib/actions/work-shift";

export const dynamic = "force-dynamic";

export default async function ChoferesPage() {
  /*
   * La jornada vive en `usuarios` y no en la ficha del chofer, asi que llega
   * por separado y se cruza por `usuarioId` en la tarjeta.
   */
  const [initialChoferes, offDuty] = await Promise.all([
    getChoferesAction(),
    getOffDutyStaff(),
  ]);

  return (
    <ChoferesDashboard initialChoferes={initialChoferes} offDuty={offDuty} />
  );
}
