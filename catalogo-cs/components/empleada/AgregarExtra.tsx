"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";

import {
  addServiceExtra,
  getAvailableExtras,
  type ExtraDisponible,
} from "@/lib/actions/employee-portal";
import { formatCurrency } from "@/lib/calculations";

const METODOS = [
  { id: "efectivo", etiqueta: "Efectivo" },
  { id: "tarjeta", etiqueta: "Tarjeta" },
  { id: "transferencia", etiqueta: "Transferencia" },
] as const;

type Metodo = (typeof METODOS)[number]["id"];

/**
 * Agregar un extra al servicio en curso.
 *
 * En el chat esto son tres mensajes encadenados, porque en Telegram no cabe un
 * formulario y hay que ir preguntando de uno en uno. Aqui se elige el extra y
 * el metodo de pago en la misma pantalla y se manda de una vez.
 *
 * El catalogo se pide al abrir y no al cargar el portal: son extras de un
 * servicio en curso, y la mayoria de las veces no se abre esto en toda la
 * jornada.
 */
export default function AgregarExtra({
  servicioId,
  token,
}: {
  servicioId: string;
  token?: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [extras, setExtras] = useState<ExtraDisponible[] | null>(null);
  const [elegido, setElegido] = useState<ExtraDisponible | null>(null);
  const [metodo, setMetodo] = useState<Metodo>("efectivo");
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [cargando, startTransition] = useTransition();

  const abrir = () => {
    setAbierto(true);
    setError(null);
    setExito(null);
    startTransition(async () => {
      const resultado = await getAvailableExtras(servicioId, token);
      if (!resultado.success) {
        setError(resultado.error ?? "No se pudieron cargar tus extras.");
        return;
      }
      setExtras(resultado.extras ?? []);
    });
  };

  const cerrar = () => {
    setAbierto(false);
    setElegido(null);
    setError(null);
  };

  const agregar = () => {
    if (!elegido) return;
    setError(null);
    startTransition(async () => {
      const resultado = await addServiceExtra(
        servicioId,
        elegido.id,
        metodo,
        token,
      );
      if (!resultado.success) {
        setError(resultado.error ?? "No se pudo agregar el extra.");
        return;
      }
      setExito(
        `${elegido.nombre} agregado. Total de extras: ${formatCurrency(
          resultado.totalExtras ?? 0,
        )}.`,
      );
      setElegido(null);
      setAbierto(false);
      router.refresh();
    });
  };

  if (!abierto) {
    return (
      <div className="mt-3 space-y-2">
        <button
          type="button"
          onClick={abrir}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#C5A55A] px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#E8D5A3] transition-colors hover:bg-[#C5A55A] hover:text-black"
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar extra
        </button>

        {exito ? <p className="text-xs text-emerald-400">{exito}</p> : null}
        {error ? <p className="text-xs text-red-400">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-[#C5A55A]/30 bg-[#C5A55A]/[0.06] p-4">
      <p className="text-xs font-semibold text-white">Agregar un extra</p>

      {extras === null ? (
        <p className="text-xs text-gray-400">Cargando tu catalogo</p>
      ) : extras.length === 0 ? (
        <p className="text-xs leading-relaxed text-gray-400">
          No tienes extras registrados en tu catalogo. Pidele a administracion
          que los configure.
        </p>
      ) : (
        <>
          <div className="space-y-1.5">
            {extras.map((extra) => (
              <button
                key={extra.id}
                type="button"
                onClick={() => setElegido(extra)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                  elegido?.id === extra.id
                    ? "border-[#C5A55A] bg-[#C5A55A]/15 text-white"
                    : "border-white/10 text-gray-300 hover:border-[#C5A55A]/40"
                }`}
              >
                <span className="truncate">{extra.nombre}</span>
                <span className="shrink-0 font-semibold text-[#E8D5A3]">
                  {formatCurrency(extra.precio)}
                </span>
              </button>
            ))}
          </div>

          {elegido ? (
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-wider text-gray-400">
                Como lo paga el cliente
              </p>
              <div className="flex gap-1.5">
                {METODOS.map((opcion) => (
                  <button
                    key={opcion.id}
                    type="button"
                    onClick={() => setMetodo(opcion.id)}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                      metodo === opcion.id
                        ? "border-[#C5A55A] bg-[#C5A55A] text-black"
                        : "border-white/10 text-gray-400 hover:text-white"
                    }`}
                  >
                    {opcion.etiqueta}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}

      {error ? <p className="text-xs text-red-400">{error}</p> : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={agregar}
          disabled={cargando || !elegido}
          className="flex-1 rounded-lg border border-[#C5A55A] bg-[#C5A55A]/10 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[#E8D5A3] transition-colors hover:bg-[#C5A55A] hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
        >
          {cargando ? "Guardando" : "Agregar"}
        </button>

        <button
          type="button"
          onClick={cerrar}
          disabled={cargando}
          className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400 transition-colors hover:text-white disabled:opacity-40"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
