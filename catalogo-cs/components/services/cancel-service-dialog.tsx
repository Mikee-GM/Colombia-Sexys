"use client";

import { useState } from "react";
import { motion } from "framer-motion";

import SelectField from "@/components/ui/SelectField";
import TextareaField from "@/components/ui/TextareaField";
import {
  CANCELLATION_REASON_LABEL,
  SELECTABLE_CANCELLATION_REASONS,
  type CancellationReason,
} from "@/lib/cancellation-reasons";

interface CancelServiceDialogProps {
  /** Nombre de la modelo o referencia del servicio, solo para el encabezado. */
  serviceLabel: string;
  disabled?: boolean;
  onConfirm: (reason: CancellationReason, note: string) => void;
  onCancel: () => void;
}

/**
 * Dialogo unico de cancelacion para el ERP y el panel del jefe.
 *
 * El motivo es obligatorio porque es lo que decide despues quien asume el
 * costo: sin el, "el cliente se arrepintio" y "la modelo no llego" quedan
 * guardados igual y ninguna consecuencia se puede aplicar con justicia.
 */
export default function CancelServiceDialog({
  serviceLabel,
  disabled = false,
  onConfirm,
  onCancel,
}: CancelServiceDialogProps) {
  const [reason, setReason] = useState<CancellationReason | "">("");
  const [note, setNote] = useState("");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
    >
      <motion.section
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-service-title"
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md bg-black border border-zinc-800 shadow-2xl"
      >
        <div className="px-7 pt-7 pb-5 border-b border-zinc-800/60">
          <p className="text-[10px] font-bold tracking-[0.2em] text-red-500 uppercase mb-3">
            Accion irreversible
          </p>
          <h3
            id="cancel-service-title"
            className="font-heading text-xl font-semibold text-white tracking-tight leading-snug"
          >
            Cancelar el servicio de {serviceLabel}
          </h3>
          <p className="text-xs text-zinc-500 font-light mt-2 leading-relaxed">
            Se avisara al cliente, a la modelo y al chofer asignado. El motivo
            queda registrado con tu usuario y la hora.
          </p>
        </div>

        <div className="px-7 py-6 space-y-5">
          <SelectField
            label="Motivo de la cancelacion"
            value={reason}
            onChange={(e) => setReason(e.target.value as CancellationReason)}
            options={[
              { value: "", label: "Selecciona un motivo" },
              ...SELECTABLE_CANCELLATION_REASONS.map((value) => ({
                value,
                label: CANCELLATION_REASON_LABEL[value],
              })),
            ]}
          />

          <TextareaField
            label="Detalle, opcional"
            value={note}
            maxLength={500}
            rows={3}
            placeholder="Que paso exactamente"
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="flex border-t border-zinc-800">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-4 text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-500 hover:text-white border-r border-zinc-800 transition-colors duration-200"
          >
            Volver
          </button>
          <button
            type="button"
            disabled={disabled || !reason}
            onClick={() => reason && onConfirm(reason, note)}
            className="flex-1 py-4 text-[10px] font-bold tracking-[0.2em] uppercase text-red-500 hover:text-red-400 hover:bg-red-950/20 transition-colors duration-200 disabled:text-zinc-700 disabled:hover:bg-transparent"
          >
            Cancelar servicio
          </button>
        </div>
      </motion.section>
    </motion.div>
  );
}
