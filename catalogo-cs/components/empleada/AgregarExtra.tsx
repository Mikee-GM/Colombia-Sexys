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
 * Lo elegido: un extra de su catalogo, o un precio escrito a mano.
 *
 * El precio libre no apunta a nada del catalogo; el backend lo cuelga del
 * comodin de la modelo, que no es una oferta suya y por eso no aparece en esta
 * lista.
 */
type Seleccion =
  | { tipo: "catalogo"; extra: ExtraDisponible }
  | { tipo: "libre" };

/**
 * Agregar un extra al servicio en curso.
 *
 * En el chat esto son tres mensajes encadenados, porque en Telegram no cabe un
 * formulario y hay que ir preguntando de uno en uno. Aqui se elige el extra y
 * el metodo de pago en la misma pantalla y se manda de una vez.
 *
 * **Solo se ven precios, nunca el nombre del extra.** Esta pantalla se abre con
 * el cliente delante, y el nombre de lo que se esta cobrando no es algo que
 * tenga que quedar a la vista de quien mire el telefono de reojo. Ella reconoce
 * los suyos por el importe. El nombre sigue viajando en la respuesta --lo
 * necesitan el corte y el panel-- pero aqui no se pinta en ningun sitio.
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
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null);
  const [precioLibre, setPrecioLibre] = useState("");
  const [metodo, setMetodo] = useState<Metodo>("efectivo");
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [cargando, startTransition] = useTransition();

  const montoLibre = Number(precioLibre);
  const libreValido =
    seleccion?.tipo === "libre" &&
    Number.isFinite(montoLibre) &&
    montoLibre > 0 &&
    Math.abs(Math.round(montoLibre * 100) - montoLibre * 100) < 1e-8;
  const listoParaAgregar =
    seleccion?.tipo === "catalogo" ||
    (seleccion?.tipo === "libre" && libreValido);

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
    setSeleccion(null);
    setPrecioLibre("");
    setError(null);
  };

  const agregar = () => {
    if (!seleccion || !listoParaAgregar) return;
    const cobrado =
      seleccion.tipo === "catalogo" ? seleccion.extra.precio : montoLibre;
    setError(null);
    startTransition(async () => {
      const resultado = await addServiceExtra(
        servicioId,
        {
          ...(seleccion.tipo === "catalogo"
            ? { extraCatalogoId: seleccion.extra.id }
            : { precioCobrado: montoLibre }),
          metodoPago: metodo,
        },
        token,
      );
      if (!resultado.success) {
        setError(resultado.error ?? "No se pudo agregar el extra.");
        return;
      }
      setExito(
        `Cobrado ${formatCurrency(cobrado)}. Total de extras: ${formatCurrency(
          resultado.totalExtras ?? 0,
        )}.`,
      );
      setSeleccion(null);
      setPrecioLibre("");
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
      ) : (
        <>
          {/*
            Solo importes, en rejilla: son etiquetas cortas y asi caben varias
            por fila en el telefono, que es donde se usa esto.
          */}
          {extras.length > 0 ? (
            <>
              <p className="text-[11px] uppercase tracking-wider text-gray-400">
                Precios de tu catalogo
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {extras.map((extra) => {
                  const elegido =
                    seleccion?.tipo === "catalogo" &&
                    seleccion.extra.id === extra.id;
                  return (
                    <button
                      key={extra.id}
                      type="button"
                      aria-label={`Cobrar ${formatCurrency(extra.precio)}`}
                      aria-pressed={elegido}
                      onClick={() => {
                        setSeleccion({ tipo: "catalogo", extra });
                        setPrecioLibre("");
                      }}
                      className={`rounded-lg border px-2 py-2.5 text-center text-xs font-semibold tabular-nums transition-colors ${
                        elegido
                          ? "border-[#C5A55A] bg-[#C5A55A] text-black"
                          : "border-white/10 text-[#E8D5A3] hover:border-[#C5A55A]/50"
                      }`}
                    >
                      {formatCurrency(extra.precio)}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-xs leading-relaxed text-gray-400">
              No tienes extras registrados en tu catalogo. Puedes cobrar un
              precio a mano.
            </p>
          )}

          {/*
            El precio a mano.

            Es lo que se cobra cuando lo acordado no esta en su catalogo, que
            antes solo se podia hacer desde el chat.
          */}
          {seleccion?.tipo === "libre" ? (
            <div className="space-y-1.5">
              <label
                className="block text-[11px] uppercase tracking-wider text-gray-400"
                htmlFor={`precio-libre-${servicioId}`}
              >
                Precio acordado
              </label>
              <div className="flex gap-1.5">
                <input
                  id={`precio-libre-${servicioId}`}
                  value={precioLibre}
                  onChange={(evento) => setPrecioLibre(evento.target.value)}
                  inputMode="decimal"
                  autoFocus
                  placeholder="0.00"
                  className="min-w-0 flex-1 rounded-lg border border-[#C5A55A]/50 bg-black px-3 py-2 text-sm tabular-nums text-white outline-none placeholder:text-gray-600 focus:border-[#C5A55A]"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSeleccion(null);
                    setPrecioLibre("");
                  }}
                  className="rounded-lg border border-white/10 px-3 text-[11px] font-semibold text-gray-400 transition-colors hover:text-white"
                >
                  Quitar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSeleccion({ tipo: "libre" })}
              className="w-full rounded-lg border border-dashed border-[#C5A55A]/50 px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#E8D5A3] transition-colors hover:border-[#C5A55A]"
            >
              Otro precio
            </button>
          )}

          {listoParaAgregar ? (
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
          disabled={cargando || !listoParaAgregar}
          aria-busy={cargando}
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
