"use client";

import { Bot, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

type Summary = {
  employees: {
    total: number;
    available: number;
  };
  drivers: {
    total: number;
    available: number;
  };
};

export default function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    if (!open || summary) return;

    fetch("/api/assistant/summary")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setSummary(data))
      .catch(() => setSummary(null));
  }, [open, summary]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mx-4 mb-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-left transition-all hover:border-[#D4AF37]"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#D4AF37]">
            <Bot className="text-black" size={20} />
          </div>

          <div>
            <h4 className="font-semibold text-white">AI Assistant</h4>
            <p className="text-xs text-green-400">Online</p>
          </div>
        </div>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="absolute right-0 top-0 h-screen w-full max-w-[420px] border-l border-zinc-800 bg-[#111111]"
          >
            <div className="border-b border-zinc-800 p-6">
              <div className="flex items-center gap-3">
                <Sparkles size={20} className="text-[#D4AF37]" />
                <h2 className="text-xl font-bold">AI Assistant</h2>
              </div>
            </div>

            <div className="space-y-4 p-6">
              <div className="rounded-2xl bg-zinc-900 p-4 text-sm leading-6 text-zinc-200">
                Hola. Ya puedo leer datos reales del backend para empleados y
                choferes.
              </div>

              <div className="grid gap-3">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                  <p className="text-sm text-zinc-500">Empleadas disponibles</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {summary
                      ? `${summary.employees.available} / ${summary.employees.total}`
                      : "Cargando..."}
                  </p>
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                  <p className="text-sm text-zinc-500">Choferes disponibles</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {summary
                      ? `${summary.drivers.available} / ${summary.drivers.total}`
                      : "Cargando..."}
                  </p>
                </div>
              </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 border-t border-zinc-800 p-4">
              <input
                placeholder="Pregúntale algo..."
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
