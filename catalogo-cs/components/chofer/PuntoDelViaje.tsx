"use client";

import { Copy, ExternalLink, Navigation } from "lucide-react";
import { toast } from "sonner";

/**
 * Un punto del viaje, con los botones para llegar hasta el.
 *
 * El portal del chofer decia la zona --"montecarlo"-- y nada mas: para ver
 * donde queda algo habia que volver a Telegram y buscar el mensaje de la
 * oferta, que es donde vivia el unico enlace al mapa. Conduciendo, eso es
 * justo lo que no se puede hacer.
 *
 * "Como llegar" va primero y en dorado porque es lo que el chofer necesita el
 * 95% de las veces; ver el punto en el mapa y copiarlo son para cuando algo no
 * cuadra y tiene que hablarlo con el jefe.
 */
export default function PuntoDelViaje({
  etiqueta,
  lat,
  lng,
  detalle,
}: {
  etiqueta: string;
  lat: string | null;
  lng: string | null;
  /** Segunda linea: el sitio, la habitacion, la direccion. */
  detalle?: string | null;
}) {
  const hayPunto = Boolean(Number(lat) && Number(lng));
  if (!hayPunto && !detalle) return null;

  const consulta = hayPunto
    ? `${lat},${lng}`
    : encodeURIComponent(detalle ?? "");
  const enElMapa = `https://www.google.com/maps/search/?api=1&query=${consulta}`;
  const comoLlegar = `https://www.google.com/maps/dir/?api=1&destination=${consulta}`;
  const paraCopiar = hayPunto ? `${lat},${lng}` : (detalle ?? "");

  async function copiar() {
    try {
      await navigator.clipboard.writeText(paraCopiar);
      toast.success("Ubicacion copiada");
    } catch {
      // Sin permiso de portapapeles --o fuera de https-- no hay nada que hacer
      // desde aqui, pero el chofer tiene que enterarse de que no se copio.
      toast.error("No se pudo copiar la ubicacion");
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-500">
        {etiqueta}
      </p>
      {detalle ? (
        <p className="mt-1 text-sm leading-relaxed text-gray-300">{detalle}</p>
      ) : null}
      {!hayPunto ? (
        <p className="mt-1 text-[11px] text-amber-400">
          Sin coordenadas: se busca por el nombre del sitio.
        </p>
      ) : null}

      <div className="mt-2.5 grid grid-cols-3 gap-2">
        <a
          href={comoLlegar}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-[#C5A55A] px-2 text-[11px] font-bold uppercase tracking-wider text-black transition-colors hover:bg-[#d8b769]"
        >
          <Navigation size={14} />
          Ir
        </a>

        <a
          href={enElMapa}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-white/15 px-2 text-[11px] font-semibold text-gray-300 transition-colors hover:text-white"
        >
          <ExternalLink size={14} />
          Mapa
        </a>

        <button
          type="button"
          onClick={copiar}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-white/15 px-2 text-[11px] font-semibold text-gray-300 transition-colors hover:text-white"
        >
          <Copy size={14} />
          Copiar
        </button>
      </div>
    </div>
  );
}

/**
 * El texto de un punto: el sitio, la habitacion y la direccion, en una linea.
 *
 * Vive aqui y no en cada pantalla porque el viaje en curso y la oferta lo
 * arman igual, y son datos que pueden faltar los tres.
 */
export function detalleDelDestino(trip: {
  lugar: string | null;
  habitacion: string | null;
  direccion: string | null;
}) {
  return (
    [
      trip.lugar,
      trip.habitacion ? `Hab. ${trip.habitacion}` : null,
      trip.direccion,
    ]
      .filter(Boolean)
      .join(" - ") || null
  );
}
