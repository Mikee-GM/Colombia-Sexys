import ChoferesDashboard from "@/components/admin/ChoferesDashboard";
import { getChoferesAction } from "@/lib/actions/choferes";

export const dynamic = "force-dynamic";

export default async function ChoferesPage() {
  const initialChoferes = await getChoferesAction();

  return <ChoferesDashboard initialChoferes={initialChoferes} />;
}

