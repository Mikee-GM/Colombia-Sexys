"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";

/**
 * Levanta un reporte de conducta sobre alguien de un servicio.
 *
 * Es el mecanismo con el que se acaba bloqueando a un cliente problematico:
 * varios reportes confirmados sobre la misma persona son lo que sostiene la
 * decision. Hasta ahora solo se podia desde el chat, asi que un incidente se
 * perdia justo cuando mas importaba dejarlo registrado.
 *
 * Se abre en dos tiempos y pide una descripcion de verdad. No es un boton de
 * queja rapida: lo que se escribe aqui lo lee un jefe y puede terminar en una
 * sancion para otra persona.
 */

/** Las categorias que reconoce el backend, con el nombre que entiende la gente. */
const CATEGORIAS = [
  { valor: "trato_inadecuado", texto: "Trato inadecuado" },
  { valor: "demora_impuntualidad", texto: "Demora o impuntualidad" },
  { valor: "incumplimiento", texto: "Incumplimiento de lo acordado" },
  { valor: "cobro", texto: "Problema con el cobro" },
  { valor: "seguridad", texto: "Seguridad" },
  { valor: "otro", texto: "Otro" },
] as const;

/** El minimo del backend. Se avisa antes de mandar, no despues. */
const MINIMO_DESCRIPCION = 15;

export default function ReportarConducta({
  servicioId,
  direction,
  sujeto,
  reportar,
  token,
}: {
  servicioId: string;
  /** Quien reporta a quien, en el vocabulario del backend. */
  direction: string;
  /** Como se llama en pantalla la persona reportada: "el cliente", "el chofer". */
  sujeto: string;
  reportar: (
    input: {
      direction: string;
      interactionId: string;
      category: string;
      description: string;
    },
    token?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  token?: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [categoria, setCategoria] = useState<string>(CATEGORIAS[0].valor);
  const [descripcion, setDescripcion] = useState("");
  const [pendiente, startTransition] = useTransition();

  function cerrar() {
    setAbierto(false);
    setDescripcion("");
    setCategoria(CATEGORIAS[0].valor);
  }

  function enviar() {
    const texto = descripcion.trim();
    if (texto.length < MINIMO_DESCRIPCION) {
      toast.error("Cuenta qué pasó: quien lo revise solo tiene esto.");
      return;
    }
    startTransition(async () => {
      const resultado = await reportar(
        {
          direction,
          interactionId: servicioId,
          category: categoria,
          description: texto,
        },
        token,
      );
      if (!resultado.success) {
        toast.error(resultado.error);
        return;
      }
      toast.success("Reporte enviado. Lo va a revisar un jefe.");
      cerrar();
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
        <ShieldAlert size={16} />
        Reportar {sujeto}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-[#C5A55A]/30 bg-[#C5A55A]/[0.05] p-3.5">
      <p className="mb-3 text-[11px] leading-relaxed text-gray-400">
        Lo que escribas lo lee un jefe y puede terminar en una sanción. Sé
        concreto con lo que pasó.
      </p>

      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
        Qué ocurrió
      </label>
      <select
        value={categoria}
        onChange={(evento) => setCategoria(evento.target.value)}
        className="mb-3 w-full rounded-lg border border-zinc-800 bg-black/60 px-3 py-2.5 text-xs text-zinc-200 outline-none focus:border-[#C5A55A]"
      >
        {CATEGORIAS.map((opcion) => (
          <option key={opcion.valor} value={opcion.valor}>
            {opcion.texto}
          </option>
        ))}
      </select>

      <textarea
        value={descripcion}
        onChange={(evento) => setDescripcion(evento.target.value)}
        rows={4}
        maxLength={2000}
        placeholder="Cuenta qué pasó, con el detalle que recuerdes"
        className="mb-3 w-full resize-none rounded-lg border border-zinc-800 bg-black/60 px-3 py-2 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-[#C5A55A]"
      />

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={pendiente}
          onClick={cerrar}
          className="rounded-lg border border-white/10 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-400 transition-colors hover:text-gray-200 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={pendiente}
          onClick={enviar}
          className="rounded-lg border border-[#C5A55A]/50 py-2.5 text-xs font-bold uppercase tracking-wider text-[#E8D5A3] transition-colors hover:bg-[#C5A55A] hover:text-black disabled:opacity-50"
        >
          {pendiente ? "Enviando" : "Enviar reporte"}
        </button>
      </div>
    </div>
  );
}
