import { getCurrentUser } from "@/lib/auth";
import { ErpPageHeader } from "@/components/erp/primitives";
import CorteSemanal from "@/components/erp/corte-semanal";
import LiquidationsClient from "@/components/liquidations/liquidations-client";
import { getWeeklySummary } from "./actions";
import { getOperationalWeek } from "@/lib/week-range";

export const dynamic = "force-dynamic";

export default async function LiquidationsPage() {
  const user = await getCurrentUser();
  const { startDate, endDate } = getOperationalWeek();

  // El corte de toda la semana; debajo queda el desglose por persona.
  const summary = await getWeeklySummary(startDate, endDate).catch(() => []);

  return (
    <div className="flex flex-col gap-6">
      <ErpPageHeader
        title="Liquidaciones"
        description={`Corte semanal del ${startDate} al ${endDate}`}
      />

      <CorteSemanal
        summary={summary ?? []}
        startDate={startDate}
        endDate={endDate}
      />

      <div className="border-t border-zinc-800 pt-6">
        <LiquidationsClient isAdmin={user?.rol === "admin"} />
      </div>
    </div>
  );
}
