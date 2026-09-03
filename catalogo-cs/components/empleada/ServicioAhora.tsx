"use client";

import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  ImageIcon,
  Wallet,
} from "lucide-react";

import AccionesDelViaje from "@/components/empleada/AccionesDelViaje";
import AgregarExtra from "@/components/empleada/AgregarExtra";
import FinalizarServicio from "@/components/empleada/FinalizarServicio";
import ExtenderServicio from "@/components/empleada/ExtenderServicio";
import PedirProrroga from "@/components/empleada/PedirProrroga";
import { formatCurrency } from "@/lib/calculations";
import { APP_LOCALE, APP_TIME_ZONE } from "@/lib/locale";
import type { EmployeePortalActiveService } from "@/lib/types";

/**
 * Lo primero que ve la modelo al abrir el portal: que tiene ahora y que puede
 * hacer con ello.
 *
 * Antes esto vivia dentro de la pestaña de resumen, por debajo del cambio de
 * jornada y de las tarjetas de ganancias, y ademas se repetia --distinto y sin
 * botones-- en la pestaña de servicios. Quien abria la aplicacion con un
 * servicio en curso tenia que buscarlo. Ahora esta por encima de las pestañas,
 * asi que se ve este donde se este.
 *
 * No hay aqui un servicio "por aceptar": en esta agencia la autorizacion es
 * siempre del jefe, nunca de la modelo, asi que lo que llega a esta pantalla
 * ya viene autorizado.
 */
export default function ServicioAhora({
  servicio,
  token,
  enlaceAPantallaPropia = false,
}: {
  servicio: EmployeePortalActiveService | null;
  token?: string;
  /**
   * En el portal se muestra solo el resumen y un acceso a `/empleada/servicio`.
   *
   * Los botones de trabajo --finalizar, extender, cobrar un extra, pedir
   * prorroga-- viven en esa pantalla, sin las ganancias, el ranking ni las
   * fotos alrededor. Aqui abajo se sigue viendo que hay un servicio, que es lo
   * que no puede faltar al abrir la aplicacion.
   */
  enlaceAPantallaPropia?: boolean;
}) {
  if (!servicio) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3.5">
        <CheckCircle2 size={18} className="shrink-0 text-gray-600" />
        <p className="text-sm text-gray-400">
          No tienes ningún servicio ahora mismo.
        </p>
      </div>
    );
  }

  const enCurso = servicio.estado === "en_curso";

  return (
    <section className="overflow-hidden rounded-2xl border border-emerald-500/40 bg-gradient-to-b from-emerald-950/40 to-black shadow-lg">
      <header className="flex items-center justify-between gap-3 border-b border-emerald-500/20 px-4 py-3">
        <span className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full bg-emerald-400 ${enCurso ? "animate-pulse" : ""}`} />
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
            {enCurso ? "Servicio en curso" : "Servicio asignado"}
          </span>
        </span>
        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
          {servicio.estado.replaceAll("_", " ")}
        </span>
      </header>

      <div className="grid grid-cols-3 gap-px bg-white/5">
        <Dato icono={<Clock3 size={14} />} clave="Duración" valor={`${servicio.duracionHoras} h`} />
        <Dato icono={<Wallet size={14} />} clave="Pago" valor={servicio.metodoPago} />
        <Dato
          icono={<CalendarClock size={14} />}
          clave="Termina"
          valor={formatHora(servicio.horaFinEstimada) ?? "Sin definir"}
        />
      </div>

      <div className="space-y-3 px-4 py-4">
        <p className="text-center text-xs text-gray-400">
          Tu ganancia estimada:{" "}
          <span className="font-bold text-emerald-300">
            {formatCurrency(servicio.gananciaEstimada)}
          </span>
        </p>

        {servicio.transporte && (
          <p className="rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-center text-[11px] text-gray-300">
            Transporte{" "}
            <span className="font-semibold text-white">
              {servicio.transporte.proveedor.toUpperCase()}
            </span>{" "}
            ({servicio.transporte.estado})
            {servicio.transporte.choferNombre && <> · Chofer: {servicio.transporte.choferNombre}</>}
          </p>
        )}

        {/*
          La captura del Uber.

          Con transporte externo es lo unico que le dice en que coche se sube:
          sin ella no sabe ni la placa. Llegaba solo por Telegram, asi que si
          ese chat estaba silenciado o el mensaje quedaba enterrado, no tenia
          donde mirarla. Se abre a tamaño completo porque los datos van escritos
          pequeño dentro de la imagen.
        */}
        {!enlaceAPantallaPropia && servicio.transporte?.uberScreenshotUrl && (
          <a
            href={servicio.transporte.uberScreenshotUrl}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-xl border border-[#C5A55A]/40"
          >
            <span className="flex items-center gap-2 border-b border-[#C5A55A]/25 bg-[#C5A55A]/10 px-3 py-2 text-[11px] font-semibold text-[#E8D5A3]">
              <ImageIcon size={14} />
              Datos de tu Uber
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={servicio.transporte.uberScreenshotUrl}
              alt="Captura con los datos del Uber"
              className="w-full"
            />
          </a>
        )}

        {enlaceAPantallaPropia && (
          <Link
            href="/empleada/servicio"
            className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-4 py-3.5 text-sm font-bold uppercase tracking-wider text-emerald-300 transition-colors hover:bg-emerald-500 hover:text-black"
          >
            Abrir mi servicio
            <ArrowRight size={16} />
          </Link>
        )}

        {/*
          Los botones del chat de Telegram siguen valiendo: esto es una segunda
          via, no un reemplazo, y el estado que decide cual mostrar sale del
          propio viaje, asi que las dos se mantienen sincronizadas solas.
        */}
        {!enlaceAPantallaPropia && servicio.transporte && (
          <AccionesDelViaje transporte={servicio.transporte} token={token} />
        )}

        {/*
          La prorroga solo tiene sentido antes de arrancar: es el margen que se
          pide cuando va con retraso y el cliente ya esta esperando. Una vez
          empezado, lo que se alarga es el servicio, y para eso esta el boton de
          abajo.
        */}
        {!enlaceAPantallaPropia && !enCurso && (
          <PedirProrroga
            servicioId={servicio.id}
            prorrogasUsadas={servicio.prorrogasUsadas ?? 0}
            token={token}
          />
        )}

        {/* Extras y cierre: solo sobre un servicio ya arrancado. */}
        {!enlaceAPantallaPropia && enCurso && (
          <>
            <AgregarExtra servicioId={servicio.id} token={token} />
            {/* Extender va antes de finalizar: el orden es el de lo que ocurre
                --primero se alarga, al final se cierra-- y ademas aleja el
                boton de cierre del resto. */}
            <ExtenderServicio servicioId={servicio.id} token={token} />
            <FinalizarServicio servicioId={servicio.id} token={token} />
          </>
        )}
      </div>
    </section>
  );
}

function Dato({ icono, clave, valor }: { icono: React.ReactNode; clave: string; valor: string }) {
  return (
    <div className="bg-black/40 px-3 py-3 text-center">
      <span className="flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-500">
        {icono}
        {clave}
      </span>
      <span className="mt-1 block truncate text-sm font-bold capitalize text-white">{valor}</span>
    </div>
  );
}

function formatHora(iso?: string | null) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat(APP_LOCALE, {
      timeZone: APP_TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return null;
  }
}
