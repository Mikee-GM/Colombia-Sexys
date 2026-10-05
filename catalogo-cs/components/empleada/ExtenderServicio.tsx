"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock3, Plus } from "lucide-react";
import { toast } from "sonner";

import { extenderMiServicio } from "@/lib/actions/employee-portal";

/**
 * Añade horas al servicio en curso.
 *
 * En el chat esto son varios pasos, porque alli no cabe un formulario y el
 * menu se parte. Aqui elige las horas y se manda de una vez, que es la ventaja
 * de tener pantalla.
 *
 * Se abre en dos tiempos --primero el boton, luego las horas-- a proposito:
 * cambia lo que se le cobra al cliente, y no conviene que se dispare de un
 * toque accidental mientras trabaja.
 */
export default function ExtenderServicio({
  servicioId,
  tarifaHora,
  token,
}: {
  servicioId: string;
  tarifaHora: number;
  token?: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [horas, setHoras] = useState(1);
  const [horasManual, setHorasManual] = useState("");
  const [monto, setMonto] = useState(String(Math.max(0, tarifaHora)));
  const [pendiente, startTransition] = useTransition();

  function seleccionarHoras(value: number) {
    setHoras(value);
    setHorasManual(value > 5 ? String(value) : "");
    setMonto(String(Math.max(0, tarifaHora * value)));
  }

  function extender() {
    const montoAcordado = Number(monto);
    if (!Number.isInteger(horas) || horas < 1 || horas > 12) {
      toast.error("Elige entre 1 y 12 horas.");
      return;
    }
    if (!Number.isFinite(montoAcordado) || montoAcordado <= 0) {
      toast.error("Escribe el monto acordado.");
      return;
    }
    startTransition(async () => {
      const resultado = await extenderMiServicio(
        servicioId,
        horas,
        montoAcordado,
        token,
      );
      if (!resultado.success) {
        toast.error(resultado.error);
        return;
      }
      toast.success(
        horas === 1 ? "Se agregó una hora." : `Se agregaron ${horas} horas.`,
      );
      setAbierto(false);
      router.refresh();
    });
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] py-3 text-xs font-semibold uppercase tracking-wider text-gray-300 transition-colors hover:border-[#C5A55A] hover:text-[#C5A55A]"
      >
        <Plus size={16} />
        Extender el servicio
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-[#C5A55A]/30 bg-[#C5A55A]/[0.05] p-3.5">
      <p className="mb-3 flex items-center justify-center gap-2 text-[11px] text-gray-400">
        <Clock3 size={14} />
        ¿Cuántas horas se agregan?
      </p>
      <div className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((opcion) => (
          <button
            key={opcion}
            type="button"
            disabled={pendiente}
            aria-busy={pendiente}
            onClick={() => seleccionarHoras(opcion)}
            className={`rounded-lg border py-3 text-sm font-bold transition-colors disabled:opacity-50 ${
              horas === opcion && !horasManual
                ? "border-[#C5A55A] bg-[#C5A55A] text-black"
                : "border-[#C5A55A]/50 text-[#E8D5A3] hover:bg-[#C5A55A] hover:text-black"
            }`}
          >
            {opcion}
          </button>
        ))}
      </div>
      <label className="mt-3 block text-[11px] text-gray-400">
        Más de 5 horas (máximo 12)
        <input
          type="number"
          min={6}
          max={12}
          step={1}
          value={horasManual}
          onChange={(event) => {
            const value = event.target.value;
            setHorasManual(value);
            const parsed = Number(value);
            if (Number.isInteger(parsed)) {
              setHoras(parsed);
              setMonto(String(Math.max(0, tarifaHora * parsed)));
            }
          }}
          className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-base text-white outline-none focus:border-[#C5A55A]"
          placeholder="6"
        />
      </label>
      <label className="mt-3 block text-[11px] text-gray-400">
        Monto acordado
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={monto}
          onChange={(event) => setMonto(event.target.value)}
          className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-base text-white outline-none focus:border-[#C5A55A]"
        />
        <span className="mt-1 block text-[10px] text-gray-500">
          Sugerido: tarifa por hora × horas. Puedes editarlo si el acuerdo fue
          distinto.
        </span>
      </label>
      <button
        type="button"
        disabled={pendiente}
        onClick={extender}
        className="mt-3 w-full rounded-lg bg-[#C5A55A] py-3 text-sm font-bold text-black disabled:opacity-50"
      >
        {pendiente ? "Registrando…" : `Confirmar ${horas} h`}
      </button>
      <button
        type="button"
        disabled={pendiente}
        onClick={() => setAbierto(false)}
        className="mt-2.5 w-full py-2 text-[11px] text-gray-500 hover:text-gray-300"
      >
        Cancelar
      </button>
    </div>
  );
}
