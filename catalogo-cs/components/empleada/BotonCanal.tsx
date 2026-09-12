"use client";

import { useEffect, useState } from "react";
import { MessageCircle, X } from "lucide-react";

import CanalCoordinacion from "@/components/empleada/CanalCoordinacion";

/**
 * El canal con coordinación, siempre a mano.
 *
 * Vivía dentro de una pestaña del portal, y ahí no lo encontraba nadie: quien
 * abre la aplicación mira lo que tiene delante, no repasa las pestañas por si
 * acaso. Ahora es un botón fijo, del lado contrario al de solicitar servicio,
 * con la marca de lo que tiene sin leer encima.
 *
 * La cuenta viene del servidor con el resto del portal para que la marca esté
 * puesta desde el primer instante, y se apaga al abrir: el backend da esos
 * mensajes por leídos en cuanto se pide la conversación, así que dejarla
 * encendida diría algo que ya no es cierto.
 */
export default function BotonCanal({
  token,
  sinLeer,
  abrirAlEntrar = false,
}: {
  token?: string;
  sinLeer: number;
  /** El aviso push lleva a la conversación: se abre sola al aterrizar. */
  abrirAlEntrar?: boolean;
}) {
  const [abierto, setAbierto] = useState(abrirAlEntrar);
  const [pendientes, setPendientes] = useState(sinLeer);

  // El portal se recarga solo cuando llega algo nuevo; la marca sigue a lo que
  // diga el servidor mientras la hoja esté cerrada.
  useEffect(() => {
    if (!abierto) setPendientes(sinLeer);
  }, [sinLeer, abierto]);

  const abrir = () => {
    setAbierto(true);
    setPendientes(0);
  };

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={abrir}
        aria-label={
          pendientes > 0
            ? `Coordinación, ${pendientes} sin leer`
            : "Escribir a coordinación"
        }
        /*
         * A la izquierda y a la misma altura que el de solicitar servicio: los
         * dos se levantan por encima de la barra inferior y del indicador del
         * iPhone, que pegados al borde los dejaba medio tapados.
         */
        className="fixed left-4 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-40 flex items-center gap-2 rounded-full border border-[#C5A55A] bg-black px-5 py-4 text-xs font-bold uppercase tracking-wider text-[#E8D5A3] shadow-lg shadow-black/50 transition-transform active:scale-95"
      >
        <MessageCircle size={18} />
        Mensajes
        {pendientes > 0 ? (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#C5A55A] px-1.5 text-[10px] font-bold tabular-nums text-black">
            {pendientes > 9 ? "9+" : pendientes}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center">
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-white/10 bg-[#0B0D13] p-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-2xl sm:pb-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-heading text-xl font-semibold text-white">
            Coordinación
          </h2>
          <button
            type="button"
            onClick={() => setAbierto(false)}
            aria-label="Cerrar"
            className="rounded-lg border border-white/10 p-2 text-gray-400 transition-colors hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <CanalCoordinacion token={token} />
      </div>
    </div>
  );
}
