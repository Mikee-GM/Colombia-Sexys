import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import AjustesDeAvisos from "@/components/ui/AjustesDeAvisos";
import AvisosPush from "@/components/ui/AvisosPush";

/**
 * Configuracion de avisos, en su propia pantalla.
 *
 * Antes las dos piezas se pintaban arriba del todo en el portal de la empleada,
 * en el del chofer y en el panel del jefe. Como la suscripcion es por
 * dispositivo, la tarjeta reaparecia en cada telefono nuevo y se quedaba fija
 * en pantalla compitiendo con lo unico que importa cuando hay un servicio en
 * marcha. Configurar avisos es algo que se hace una vez, asi que vive donde se
 * entra a proposito.
 *
 * Las dos tarjetas responden a preguntas distintas y por eso van separadas:
 * arriba, si ESTE aparato recibe avisos; abajo, cuales quiere recibir la
 * persona en todos los suyos.
 */
export default function PaginaDeAvisos({
  volverA,
  volverTexto = "Volver",
}: {
  /** A donde vuelve. Cada rol tiene su propia pantalla principal. */
  volverA: string;
  volverTexto?: string;
}) {
  return (
    <div className="mx-auto w-full max-w-lg space-y-5">
      <div>
        <Link
          href={volverA}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 transition-colors hover:text-[#C5A55A]"
        >
          <ArrowLeft size={14} />
          {volverTexto}
        </Link>
        <h1 className="mt-3 font-heading text-3xl font-semibold text-white">
          Avisos
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Configura en qué dispositivos recibes avisos y cuáles quieres recibir.
        </p>
      </div>

      <AvisosPush />
      <AjustesDeAvisos />
    </div>
  );
}
