"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, X } from "lucide-react";

import { updateLiquidationSettings } from "@/app/admin/liquidations/actions";
import { formatCurrency } from "@/lib/calculations";
import type { LiquidationCommissionSettings } from "@/components/liquidations/types";

/**
 * Aclaracion de "Extras calculados" con su regla editable al lado.
 *
 * El porcentaje y el umbral estaban incrustados en el backend, asi que nadie
 * sabia mirando la pantalla por que un extra de 1200 aparecia como 1020. Se
 * explican aqui, y quien tenga permiso los corrige sin salir del corte.
 *
 * Solo administracion puede escribirlos; para el resto esto es texto. El
 * backend vuelve a comprobarlo, esto solo evita ofrecer un boton que fallaria.
 */
export default function ComisionExtrasTarjeta({
  settings,
  editable,
}: {
  settings: LiquidationCommissionSettings;
  editable: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [porcentaje, setPorcentaje] = useState(
    String(settings.cardExtraCommissionPercentage),
  );
  const [umbral, setUmbral] = useState(
    String(settings.cardExtraCommissionThreshold),
  );
  const [error, setError] = useState<string | null>(null);
  const [guardando, startTransition] = useTransition();

  const guardar = () => {
    const porcentajeNum = Number(porcentaje);
    const umbralNum = Number(umbral);

    if (!Number.isFinite(porcentajeNum) || porcentajeNum < 0 || porcentajeNum > 100) {
      setError("El porcentaje debe estar entre 0 y 100.");
      return;
    }
    if (!Number.isFinite(umbralNum) || umbralNum < 0) {
      setError("El umbral no puede ser negativo.");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        await updateLiquidationSettings({
          cardExtraCommissionPercentage: porcentajeNum,
          cardExtraCommissionThreshold: umbralNum,
        });
        setAbierto(false);
      } catch (fallo) {
        setError(
          fallo instanceof Error
            ? fallo.message
            : "No se pudo guardar la regla.",
        );
      }
    });
  };

  const cancelar = () => {
    setPorcentaje(String(settings.cardExtraCommissionPercentage));
    setUmbral(String(settings.cardExtraCommissionThreshold));
    setError(null);
    setAbierto(false);
  };

  if (abierto) {
    return (
      <div className="flex flex-col gap-2 border-t border-zinc-800/55 px-1 py-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
          <label className="flex items-center gap-1.5">
            <span>Comision</span>
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={porcentaje}
              onChange={(evento) => setPorcentaje(evento.target.value)}
              className="w-16 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-right text-[12px] text-white tabular-nums outline-none focus:border-[#C5A55A]"
            />
            <span>%</span>
          </label>

          <label className="flex items-center gap-1.5">
            <span>desde</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={umbral}
              onChange={(evento) => setUmbral(evento.target.value)}
              className="w-24 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-right text-[12px] text-white tabular-nums outline-none focus:border-[#C5A55A]"
            />
          </label>

          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="flex items-center gap-1 rounded-lg border border-[#C5A55A]/40 bg-[#C5A55A]/10 px-2.5 py-1 font-semibold text-[#E8D5A3] transition-colors hover:bg-[#C5A55A] hover:text-black disabled:opacity-50"
          >
            <Check className="h-3 w-3" />
            {guardando ? "Guardando" : "Guardar"}
          </button>

          <button
            type="button"
            onClick={cancelar}
            disabled={guardando}
            className="flex items-center gap-1 rounded-lg border border-zinc-800 px-2.5 py-1 text-zinc-400 transition-colors hover:text-white disabled:opacity-50"
          >
            <X className="h-3 w-3" />
            Cancelar
          </button>
        </div>

        {error ? <p className="text-[11px] text-red-400">{error}</p> : null}

        <p className="text-[11px] leading-relaxed text-zinc-500">
          Aplica solo a extras cobrados con tarjeta. Lo cobrado por
          transferencia o en efectivo va integro a la empleada.
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-3 border-t border-zinc-800/55 px-1 py-3">
      <p className="text-[11px] leading-relaxed text-zinc-500">
        {`La empresa retiene el ${settings.cardExtraCommissionPercentage} % de cada extra cobrado con tarjeta de ${formatCurrency(
          settings.cardExtraCommissionThreshold,
        )} o mas. Lo cobrado por transferencia o en efectivo va integro a la empleada.`}
      </p>

      {editable ? (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-zinc-800 px-2.5 py-1 text-[11px] font-semibold text-zinc-400 transition-colors hover:border-[#C5A55A]/40 hover:text-[#E8D5A3]"
        >
          <Pencil className="h-3 w-3" />
          Cambiar
        </button>
      ) : null}
    </div>
  );
}
