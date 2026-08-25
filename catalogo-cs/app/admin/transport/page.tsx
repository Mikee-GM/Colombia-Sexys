import Link from "next/link";

import { ErpPageHeader } from "@/components/erp/primitives";
import TransportConfigurationClient from "@/components/admin/transport-configuration-client";
import UberCanceladosPanel from "@/components/erp/uber-cancelados-panel";
import {
  getPendingCancellationCosts,
  getTransportConfiguration,
} from "./actions";

export const dynamic = "force-dynamic";

/**
 * Transporte queda solo con la configuracion de destinos y tarifas.
 *
 * El efectivo por entregar se movio a /admin/cartera y los cortes de choferes
 * a /admin/driver-settlements: son dinero por cobrar y por pagar, no ajustes
 * de transporte, y aqui aparecian mezclados en la misma pantalla.
 */
export default async function TransportPage() {
  const [configuration, pendingCancellationCosts] = await Promise.all([
    getTransportConfiguration(),
    getPendingCancellationCosts(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <ErpPageHeader
        title="Transporte"
        description="Destinos preestablecidos, tarifa externa y reglas operativas"
        actions={
          <>
            <Link
              href="/admin/driver-settlements"
              className="rounded-xl border border-[#C5A55A]/30 bg-[#C5A55A]/[0.08] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.05em] text-[#C5A55A] transition-colors hover:bg-[#C5A55A]/20"
            >
              Cortes de choferes
            </Link>

            <Link
              href="/admin/cartera"
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.05em] text-zinc-300 transition-colors hover:text-white"
            >
              Efectivo por entregar
            </Link>
          </>
        }
      />

      <UberCanceladosPanel initial={pendingCancellationCosts ?? []} />

      <TransportConfigurationClient initial={configuration} />
    </div>
  );
}
