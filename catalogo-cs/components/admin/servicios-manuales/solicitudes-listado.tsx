"use client";

import { useState, useTransition } from "react";

import {
  aprobarSolicitudManual,
  getSolicitudesManuales,
  rechazarSolicitudManual,
} from "@/lib/actions/servicios-manuales";
import type { SolicitudServicioManual } from "@/lib/types";

const ESTADOS = [
  { valor: "pendiente", etiqueta: "Pendientes" },
  { valor: "aprobada", etiqueta: "Aprobadas" },
  { valor: "rechazada", etiqueta: "Rechazadas" },
  { valor: "", etiqueta: "Todas" },
] as const;

const METODOS: Record<SolicitudServicioManual["metodoPago"], string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  mixto: "Mixto",
};

/**
 * Solicitudes de registro de servicios ocurridos fuera del sistema.
 *
 * Autorizar una crea el servicio de verdad, y ese servicio entra en el corte de
 * la empleada. La decision se toma con lo que declaro delante --fecha,
 * duracion, cobro y el motivo por el que no paso por el sistema--, asi que la
 * lista muestra todo el detalle en vez de obligar a abrir cada una.
 */
export default function SolicitudesListado({
  inicial,
}: {
  inicial: SolicitudServicioManual[];
}) {
  const [estado, setEstado] = useState<string>("pendiente");
  const [solicitudes, setSolicitudes] = useState(inicial);
  const [notas, setNotas] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [cargando, startTransition] = useTransition();

  const recargar = (siguiente: string) => {
    setEstado(siguiente);
    setError(null);
    startTransition(async () => {
      setSolicitudes(await getSolicitudesManuales(siguiente || undefined));
    });
  };

  const resolver = (
    id: string,
    accion: typeof aprobarSolicitudManual | typeof rechazarSolicitudManual,
  ) => {
    setError(null);
    startTransition(async () => {
      const resultado = await accion(id, notas[id]?.trim() ?? "");
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setSolicitudes(await getSolicitudesManuales(estado || undefined));
    });
  };

  const fechaHora = (valor: string) =>
    new Date(valor).toLocaleString("es-MX", {
      timeZone: "America/Mexico_City",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const dinero = (valor: number) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 0,
    }).format(valor);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-cormorant)] text-3xl text-white">
            Servicios registrados a mano
          </h1>
          <p className="mt-1 max-w-2xl text-xs uppercase tracking-[0.14em] text-zinc-500">
            Servicios ocurridos fuera del sistema que esperan autorizacion
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ESTADOS.map((opcion) => (
            <button
              key={opcion.valor || "todas"}
              type="button"
              onClick={() => recargar(opcion.valor)}
              className={
                estado === opcion.valor
                  ? "rounded-full border border-[#C5A55A] px-4 py-1.5 text-xs uppercase tracking-[0.14em] text-[#C5A55A]"
                  : "rounded-full border border-zinc-800 px-4 py-1.5 text-xs uppercase tracking-[0.14em] text-zinc-500 transition-colors hover:text-zinc-300"
              }
            >
              {opcion.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      {solicitudes.length === 0 ? (
        <p className="rounded-2xl border border-zinc-800 bg-zinc-950 px-5 py-10 text-center text-sm text-zinc-500">
          {cargando ? "Cargando" : "No hay solicitudes en este estado"}
        </p>
      ) : null}

      <div className="flex flex-col gap-4">
        {solicitudes.map((solicitud) => (
          <article
            key={solicitud.id}
            className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-[family-name:var(--font-cormorant)] text-xl text-white">
                  {solicitud.empleada?.nombreArtistico ?? "Empleada"}
                </h2>
                <p className="mt-1 text-xs uppercase tracking-[0.14em] text-zinc-500">
                  Solicitada el {fechaHora(solicitud.createdAt)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/*
                  Los dos tipos se resuelven distinto y hay que distinguirlos de
                  un vistazo: el que ya ocurrio solo se asienta para el corte,
                  el que aun no se hace deja a una empleada esperando para
                  salir. Ese va marcado en dorado.
                */}
                {solicitud.tipo === "inmediato" ? (
                  <span className="rounded-full border border-[#C5A55A] bg-[#C5A55A]/15 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-[#E8D5A3]">
                    Aun no lo hace
                  </span>
                ) : (
                  <span className="rounded-full border border-zinc-800 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                    Ya ocurrio
                  </span>
                )}
                <span className="rounded-full border border-zinc-800 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-zinc-400">
                  {solicitud.estado}
                </span>
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-4">
              <div>
                <dt className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                  Cliente
                </dt>
                <dd className="mt-0.5 text-zinc-200">
                  {solicitud.cliente?.nombreTelegram ??
                    solicitud.clienteNombreLibre ??
                    "Sin registrar"}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                  {solicitud.tipo === "inmediato" ? "Para cuando" : "Cuando fue"}
                </dt>
                <dd className="mt-0.5 text-zinc-200">
                  {fechaHora(solicitud.fechaServicio)}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                  Duracion
                </dt>
                <dd className="mt-0.5 text-zinc-200">
                  {solicitud.duracionHoras} h
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                  Cobro
                </dt>
                <dd className="mt-0.5 text-[#C5A55A]">
                  {dinero(solicitud.montoCobrado)}
                  <span className="ml-2 text-xs text-zinc-500">
                    {METODOS[solicitud.metodoPago]}
                  </span>
                </dd>
              </div>
            </dl>

            {solicitud.ubicacion ? (
              <p className="mt-3 text-sm text-zinc-400">
                <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                  Donde
                </span>{" "}
                {solicitud.ubicacion}
              </p>
            ) : null}

            <p className="mt-3 rounded-xl border border-zinc-900 bg-black/40 px-4 py-3 text-sm text-zinc-300">
              <span className="block text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                {solicitud.tipo === "inmediato"
                  ? "Como consiguio el cliente"
                  : "Por que no paso por el sistema"}
              </span>
              {solicitud.motivo}
            </p>

            {solicitud.estado === "pendiente" ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  value={notas[solicitud.id] ?? ""}
                  onChange={(evento) =>
                    setNotas((previas) => ({
                      ...previas,
                      [solicitud.id]: evento.target.value,
                    }))
                  }
                  placeholder="Nota para la empleada (obligatoria al rechazar)"
                  className="min-w-64 flex-1 rounded-xl border border-zinc-800 bg-black px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-[#C5A55A] focus:outline-none"
                />
                <button
                  type="button"
                  disabled={cargando}
                  onClick={() => resolver(solicitud.id, aprobarSolicitudManual)}
                  className="rounded-xl border border-[#C5A55A] px-5 py-2.5 text-xs uppercase tracking-[0.14em] text-[#C5A55A] transition-colors hover:bg-[#C5A55A] hover:text-black disabled:opacity-50"
                >
                  Autorizar y registrar
                </button>
                <button
                  type="button"
                  disabled={cargando}
                  onClick={() => resolver(solicitud.id, rechazarSolicitudManual)}
                  className="rounded-xl border border-zinc-700 px-5 py-2.5 text-xs uppercase tracking-[0.14em] text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50"
                >
                  Rechazar
                </button>
              </div>
            ) : (
              <p className="mt-4 text-xs text-zinc-500">
                {solicitud.resueltoAt
                  ? "Resuelta el " + fechaHora(solicitud.resueltoAt)
                  : "Resuelta"}
                {solicitud.notaResolucion ? ". " + solicitud.notaResolucion : ""}
              </p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
