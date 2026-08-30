"use client";

import { useMemo, useState, useTransition } from "react";
import type { ConversationMessage, Service } from "@/lib/types";
import {
  getFullServiceConversationAction,
  getBookingSessionConversationAction,
  type UnlinkedSession,
} from "@/lib/actions/dev-chat-log";
import { APP_LOCALE, APP_TIME_ZONE } from "@/lib/locale";

function fechaHora(iso: string) {
  return new Date(iso).toLocaleString(APP_LOCALE, {
    timeZone: APP_TIME_ZONE,
    dateStyle: "short",
    timeStyle: "medium",
  });
}

function codigoServicio(id: string) {
  return `SR-${id.slice(-6).toUpperCase()}`;
}

const EMISOR_STYLE: Record<string, string> = {
  cliente: "border-blue-500/40 bg-blue-500/10 text-blue-300",
  ia: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  jefe: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  empleada: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300",
  sistema: "border-zinc-600 bg-zinc-800/60 text-zinc-400",
};

const EMISOR_LABEL: Record<string, string> = {
  cliente: "Cliente",
  ia: "IA",
  jefe: "Jefe",
  empleada: "Empleada",
  sistema: "Sistema",
};

type Modo = "servicios" | "sin-concretar";

type Seleccion =
  | { modo: "servicios"; servicio: Service }
  | { modo: "sin-concretar"; sesion: UnlinkedSession };

function buscableServicio(servicio: Service): string {
  return [
    servicio.id,
    servicio.cliente?.nombreTelegram,
    servicio.empleada?.nombreArtistico,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function buscableSesion(sesion: UnlinkedSession): string {
  return [sesion.bookingSessionId, sesion.clienteNombre, sesion.clienteTelegramId]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export default function ConversationLogViewer({
  initialServices,
  initialUnlinkedSessions,
}: {
  initialServices: Service[];
  initialUnlinkedSessions: UnlinkedSession[];
}) {
  const [modo, setModo] = useState<Modo>("servicios");
  const [query, setQuery] = useState("");
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const serviciosFiltrados = useMemo(() => {
    const term = query.trim().toLowerCase();
    const lista = term
      ? initialServices.filter((s) => buscableServicio(s).includes(term))
      : initialServices;
    return lista.slice(0, 60);
  }, [query, initialServices]);

  const sesionesFiltradas = useMemo(() => {
    const term = query.trim().toLowerCase();
    const lista = term
      ? initialUnlinkedSessions.filter((s) => buscableSesion(s).includes(term))
      : initialUnlinkedSessions;
    return lista.slice(0, 60);
  }, [query, initialUnlinkedSessions]);

  function cambiarModo(nuevo: Modo) {
    setModo(nuevo);
    setQuery("");
    setSeleccion(null);
    setMessages(null);
    setError(null);
  }

  function abrirServicio(servicio: Service) {
    setSeleccion({ modo: "servicios", servicio });
    setMessages(null);
    setError(null);
    startTransition(async () => {
      try {
        setMessages(await getFullServiceConversationAction(servicio.id));
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "No se pudo cargar la conversación.",
        );
      }
    });
  }

  function abrirSesion(sesion: UnlinkedSession) {
    setSeleccion({ modo: "sin-concretar", sesion });
    setMessages(null);
    setError(null);
    startTransition(async () => {
      try {
        setMessages(
          await getBookingSessionConversationAction(sesion.bookingSessionId),
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "No se pudo cargar la conversación.",
        );
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
      <div className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
        <div className="flex gap-1 rounded-md border border-zinc-800 bg-zinc-900 p-1 text-xs">
          <button
            onClick={() => cambiarModo("servicios")}
            className={`flex-1 rounded px-2 py-1.5 transition-colors ${
              modo === "servicios"
                ? "bg-zinc-700 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Concretados ({initialServices.length})
          </button>
          <button
            onClick={() => cambiarModo("sin-concretar")}
            className={`flex-1 rounded px-2 py-1.5 transition-colors ${
              modo === "sin-concretar"
                ? "bg-zinc-700 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Sin concretar ({initialUnlinkedSessions.length})
          </button>
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por cliente, modelo o id..."
          className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-zinc-600"
        />

        <div className="flex max-h-[70vh] flex-col gap-1 overflow-y-auto">
          {modo === "servicios" ? (
            serviciosFiltrados.length === 0 ? (
              <p className="p-3 text-xs text-zinc-500">Sin resultados.</p>
            ) : (
              serviciosFiltrados.map((s) => (
                <button
                  key={s.id}
                  onClick={() => abrirServicio(s)}
                  className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                    seleccion?.modo === "servicios" &&
                    seleccion.servicio.id === s.id
                      ? "border-zinc-500 bg-zinc-800"
                      : "border-transparent bg-zinc-900 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-zinc-400">
                      {codigoServicio(s.id)}
                    </span>
                    <span className="text-zinc-500">{s.estado}</span>
                  </div>
                  <div className="mt-1 truncate text-zinc-300">
                    {s.cliente?.nombreTelegram || "Cliente sin nombre"}
                    {s.empleada?.nombreArtistico
                      ? ` · ${s.empleada.nombreArtistico}`
                      : ""}
                  </div>
                  <div className="text-[11px] text-zinc-600">
                    {fechaHora(s.createdAt)}
                  </div>
                </button>
              ))
            )
          ) : sesionesFiltradas.length === 0 ? (
            <p className="p-3 text-xs text-zinc-500">
              No hay conversaciones sin concretar en este rango.
            </p>
          ) : (
            sesionesFiltradas.map((s) => (
              <button
                key={s.bookingSessionId}
                onClick={() => abrirSesion(s)}
                className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                  seleccion?.modo === "sin-concretar" &&
                  seleccion.sesion.bookingSessionId === s.bookingSessionId
                    ? "border-zinc-500 bg-zinc-800"
                    : "border-transparent bg-zinc-900 hover:border-zinc-700"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-zinc-300">
                    {s.clienteNombre || "Cliente sin nombre"}
                  </span>
                  <span className="text-zinc-500">
                    {s.messageCount} msj
                  </span>
                </div>
                <div className="mt-1 truncate text-zinc-500">
                  Telegram {s.clienteTelegramId}
                </div>
                <div className="text-[11px] text-zinc-600">
                  {fechaHora(s.startedAt)} → {fechaHora(s.lastAt)}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="min-h-[70vh] rounded-lg border border-zinc-800 bg-zinc-950 p-4">
        {!seleccion ? (
          <p className="text-sm text-zinc-500">
            Elige una conversación de la lista para verla completa.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="border-b border-zinc-800 pb-3">
              {seleccion.modo === "servicios" ? (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-200">
                    <span className="font-mono">
                      {codigoServicio(seleccion.servicio.id)}
                    </span>
                    <span className="text-zinc-600">·</span>
                    <span>
                      {seleccion.servicio.cliente?.nombreTelegram ||
                        "Cliente sin nombre"}
                    </span>
                    {seleccion.servicio.empleada?.nombreArtistico ? (
                      <>
                        <span className="text-zinc-600">·</span>
                        <span>{seleccion.servicio.empleada.nombreArtistico}</span>
                      </>
                    ) : null}
                    <span className="text-zinc-600">·</span>
                    <span className="text-zinc-500">
                      {seleccion.servicio.estado}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-zinc-600">
                    {seleccion.servicio.id}
                  </p>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-200">
                    <span>
                      {seleccion.sesion.clienteNombre || "Cliente sin nombre"}
                    </span>
                    <span className="text-zinc-600">·</span>
                    <span className="text-zinc-500">
                      Telegram {seleccion.sesion.clienteTelegramId}
                    </span>
                    <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] uppercase text-amber-300">
                      sin concretar
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-zinc-600">
                    {seleccion.sesion.bookingSessionId}
                  </p>
                </>
              )}
            </div>

            {isPending ? (
              <p className="text-sm text-zinc-500">Cargando conversación...</p>
            ) : error ? (
              <p className="text-sm text-red-400">{error}</p>
            ) : !messages || messages.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No hay mensajes registrados para esta conversación.
              </p>
            ) : (
              <div className="flex flex-col gap-2 overflow-y-auto pr-1">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-md border px-3 py-2 text-sm ${
                      EMISOR_STYLE[m.emisor] ??
                      "border-zinc-700 bg-zinc-900 text-zinc-300"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-wide opacity-70">
                      <span>{EMISOR_LABEL[m.emisor] ?? m.emisor}</span>
                      <span>{fechaHora(m.enviadoAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-zinc-100">
                      {m.mensaje}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
