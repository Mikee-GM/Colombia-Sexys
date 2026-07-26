"use client";

import { motion } from "framer-motion";

interface ConfirmDialogProps {
  title: string;
  description: string;
  labelConfirm?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  description,
  labelConfirm = "Eliminar",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm bg-black border border-zinc-800 shadow-2xl"
      >
        <div className="px-8 pt-8 pb-6 border-b border-zinc-800/60">
          <p className="text-[10px] font-bold tracking-[0.2em] text-red-500 uppercase mb-3">Accion irreversible</p>
          <h3 className="font-heading text-xl font-semibold text-white tracking-tight leading-snug">{title}</h3>
          <p className="text-xs text-zinc-500 font-light mt-2 leading-relaxed">{description}</p>
        </div>
        <div className="flex">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-4 text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-500 hover:text-white border-r border-zinc-800 transition-colors duration-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 py-4 text-[10px] font-bold tracking-[0.2em] uppercase text-red-500 hover:text-red-400 hover:bg-red-950/20 transition-colors duration-200"
          >
            {labelConfirm}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
