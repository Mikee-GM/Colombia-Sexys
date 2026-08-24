import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser, isRedirectError } from "@/lib/auth";
import { getServices } from "@/lib/data/services";
import { getDrivers } from "@/lib/data/drivers";
import { Panel } from "@/components/erp/primitives";
import TransporteClient from "@/components/erp/transporte-client";
import TransportConfigurationClient from "@/components/admin/transport-configuration-client";
import { getTransportConfiguration } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Transporte: los viajes y su configuracion.
 *
 * El efectivo por entregar vive en /admin/cartera y los cortes de choferes en
 * /admin/driver-settlements: son dinero por cobrar y por pagar, no ajustes de
 * transporte, y aqui aparecian mezclados en la misma pantalla.
 */

/** Degrada una fuente sin tragarse las redirecciones de sesion de apiFetch. */
async function opcional<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("Fuente no disponible en transporte:", error);
    return fallback;
  }
}

export default async function TransportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");

  const [services, drivers, configuration] = await Promise.all([
    opcional(getServices(), []),
    opcional(getDrivers(), []),
    opcional(getTransportConfiguration(), null),
  ]);

  return (
    <TransporteClient services={services ?? []} drivers={drivers ?? []}>
      <Panel
        title="Configuracion de transporte"
        subtitle="destinos preestablecidos y tarifa para ubicaciones externas"
        action={
          <div className="flex flex-wrap items-center gap-2">
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
          </div>
        }
      >
        {configuration ? (
          <TransportConfigurationClient initial={configuration} />
        ) : (
          <p className="text-[13px] text-zinc-500">
            No se pudo cargar la configuracion de transporte.
          </p>
        )}
      </Panel>
    </TransporteClient>
  );
}
