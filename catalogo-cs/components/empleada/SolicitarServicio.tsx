"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import { pedirConSesion } from "@/lib/client-fetch";
import { APP_TIME_ZONE } from "@/lib/locale";

/**
 * Solicitud de servicio de la empleada, desde un botón fijo en la esquina.
 *
 * Cuando cuadra un cliente por su cuenta, la única vía era el chat de Telegram,
 * y desde el portal no había forma de pedirlo. El botón está fijo porque este
 * momento no ocurre dentro de ninguna pestaña concreta: pasa mientras habla con
 * el cliente, en cualquier pantalla, y muchas veces con prisa.
 *
 * El formulario existe para que el jefe reciba la solicitud con todo lo que
 * necesita para decidir sin tener que preguntar nada por chat. Por eso la
 * mayoría de campos vienen resueltos: la tarifa sale de su ficha y calcula el
 * monto en cuanto elige las horas, los lugares son los moteles habituales, y la
 * hora arranca en "ahora mismo".
 */

type Tipo = "inmediato" | "pasado";

type Opciones = {
  empleada: { id: string; nombreArtistico: string; precioBaseHora: number };
  ubicaciones: string[];
};

const METODOS = [
  { id: "efectivo", label: "Efectivo" },
  { id: "tarjeta", label: "Tarjeta" },
  { id: "transferencia", label: "Transferencia" },
  { id: "mixto", label: "Mixto" },
] as const;

const DURACIONES = [1, 2, 3, 4, 6, 8, 12];

/**
 * `datetime-local` no entiende zonas: quiere `YYYY-MM-DDTHH:mm` en hora local.
 * Se construye desde las partes ya formateadas en la zona del negocio para que
 * el valor por defecto sea la hora de México y no la del teléfono.
 */
function ahoraParaInput(): string {
  const partes = new Intl.DateTimeFormat("sv-SE", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  return partes.replace(" ", "T");
}

export default function SolicitarServicio() {
  const [abierto, setAbierto] = useState(false);
  const [opciones, setOpciones] = useState<Opciones | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [tipo, setTipo] = useState<Tipo>("inmediato");
  const [cuando, setCuando] = useState(ahoraParaInput);
  const [duracion, setDuracion] = useState(1);
  const [metodo, setMetodo] = useState<string>("efectivo");
  const [monto, setMonto] = useState("");
  const [montoTocado, setMontoTocado] = useState(false);
  const [cliente, setCliente] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (!abierto || opciones) return;
    void (async () => {
      try {
        const respuesta = await pedirConSesion("/api/manual-services/opciones");
        if (!respuesta.ok) return;
        setOpciones((await respuesta.json()) as Opciones);
      } catch (error) {
        // Sin esto el formulario sigue siendo usable, solo que sin autocompletar.
        console.error(error);
      }
    })();
  }, [abierto, opciones]);

  const montoSugerido = useMemo(() => {
    if (!opciones) return null;
    return Math.round(opciones.empleada.precioBaseHora * duracion);
  }, [opciones, duracion]);

  // Mientras no lo corrija a mano, el monto sigue a la tarifa por las horas.
  useEffect(() => {
    if (montoTocado || montoSugerido == null) return;
    setMonto(String(montoSugerido));
  }, [montoSugerido, montoTocado]);

  const cerrar = useCallback(() => {
    setAbierto(false);
    setEnviando(false);
  }, []);

  const enviar = useCallback(async () => {
    const montoNumero = Number(monto);
    if (!Number.isFinite(montoNumero) || montoNumero <= 0) {
      toast.error("Escribe cuánto se cobra.");
      return;
    }
    if (motivo.trim().length < 5) {
      toast.error(
        tipo === "inmediato"
          ? "Cuéntale a tu jefe cómo conseguiste el cliente."
          : "Explica por qué no se registró en su momento.",
      );
      return;
    }

    setEnviando(true);
    try {
      const respuesta = await pedirConSesion("/api/manual-services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          // El input da hora local; el backend la quiere en ISO.
          fechaServicio: new Date(cuando).toISOString(),
          duracionHoras: duracion,
          metodoPago: metodo,
          montoCobrado: montoNumero,
          clienteNombreLibre: cliente.trim() || undefined,
          ubicacion: ubicacion.trim() || undefined,
          motivo: motivo.trim(),
        }),
      });
      if (!respuesta.ok) {
        const detalle = (await respuesta.json().catch(() => null)) as {
          message?: string | string[];
        } | null;
        const mensaje = Array.isArray(detalle?.message)
          ? detalle?.message[0]
          : detalle?.message;
        throw new Error(mensaje || "El servidor rechazó la solicitud");
      }
      toast.success(
        tipo === "inmediato"
          ? "Tu jefe ya la tiene. Te avisamos en cuanto la autorice."
          : "Registro enviado. Te avisamos cuando lo aprueben.",
      );
      setMotivo("");
      setCliente("");
      setUbicacion("");
      setMontoTocado(false);
      cerrar();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo enviar la solicitud.",
      );
      console.error(error);
    } finally {
      setEnviando(false);
    }
  }, [tipo, cuando, duracion, metodo, monto, cliente, ubicacion, motivo, cerrar]);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Solicitar un servicio"
        /*
         * Se levanta por encima de la barra inferior y del indicador del
         * iPhone: pegado al borde quedaba medio tapado en el movil.
         */
        className="fixed right-4 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-40 flex items-center gap-2 rounded-full border border-[#C5A55A] bg-[#C5A55A] px-5 py-4 text-xs font-bold uppercase tracking-wider text-black shadow-lg shadow-black/50 transition-transform active:scale-95"
      >
        <Plus size={18} />
        Solicitar servicio
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center">
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-white/10 bg-[#0B0D13] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-2xl sm:pb-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl font-semibold text-white">
              Solicitar servicio
            </h2>
            <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
              Tu jefe lo revisa y lo autoriza. Rellena lo que sepas: entre más
              completo, más rápido te contesta.
            </p>
          </div>
          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar"
            className="shrink-0 rounded-lg border border-white/10 p-2 text-gray-400 transition-colors hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <Campo etiqueta="¿Qué necesitas?">
            <div className="grid grid-cols-2 gap-2">
              <Opcion
                activa={tipo === "inmediato"}
                onClick={() => setTipo("inmediato")}
                titulo="Lo acabo de cuadrar"
                detalle="Todavía no lo hago"
              />
              <Opcion
                activa={tipo === "pasado"}
                onClick={() => setTipo("pasado")}
                titulo="Ya lo hice"
                detalle="Falta registrarlo"
              />
            </div>
          </Campo>

          <Campo
            etiqueta={tipo === "inmediato" ? "¿A qué hora?" : "¿Cuándo fue?"}
          >
            <input
              type="datetime-local"
              value={cuando}
              onChange={(evento) => setCuando(evento.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black px-3.5 py-3 text-sm text-gray-100 outline-none focus:border-[#C5A55A]"
            />
          </Campo>

          <Campo etiqueta="¿Cuántas horas?">
            <div className="flex flex-wrap gap-2">
              {DURACIONES.map((horas) => (
                <Opcion
                  key={horas}
                  activa={duracion === horas}
                  onClick={() => setDuracion(horas)}
                  titulo={`${horas} h`}
                  compacta
                />
              ))}
            </div>
          </Campo>

          <Campo etiqueta="¿Cómo paga?">
            <div className="flex flex-wrap gap-2">
              {METODOS.map((item) => (
                <Opcion
                  key={item.id}
                  activa={metodo === item.id}
                  onClick={() => setMetodo(item.id)}
                  titulo={item.label}
                  compacta
                />
              ))}
            </div>
          </Campo>

          <Campo
            etiqueta="¿Cuánto se cobra?"
            ayuda={
              montoSugerido != null && !montoTocado
                ? `Calculado con tu tarifa por ${duracion} h. Cámbialo si acordaste otra cosa.`
                : undefined
            }
          >
            <input
              type="number"
              inputMode="decimal"
              value={monto}
              onChange={(evento) => {
                setMontoTocado(true);
                setMonto(evento.target.value);
              }}
              className="w-full rounded-xl border border-white/10 bg-black px-3.5 py-3 text-sm text-gray-100 outline-none focus:border-[#C5A55A]"
            />
          </Campo>

          <Campo etiqueta="¿Dónde?" opcional>
            <input
              type="text"
              list="lugares-habituales"
              value={ubicacion}
              onChange={(evento) => setUbicacion(evento.target.value)}
              placeholder="Motel, hotel o domicilio"
              className="w-full rounded-xl border border-white/10 bg-black px-3.5 py-3 text-sm text-gray-100 outline-none placeholder:text-gray-600 focus:border-[#C5A55A]"
            />
            <datalist id="lugares-habituales">
              {(opciones?.ubicaciones ?? []).map((lugar) => (
                <option key={lugar} value={lugar} />
              ))}
            </datalist>
          </Campo>

          <Campo etiqueta="¿Cómo se llama el cliente?" opcional>
            <input
              type="text"
              value={cliente}
              onChange={(evento) => setCliente(evento.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black px-3.5 py-3 text-sm text-gray-100 outline-none focus:border-[#C5A55A]"
            />
          </Campo>

          <Campo
            etiqueta={
              tipo === "inmediato"
                ? "¿Cómo lo conseguiste?"
                : "¿Por qué no se registró?"
            }
          >
            <textarea
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              rows={3}
              placeholder={
                tipo === "inmediato"
                  ? "Es lo que lee tu jefe para autorizarlo."
                  : "Es lo que lee tu jefe para aprobarlo."
              }
              className="w-full resize-none rounded-xl border border-white/10 bg-black px-3.5 py-3 text-sm text-gray-100 outline-none placeholder:text-gray-600 focus:border-[#C5A55A]"
            />
          </Campo>

          <button
            type="button"
            onClick={() => void enviar()}
            disabled={enviando}
            className="w-full rounded-xl border border-[#C5A55A] bg-[#C5A55A] px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-black transition-opacity disabled:opacity-50"
          >
            {enviando ? "Enviando..." : "Enviar a mi jefe"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Campo({
  etiqueta,
  ayuda,
  opcional = false,
  children,
}: {
  etiqueta: string;
  ayuda?: string;
  opcional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="flex items-baseline gap-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
        {etiqueta}
        {opcional && (
          <span className="text-[10px] font-normal normal-case tracking-normal text-gray-600">
            opcional
          </span>
        )}
      </label>
      <div className="mt-2">{children}</div>
      {ayuda && <p className="mt-1.5 text-[11px] text-gray-500">{ayuda}</p>}
    </div>
  );
}

function Opcion({
  activa,
  onClick,
  titulo,
  detalle,
  compacta = false,
}: {
  activa: boolean;
  onClick: () => void;
  titulo: string;
  detalle?: string;
  compacta?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border text-left transition-colors ${
        compacta ? "px-4 py-2.5" : "px-3.5 py-3"
      } ${
        activa
          ? "border-[#C5A55A] bg-[#C5A55A]/15 text-[#E8D5A3]"
          : "border-white/10 bg-black text-gray-400 hover:border-white/25"
      }`}
    >
      <span className="block text-sm font-semibold">{titulo}</span>
      {detalle && (
        <span className="mt-0.5 block text-[11px] text-gray-500">{detalle}</span>
      )}
    </button>
  );
}
