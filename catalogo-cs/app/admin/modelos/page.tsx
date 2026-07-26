import ModelosDashboard from "@/components/admin/ModelosDashboard";
import { getModelosAction, getJefesAction, getApartmentsAction } from "@/lib/actions/modelos";

export const dynamic = "force-dynamic";

export default async function ModelosPage() {
  const [initialModelos, jefes, apartments] = await Promise.all([
    getModelosAction(false),
    getJefesAction(),
    getApartmentsAction(),
  ]);

  return (
    <ModelosDashboard
      initialModelos={initialModelos}
      initialJefes={jefes}
      initialApartments={apartments}
    />
  );
}

