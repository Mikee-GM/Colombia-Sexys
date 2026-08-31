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
  token,
}: {
  servicioId: string;
  token?: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();

  function extender(horas: number) {
    startTransition(async () => {
      const resultado = await extenderMiServicio(servicioId, horas, token);
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
      <div className="grid grid-cols-4 gap-2">
        {[1, 2, 3, 4].map((horas) => (
          <button
            key={horas}
            type="button"
            disabled={pendiente}
            onClick={() => extender(horas)}
            className="rounded-lg border border-[#C5A55A]/50 py-3 text-sm font-bold text-[#E8D5A3] transition-colors hover:bg-[#C5A55A] hover:text-black disabled:opacity-50"
          >
            {horas}
          </button>
        ))}
      </div>
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
