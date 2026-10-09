import { formatCurrency } from "@/lib/calculations";
import type { LiquidationCommissionSettings } from "@/components/liquidations/types";

/**
 * Aclaracion visible de la regla financiera fija para extras con tarjeta.
 */
export default function ComisionExtrasTarjeta({
  settings,
}: {
  settings: LiquidationCommissionSettings;
}) {
  return (
    <div className="border-t border-zinc-800/55 px-1 py-3">
      <p className="text-[11px] leading-relaxed text-zinc-500">
        {`La empresa retiene el ${settings.cardExtraCommissionPercentage} % de cada extra cobrado con tarjeta de ${formatCurrency(
          settings.cardExtraCommissionThreshold,
        )} o más. Los extras en efectivo no se registran en la aplicación y pertenecen íntegros a la empleada.`}
      </p>
    </div>
  );
}
