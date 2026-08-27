"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, X } from "lucide-react";

import {
  codigoServicio,
  Panel,
  StatusBadge,
  type BadgeTone,
} from "@/components/erp/primitives";
import { formatCurrency } from "@/lib/calculations";
import { APP_LOCALE, APP_TIME_ZONE } from "@/lib/locale";

/**
 * Comprobante de transferencia con su imagen.
 *
 * Es el minimo que sirve tanto al detalle de un servicio como al corte de una
 * empleada: en el primero el servicio se da por sabido, en el segundo hace
 * falta para saber a cual de todos pertenece cada captura.
 */
export type ComprobanteTransferencia = {
  id: string;
  url: string;
  estado?: string | null;
  monto?: number | null;
  createdAt: string;
  servicioId?: string | null;
  clienteTelegram?: string | null;
  observaciones?: string | null;
};

const ESTADO_TONE: Record<string, BadgeTone> = {
  APROBADO: "green",
  PENDIENTE_REVISION: "amber",
  RECHAZADO: "red",
  CUENTA_NO_AUTORIZADA: "red",
};

function fechaHora(iso: string) {
  try {
    return new Intl.DateTimeFormat(APP_LOCALE, {
      timeZone: APP_TIME_ZONE,
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function etiquetaEstado(estado?: string | null) {
  return estado ? estado.replaceAll("_", " ").toLowerCase() : "sin estado";
}

/**
 * Galeria de comprobantes de transferencia.
 *
 * Hasta ahora el comprobante figuraba como una fila con su fecha y su estado,
 * pero la imagen solo se podia abrir desde la pantalla de Evidencias, lejos del
 * servicio o del corte que se estaba mirando. Verificar un cobro obligaba a
 * saltar de pantalla y a emparejar a mano por fecha y monto.
 *
 * La miniatura abre la captura en grande sin salir de la pagina; el enlace al
 * original queda para cuando hay que leer una referencia diminuta y hace falta
 * el zoom del navegador.
 */
export default function ComprobantesTransferencia({
  comprobantes,
  title = "Comprobantes de transferencia",
  subtitle,
  /** En el corte de la empleada cada captura necesita decir de que servicio es. */
  mostrarServicio = false,
  vacio = "No hay comprobantes de transferencia registrados.",
}: {
  comprobantes: ComprobanteTransferencia[];
  title?: string;
  subtitle?: string;
  mostrarServicio?: boolean;
  vacio?: string;
}) {
  const [ampliado, setAmpliado] = useState<ComprobanteTransferencia | null>(
    null,
  );

  return (
    <Panel
      title={title}
      subtitle={subtitle ?? "validacion_comprobante - imagen"}
      action={
        comprobantes.length > 0 ? (
          <StatusBadge tone="zinc">
            {`${comprobantes.length} ${
              comprobantes.length === 1 ? "captura" : "capturas"
            }`}
          </StatusBadge>
        ) : undefined
      }
    >
      {comprobantes.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">{vacio}</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {comprobantes.map((comprobante) => (
            <div key={comprobante.id} className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setAmpliado(comprobante)}
                className="group relative aspect-3/4 overflow-hidden rounded-xl border border-zinc-800 bg-black transition-colors hover:border-[#C5A55A]/50"
                title="Ver el comprobante en grande"
              >
                <Image
                  src={comprobante.url}
                  alt={`Comprobante del ${fechaHora(comprobante.createdAt)}`}
                  fill
                  sizes="(max-width: 640px) 50vw, (max-width: 1280px) 33vw, 25vw"
                  className="object-cover transition-opacity group-hover:opacity-80"
                />
              </button>

              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold text-white">
                    {comprobante.monto == null
                      ? "Sin monto"
                      : formatCurrency(comprobante.monto)}
                  </span>
                  <StatusBadge
                    tone={
                      ESTADO_TONE[(comprobante.estado ?? "").toUpperCase()] ??
                      "amber"
                    }
                  >
                    {etiquetaEstado(comprobante.estado)}
                  </StatusBadge>
                </div>

                <span className="text-[11px] text-zinc-500">
                  {fechaHora(comprobante.createdAt)}
                </span>

                {mostrarServicio && comprobante.servicioId ? (
                  <Link
                    href={`/admin/services/${comprobante.servicioId}`}
                    className="w-fit text-[11px] font-semibold text-[#C5A55A] hover:underline"
                  >
                    {codigoServicio(comprobante.servicioId)}
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {ampliado && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
            onClick={(evento) => {
              if (evento.target === evento.currentTarget) setAmpliado(null);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="flex max-h-full w-full max-w-3xl flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-0.5">
                  <span className="font-heading text-lg text-white">
                    {ampliado.monto == null
                      ? "Comprobante de transferencia"
                      : formatCurrency(ampliado.monto)}
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    {fechaHora(ampliado.createdAt)}
                    {ampliado.clienteTelegram
                      ? ` - ${ampliado.clienteTelegram}`
                      : ""}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setAmpliado(null)}
                  className="rounded-lg border border-zinc-700 p-2 text-zinc-400 transition-colors hover:border-zinc-500 hover:text-white"
                  title="Cerrar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="relative h-[70vh] w-full overflow-hidden rounded-xl border border-zinc-800 bg-black">
                <Image
                  src={ampliado.url}
                  alt={`Comprobante del ${fechaHora(ampliado.createdAt)}`}
                  fill
                  sizes="(max-width: 768px) 100vw, 768px"
                  className="object-contain"
                />
              </div>

              {ampliado.observaciones ? (
                <p className="text-xs leading-relaxed text-zinc-400">
                  {ampliado.observaciones}
                </p>
              ) : null}

              <a
                href={ampliado.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center gap-2 rounded-lg border border-[#C5A55A]/40 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.04em] text-[#E8D5A3] transition-colors hover:bg-[#C5A55A] hover:text-black"
              >
                Abrir original
                <ExternalLink className="h-3 w-3" />
              </a>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Panel>
  );
}
