import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { optionalSource } from "@/lib/optional-source";
import { ErpPageHeader } from "@/components/erp/primitives";
import CorteSemanal from "@/components/erp/corte-semanal";
import LiquidationsClient from "@/components/liquidations/liquidations-client";
import { getWeeklySummary } from "./actions";
import { getOperationalWeekPeriod } from "@/lib/week-range";

export const dynamic = "force-dynamic";

export default async function LiquidationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");

  const reference = new Date();
  const { startDate, endDate, start, end } = getOperationalWeekPeriod(reference);

  // El corte de toda la semana; debajo queda el desglose por persona.
  const summary = await optionalSource(
    getWeeklySummary(start.toISOString(), end.toISOString()),
    [],
    "el corte semanal",
  );

  return (
    <div className="flex flex-col gap-6">
      <ErpPageHeader
        title="Hoja de corte semanal"
        description={`Corte semanal del ${startDate} al ${endDate}`}
      />

      <CorteSemanal
        summary={summary ?? []}
        startDate={startDate}
        endDate={endDate}
      />

      <div className="border-t border-zinc-800 pt-6">
        <LiquidationsClient
          isAdmin={user.rol === "admin"}
          initialReference={reference.toISOString()}
        />
      </div>
    </div>
  );
}
