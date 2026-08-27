"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { AlertTriangle, CheckCircle2, Clock, Upload } from "lucide-react";

import {
  getMyWeeklyPhotos,
  uploadMyWeeklyPhotos,
} from "@/lib/actions/employee-portal";
import { formatCurrency } from "@/lib/calculations";
import { APP_LOCALE, APP_TIME_ZONE } from "@/lib/locale";
import type {
  EmployeeWeeklyContent,
  WeeklyPhotoSubmissionItem,
} from "@/lib/types";

/**
 * Fotos semanales de la modelo: en que va su ciclo y como subirlas.
 *
 * Antes las mandaba por el chat del bot y no volvia a saber de ellas: no sabia
 * cuales habian llegado, en que quedaron, ni cuantos avisos llevaba encima. Con
 * la subida aqui, las tres cosas se ven en la misma pantalla.
 */

const ESTADO_ENVIO: Record<
  WeeklyPhotoSubmissionItem["estado"],
  { etiqueta: string; clase: string }
> = {
  pendiente: {
    etiqueta: "En revision",
    clase: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  },
  aprobada_publica: {
    etiqueta: "En el catalogo",
    clase: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  aprobada_privada: {
    etiqueta: "Exclusiva",
    clase: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  },
  rechazada: {
    etiqueta: "No aprobada",
    clase: "bg-red-500/15 text-red-300 border-red-500/30",
  },
};

function fechaCorta(iso: string) {
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

/**
 * Aviso del estado del ciclo.
 *
 * Se muestra tambien en el resumen, no solo en la pestaña de fotos: si solo
 * viviera dentro de "Mis Fotos", la modelo que no entra ahi nunca se entera de
 * que va acumulando recordatorios.
 */
export function AvisoFotosSemanales({
  estado,
  onIrAFotos,
}: {
  estado: EmployeeWeeklyContent;
  /** Lleva a la pestaña de fotos. Se omite cuando ya se esta en ella. */
  onIrAFotos?: () => void;
}) {
  if (estado.estado === "sin_solicitar") return null;

  const multada = Boolean(estado.multaAplicadaAt);
  const atrasada = estado.estado === "atrasado";

  if (!atrasada && !multada) {
    const enRevision = estado.estado === "pendiente_revision";
    return (
      <div className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
        {enRevision ? (
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">
            {enRevision
              ? "Tus fotos estan en revision"
              : "Tus fotos de la semana estan al dia"}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-400">
            {enRevision
              ? `${estado.fotosPendientesDeRevision} ${
                  estado.fotosPendientesDeRevision === 1
                    ? "foto esta esperando"
                    : "fotos estan esperando"
                } la aprobacion de administracion.`
              : "No tienes nada pendiente para el ciclo de esta semana."}
          </p>
        </div>
      </div>
    );
  }

  const restantes = estado.recordatoriosRestantes;

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border p-4 ${
        multada
          ? "border-red-500/30 bg-red-500/[0.07]"
          : "border-amber-500/30 bg-amber-500/[0.07]"
      }`}
    >
      <AlertTriangle
        className={`mt-0.5 h-4 w-4 shrink-0 ${
          multada ? "text-red-400" : "text-amber-400"
        }`}
      />

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white">
          {multada
            ? "Se aplico una multa por tus fotos semanales"
            : "Aun no has subido tus fotos de esta semana"}
        </p>

        <p className="mt-0.5 text-xs leading-relaxed text-gray-400">
          {multada
            ? `Se agotaron los ${estado.maxRecordatorios} recordatorios y se cargo una multa de ${formatCurrency(
                estado.importeMulta,
              )} a tu corte. Todavia puedes subirlas para regularizar tu catalogo.`
            : restantes > 0
              ? `Llevas ${estado.recordatoriosEnviados} de ${estado.maxRecordatorios} recordatorios. Te ${
                  restantes === 1 ? "queda" : "quedan"
                } ${restantes} antes de que se aplique una multa de ${formatCurrency(
                  estado.importeMulta,
                )}.`
              : `Llevas ${estado.recordatoriosEnviados} de ${estado.maxRecordatorios} recordatorios. Este es el ultimo: si no las subes, se aplicara una multa de ${formatCurrency(
                  estado.importeMulta,
                )}.`}
        </p>

        {/* Los avisos gastados, de un vistazo. */}
        <div className="mt-2.5 flex items-center gap-1.5">
          {Array.from({ length: estado.maxRecordatorios }).map((_, indice) => (
            <span
              key={indice}
              className={`h-1.5 flex-1 rounded-full ${
                indice < estado.recordatoriosEnviados
                  ? multada
                    ? "bg-red-400"
                    : "bg-amber-400"
                  : "bg-white/10"
              }`}
            />
          ))}
        </div>

        {onIrAFotos ? (
          <button
            type="button"
            onClick={onIrAFotos}
            className="mt-3 rounded-lg border border-[#C5A55A]/40 bg-[#C5A55A]/10 px-3 py-1.5 text-xs font-semibold text-[#E8D5A3] transition-colors hover:bg-[#C5A55A] hover:text-black"
          >
            Subir mis fotos ahora
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Selector y subida de las fotos de la semana.
 *
 * Se envian todas en una sola peticion porque nadie sube una sola foto, y se
 * previsualizan antes de mandarlas para que un archivo equivocado se quite
 * antes y no despues, cuando ya estaria en la cola de revision.
 */
export default function SubirFotosSemanales({
  estadoInicial,
  enviosIniciales,
  token,
}: {
  estadoInicial: EmployeeWeeklyContent;
  enviosIniciales: WeeklyPhotoSubmissionItem[];
  token?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [seleccion, setSeleccion] = useState<File[]>([]);
  const [estado, setEstado] = useState(estadoInicial);
  const [envios, setEnvios] = useState(enviosIniciales);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [subiendo, startTransition] = useTransition();

  const elegir = (lista: FileList | null) => {
    setError(null);
    setExito(null);
    setSeleccion(lista ? Array.from(lista).slice(0, 12) : []);
  };

  const quitar = (indice: number) =>
    setSeleccion((actual) => actual.filter((_, i) => i !== indice));

  const subir = () => {
    if (seleccion.length === 0) return;

    const formData = new FormData();
    for (const foto of seleccion) formData.append("fotos", foto);

    startTransition(async () => {
      const resultado = await uploadMyWeeklyPhotos(formData, token);

      if (!resultado.success) {
        setError(resultado.error ?? "No se pudieron subir las fotos.");
        return;
      }

      setSeleccion([]);
      if (inputRef.current) inputRef.current.value = "";
      setError(null);
      setExito(
        `${resultado.subidas} ${
          resultado.subidas === 1 ? "foto enviada" : "fotos enviadas"
        } a revision.`,
      );
      if (resultado.estado) setEstado(resultado.estado);

      // Se recargan los envios para que las nuevas aparezcan con su estado.
      const refresco = await getMyWeeklyPhotos(token);
      if (refresco.success && refresco.envios) setEnvios(refresco.envios);
    });
  };

  return (
    <div className="space-y-6">
      <AvisoFotosSemanales estado={estado} />

      <div className="space-y-4 rounded-xl border border-white/5 bg-[#141721] p-5">
        <div>
          <h3 className="text-sm font-bold text-white">
            Subir fotos de la semana
          </h3>
          <p className="mt-0.5 text-xs text-gray-400">
            Hasta 12 fotos por envio, en JPG, PNG o WEBP. Administracion las
            revisa y decide si van al catalogo publico o a las exclusivas.
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(evento) => elegir(evento.target.files)}
          className="block w-full cursor-pointer rounded-lg border border-white/10 bg-black/40 text-xs text-gray-400 file:mr-3 file:cursor-pointer file:rounded-l-lg file:border-0 file:bg-[#C5A55A]/15 file:px-4 file:py-2.5 file:text-xs file:font-semibold file:text-[#E8D5A3] hover:file:bg-[#C5A55A]/25"
        />

        {seleccion.length > 0 ? (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {seleccion.map((foto, indice) => (
              <div
                key={`${foto.name}-${indice}`}
                className="relative aspect-[3/4] overflow-hidden rounded-lg border border-white/10 bg-black/40"
              >
                {/*
                  Previsualizacion local con URL.createObjectURL: la foto aun no
                  existe en el servidor, asi que next/image no tiene nada que
                  optimizar todavia.
                */}
                <img
                  src={URL.createObjectURL(foto)}
                  alt={`Foto seleccionada ${indice + 1}`}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => quitar(indice)}
                  disabled={subiendo}
                  className="absolute right-1 top-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-50"
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {error ? <p className="text-xs text-red-400">{error}</p> : null}
        {exito ? <p className="text-xs text-emerald-400">{exito}</p> : null}

        <button
          type="button"
          onClick={subir}
          disabled={subiendo || seleccion.length === 0}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#C5A55A] bg-transparent px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#E8D5A3] transition-colors hover:bg-[#C5A55A] hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Upload className="h-3.5 w-3.5" />
          {subiendo
            ? "Subiendo"
            : seleccion.length === 0
              ? "Selecciona tus fotos"
              : `Enviar ${seleccion.length} ${
                  seleccion.length === 1 ? "foto" : "fotos"
                }`}
        </button>
      </div>

      <div className="space-y-4 rounded-xl border border-white/5 bg-[#141721] p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">
              Lo que enviaste esta semana
            </h3>
            <p className="text-xs text-gray-400">
              {`Ciclo que abrio el ${estado.semanaInicio}`}
            </p>
          </div>
          <span className="rounded bg-[#C5A55A]/20 px-2.5 py-1 text-xs font-semibold text-[#E8D5A3]">
            {`${envios.length} ${envios.length === 1 ? "foto" : "fotos"}`}
          </span>
        </div>

        {envios.length === 0 ? (
          <p className="text-xs italic text-gray-500">
            Todavia no has enviado fotos en este ciclo.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {envios.map((envio) => (
              <div key={envio.id} className="space-y-1.5">
                <div className="relative aspect-[3/4] overflow-hidden rounded-lg border border-white/10 bg-black/40">
                  <Image
                    src={envio.url}
                    alt={`Foto enviada el ${fechaCorta(envio.createdAt)}`}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 50vw, 33vw"
                  />
                </div>

                <span
                  className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                    ESTADO_ENVIO[envio.estado].clase
                  }`}
                >
                  {ESTADO_ENVIO[envio.estado].etiqueta}
                </span>

                {/* El motivo del rechazo, pegado a la foto que lo motivo: en
                    una lista de varias, un aviso suelto arriba no dejaria claro
                    cual de todas hay que reemplazar. */}
                {envio.estado === "rechazada" && envio.motivoRechazo ? (
                  <p className="rounded-md border border-red-500/20 bg-red-500/[0.07] px-2 py-1.5 text-[10px] leading-relaxed text-red-200">
                    {envio.motivoRechazo}
                  </p>
                ) : null}

                <p className="text-[10px] text-gray-500">
                  {fechaCorta(envio.createdAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
