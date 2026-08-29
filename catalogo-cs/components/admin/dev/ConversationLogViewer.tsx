"use client";

import { useMemo, useState, useTransition } from "react";
import type { ConversationMessage, Service } from "@/lib/types";
import { getFullServiceConversationAction } from "@/lib/actions/dev-chat-log";
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

function buscable(servicio: Service): string {
  return [
    servicio.id,
    servicio.cliente?.nombreTelegram,
    servicio.empleada?.nombreArtistico,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export default function ConversationLogViewer({
  initialServices,
}: {
  initialServices: Service[];
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Service | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtrados = useMemo(() => {
    const term = query.trim().toLowerCase();
    const lista = term
      ? initialServices.filter((s) => buscable(s).includes(term))
      : initialServices;
    return lista.slice(0, 60);
  }, [query, initialServices]);

  function abrir(servicio: Service) {
    setSelected(servicio);
    setMessages(null);
    setError(null);
    startTransition(async () => {
      try {
        const data = await getFullServiceConversationAction(servicio.id);
        setMessages(data);
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
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por cliente, modelo o id..."
          className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-zinc-600"
        />
        <div className="flex max-h-[70vh] flex-col gap-1 overflow-y-auto">
          {filtrados.length === 0 ? (
            <p className="p-3 text-xs text-zinc-500">Sin resultados.</p>
          ) : (
            filtrados.map((s) => (
              <button
                key={s.id}
                onClick={() => abrir(s)}
                className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                  selected?.id === s.id
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
          )}
        </div>
      </div>

      <div className="min-h-[70vh] rounded-lg border border-zinc-800 bg-zinc-950 p-4">
        {!selected ? (
          <p className="text-sm text-zinc-500">
            Elige un servicio de la lista para ver su conversación completa.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="border-b border-zinc-800 pb-3">
              <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-200">
                <span className="font-mono">{codigoServicio(selected.id)}</span>
                <span className="text-zinc-600">·</span>
                <span>{selected.cliente?.nombreTelegram || "Cliente sin nombre"}</span>
                {selected.empleada?.nombreArtistico ? (
                  <>
                    <span className="text-zinc-600">·</span>
                    <span>{selected.empleada.nombreArtistico}</span>
                  </>
                ) : null}
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-500">{selected.estado}</span>
              </div>
              <p className="mt-1 font-mono text-[11px] text-zinc-600">
                {selected.id}
              </p>
            </div>

            {isPending ? (
              <p className="text-sm text-zinc-500">Cargando conversación...</p>
            ) : error ? (
              <p className="text-sm text-red-400">{error}</p>
            ) : !messages || messages.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No hay mensajes registrados para este servicio.
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
