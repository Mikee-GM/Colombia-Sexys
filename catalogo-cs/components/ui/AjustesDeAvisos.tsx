"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { pedirConSesion } from "@/lib/client-fetch";

/**
 * Que avisos quiere recibir esta persona.
 *
 * Solo aparecen los que se pueden apagar sin romper la operacion: un servicio
 * esperando autorizacion, una oferta de viaje que caduca o un cliente en la
 * puerta llegan siempre, y por eso no tienen interruptor. La lista la sirve el
 * backend, que es el mismo que decide si un aviso sale: escribirla tambien aqui
 * dejaria interruptores que no apagan nada en cuanto las dos se separen.
 *
 * El ajuste es de la persona, no del dispositivo, al reves que la suscripcion
 * de la que cuelga esta tarjeta. Apagar uno lo apaga en todos sus telefonos.
 */

type TipoDeAviso = {
  tipo: string;
  titulo: string;
  descripcion: string;
};

type Respuesta = {
  tipos: TipoDeAviso[];
  apagados: string[];
};

export default function AjustesDeAvisos() {
  const [tipos, setTipos] = useState<TipoDeAviso[] | null>(null);
  const [apagados, setApagados] = useState<string[]>([]);
  const [guardando, setGuardando] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    void (async () => {
      try {
        const respuesta = await pedirConSesion("/api/push/ajustes");
        if (!respuesta.ok) return;
        const datos = (await respuesta.json()) as Respuesta;
        if (!vigente) return;
        setTipos(datos.tipos ?? []);
        setApagados(datos.apagados ?? []);
      } catch (error) {
        // Sin lista no se dibuja nada: la tarjeta de arriba sigue sirviendo.
        console.error(error);
      }
    })();
    return () => {
      vigente = false;
    };
  }, []);

  const alternar = useCallback(
    async (tipo: string) => {
      const siguiente = apagados.includes(tipo)
        ? apagados.filter((t) => t !== tipo)
        : [...apagados, tipo];

      // Se pinta antes de guardar: el interruptor tiene que responder al dedo.
      // Si el guardado falla se vuelve atras, que es peor que no moverse pero
      // mejor que quedarse quieto medio segundo en cada toque.
      const anterior = apagados;
      setApagados(siguiente);
      setGuardando(tipo);
      try {
        const respuesta = await pedirConSesion("/api/push/ajustes", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apagados: siguiente }),
        });
        if (!respuesta.ok) throw new Error(String(respuesta.status));
      } catch (error) {
        setApagados(anterior);
        toast.error("No se pudo guardar el ajuste.");
        console.error(error);
      } finally {
        setGuardando(null);
      }
    },
    [apagados],
  );

  if (!tipos || tipos.length === 0) return null;

  return (
    <div className="mt-4 border-t border-zinc-800 pt-4">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
        Que avisos recibes
      </h3>
      <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
        Lo urgente llega siempre. Aqui solo estan los avisos que puedes apagar,
        y el ajuste vale para todos tus dispositivos.
      </p>

      <ul className="mt-3 flex flex-col gap-1">
        {tipos.map((aviso) => {
          const encendido = !apagados.includes(aviso.tipo);
          return (
            <li key={aviso.tipo}>
              <button
                type="button"
                role="switch"
                aria-checked={encendido}
                disabled={guardando !== null}
                onClick={() => void alternar(aviso.tipo)}
                className="flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-zinc-900/60 disabled:opacity-60"
              >
                <span
                  aria-hidden
                  className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full border p-0.5 transition-colors ${
                    encendido
                      ? "border-[#C5A55A] bg-[#C5A55A]/20"
                      : "border-zinc-700 bg-zinc-900"
                  }`}
                >
                  <span
                    className={`h-3.5 w-3.5 rounded-full transition-transform ${
                      encendido
                        ? "translate-x-4 bg-[#C5A55A]"
                        : "translate-x-0 bg-zinc-600"
                    }`}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-zinc-300">
                    {aviso.titulo}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-zinc-500">
                    {aviso.descripcion}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
