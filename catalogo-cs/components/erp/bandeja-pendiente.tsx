"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Car,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Scale,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import type {
  AreaAsunto,
  AsuntoPendiente,
  SeveridadAsunto,
} from "@/components/erp/asuntos-pendientes";

/**
 * Bandeja unica: lo que espera una decision del administrador.
 *
 * Es lo primero de la pantalla porque es la pregunta con la que se abre el
 * panel --que tengo que hacer ahora-- y hasta ahora no tenia respuesta: habia
 * que recorrer cinco paneles distintos y comparar contadores a ojo.
 *
 * Es un componente de cliente solo por el desplegable de las filas que no
 * caben. Las filas llegan ya construidas y ordenadas desde el servidor.
 */

/** Cuantas filas se ven sin desplegar. Mas abajo ya no se lee, se escanea. */
const VISIBLES = 6;

const ICONO: Record<AreaAsunto, LucideIcon> = {
  transporte: Car,
  dinero: CreditCard,
  disciplina: Scale,
  personal: Users,
  operacion: Wallet,
};

const ETIQUETA: Record<AreaAsunto, string> = {
  transporte: "Transporte",
  dinero: "Dinero",
  disciplina: "Disciplina",
  personal: "Personal",
  operacion: "Operacion",
};

/*
 * La barra de la izquierda es el unico sitio donde se codifica la urgencia con
 * color. El resto de la fila se mantiene neutro para que una bandeja con seis
 * asuntos no parezca una alarma general.
 */
const BARRA: Record<SeveridadAsunto, string> = {
  critica: "bg-red-400",
  alta: "bg-amber-400",
  media: "bg-zinc-600",
};

const TEXTO_ACCION: Record<SeveridadAsunto, string> = {
  critica:
    "border-[#C5A55A] text-[#E8D5A3] hover:bg-[#C5A55A] hover:text-black",
  alta: "border-[#C5A55A]/50 text-[#E8D5A3] hover:border-[#C5A55A]",
  media: "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white",
};

function Fila({ asunto }: { asunto: AsuntoPendiente }) {
  const Icono = ICONO[asunto.area];

  return (
    <Link
      href={asunto.href}
      className="flex items-center gap-3 border-b border-zinc-800/50 px-4 py-3 transition-colors last:border-b-0 hover:bg-zinc-900/40 sm:gap-4 sm:px-5"
    >
      <span
        aria-hidden
        className={`h-8 w-[3px] shrink-0 rounded-sm ${BARRA[asunto.severidad]}`}
      />

      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold leading-snug text-white">
          {asunto.titulo}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-zinc-500">
          {asunto.detalle}
        </p>
      </div>

      {/*
        El area solo cabe a partir de tablet. En el telefono la lleva implicita
        el icono, que si se mantiene siempre.
      */}
      <span className="hidden shrink-0 items-center gap-1.5 text-[11px] text-zinc-500 md:flex">
        <Icono className="h-[13px] w-[13px] text-[#8B7635]" />
        {ETIQUETA[asunto.area]}
      </span>

      <span
        className={`shrink-0 rounded-lg border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.06em] transition-colors ${
          TEXTO_ACCION[asunto.severidad]
        }`}
      >
        {asunto.accion}
      </span>
    </Link>
  );
}

export default function BandejaPendiente({
  asuntos,
}: {
  asuntos: AsuntoPendiente[];
}) {
  const [desplegada, setDesplegada] = useState(false);

  const criticas = asuntos.filter(
    (asunto) => asunto.severidad === "critica",
  ).length;
  const ocultas = Math.max(0, asuntos.length - VISIBLES);
  const mostradas = desplegada ? asuntos : asuntos.slice(0, VISIBLES);

  return (
    <section className="flex flex-col overflow-hidden rounded-2xl border border-[#C5A55A]/35 bg-gradient-to-b from-[#C5A55A]/[0.055] to-black/40">
      <div className="flex flex-col gap-3 border-b border-zinc-800/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <h2 className="font-heading text-base font-semibold tracking-[0.04em] text-[#E8D5A3]">
            Pendiente de ti
          </h2>
          <p className="mt-1 text-[11px] text-zinc-500">
            Ordenado por lo que se rompe antes
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {criticas > 0 ? (
            <span className="rounded-full border border-red-400/40 bg-red-400/10 px-2.5 py-1 text-[11px] font-bold text-red-400">
              {criticas === 1 ? "1 urgente" : `${criticas} urgentes`}
            </span>
          ) : null}

          <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-[11px] font-bold text-zinc-400">
            {asuntos.length === 1 ? "1 en total" : `${asuntos.length} en total`}
          </span>
        </div>
      </div>

      {asuntos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
          <CheckCircle2 className="h-5 w-5 text-green-400" />
          <p className="text-sm text-zinc-400">
            No hay nada esperando una decision tuya.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col">
            {mostradas.map((asunto) => (
              <Fila key={asunto.id} asunto={asunto} />
            ))}
          </div>

          {ocultas > 0 ? (
            <button
              type="button"
              onClick={() => setDesplegada((actual) => !actual)}
              className="flex items-center justify-center gap-1.5 border-t border-zinc-800 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.06em] text-[#C5A55A] transition-colors hover:text-[#E8D5A3]"
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${
                  desplegada ? "rotate-180" : ""
                }`}
              />
              {desplegada
                ? "Ver solo lo urgente"
                : `Ver los ${ocultas} restantes`}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
