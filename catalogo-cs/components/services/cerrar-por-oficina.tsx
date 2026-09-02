"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { toast } from "sonner";


/**
 * Cierra un servicio en nombre de la modelo.
 *
 * Cerrar es cosa suya, y mientras fue lo unico posible un telefono muerto
 * dejaba el servicio en curso indefinidamente: ella bloqueada como no
 * disponible, sin transporte de regreso, sin entrar en la liquidacion y sin
 * calificaciones. La salida era editar el servicio a mano, que lo dejaba
 * marcado como cerrado sin hacer nada de eso: el peor arreglo posible, porque
 * parece que funciono.
 *
 * Va en dos tiempos y pide el motivo escrito porque al cerrar se calculan las
 * horas facturadas y lo que le toca a ella. Dentro de una semana hay que poder
 * distinguir esto de un cierre normal, y el motivo es lo unico que lo hace.
 *
 * La accion la pone quien monta el componente: el panel del jefe comprueba
 * ademas que el servicio sea de su equipo, y el de admin no. Asi el mismo
 * formulario sirve en los dos sin saber en cual esta.
 */

/** El minimo que exige el backend. Se avisa antes de mandar, no despues. */
const MINIMO_MOTIVO = 10;

export default function CerrarPorOficina({
  servicioId,
  cerrar: cerrarServicio,
}: {
  servicioId: string;
  cerrar: (
    servicioId: string,
    motivo: string,
  ) => Promise<{ success: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [pendiente, startTransition] = useTransition();

  function cerrar() {
    const texto = motivo.trim();
    if (texto.length < MINIMO_MOTIVO) {
      toast.error("Escribe por qué lo cierras tú y no ella.");
      return;
    }
    startTransition(async () => {
      const resultado = await cerrarServicio(servicioId, texto);
      if (!resultado.success) {
        toast.error(resultado.error);
        return;
      }
      toast.success("Servicio cerrado. Queda anotado que lo cerró la oficina.");
      setAbierto(false);
      setMotivo("");
      router.refresh();
    });
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] py-3 text-xs font-semibold uppercase tracking-wider text-gray-400 transition-colors hover:border-[#C5A55A] hover:text-[#C5A55A]"
      >
        <LockKeyhole size={16} />
        Cerrar en nombre de la modelo
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-[#C5A55A]/30 bg-[#C5A55A]/[0.05] p-3.5">
      <p className="mb-3 text-[11px] leading-relaxed text-gray-400">
        Se cierra igual que si lo cerrara ella: se libera, se pide el regreso y
        entra en la liquidación. Queda anotado que lo cerraste tú.
      </p>

      <textarea
        value={motivo}
        onChange={(evento) => setMotivo(evento.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Por qué no pudo cerrarlo ella"
        className="mb-3 w-full resize-none rounded-lg border border-zinc-800 bg-black/60 px-3 py-2 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-[#C5A55A]"
      />

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={pendiente}
          onClick={() => {
            setAbierto(false);
            setMotivo("");
          }}
          className="rounded-lg border border-white/10 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-400 transition-colors hover:text-gray-200 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={pendiente}
          onClick={cerrar}
          className="rounded-lg border border-[#C5A55A]/50 py-2.5 text-xs font-bold uppercase tracking-wider text-[#E8D5A3] transition-colors hover:bg-[#C5A55A] hover:text-black disabled:opacity-50"
        >
          {pendiente ? "Cerrando" : "Cerrar servicio"}
        </button>
      </div>
    </div>
  );
}
