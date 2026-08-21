"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

export interface PromptDialogProps {
  isOpen: boolean;
  title: string;
  description?: string;
  placeholder?: string;
  labelConfirm?: string;
  labelCancel?: string;
  variant?: "gold" | "emerald" | "red" | "blue";
  minLength?: number;
  maxLength?: number;
  inputType?: "text" | "textarea" | "number";
  defaultValue?: string;
  isLoading?: boolean;
  onConfirm: (value: string) => void | Promise<void>;
  onCancel: () => void;
}

export default function PromptDialog({
  isOpen,
  title,
  description,
  placeholder = "Escribe aquí...",
  labelConfirm = "Confirmar",
  labelCancel = "Cancelar",
  variant = "gold",
  minLength = 3,
  maxLength,
  inputType = "textarea",
  defaultValue = "",
  isLoading = false,
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
    }
  }, [isOpen, defaultValue]);

  if (!isOpen) return null;

  const trimmedLen = value.trim().length;
  const isSatisfied = trimmedLen >= minLength && (!maxLength || trimmedLen <= maxLength);

  const variantStyles = {
    gold: {
      badge: "text-[#C5A55A]",
      borderFocus: "focus:border-[#C5A55A]",
      btn: "bg-[#C5A55A] hover:bg-[#b09048] text-black",
      icon: "text-[#C5A55A]",
    },
    emerald: {
      badge: "text-emerald-400",
      borderFocus: "focus:border-emerald-500",
      btn: "bg-emerald-600 hover:bg-emerald-500 text-white",
      icon: "text-emerald-400",
    },
    red: {
      badge: "text-red-400",
      borderFocus: "focus:border-red-500",
      btn: "bg-red-600 hover:bg-red-500 text-white",
      icon: "text-red-400",
    },
    blue: {
      badge: "text-sky-400",
      borderFocus: "focus:border-sky-500",
      btn: "bg-sky-600 hover:bg-sky-500 text-white",
      icon: "text-sky-400",
    },
  }[variant];

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isSatisfied || isLoading) return;
    onConfirm(value.trim());
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget && !isLoading) onCancel();
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 8 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-md bg-[#0c0c0c] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
        >
          <div className="p-6">
            <h3 className="font-heading text-lg font-bold text-white flex items-center gap-2">
              {title}
            </h3>
            {description && (
              <p className="mt-1.5 text-xs sm:text-sm text-zinc-400 leading-relaxed">
                {description}
              </p>
            )}

            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <div>
                {inputType === "textarea" ? (
                  <textarea
                    autoFocus
                    rows={3}
                    value={value}
                    maxLength={maxLength}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={placeholder}
                    className={`w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-white placeholder:text-zinc-600 outline-none transition-colors ${variantStyles.borderFocus}`}
                  />
                ) : (
                  <input
                    autoFocus
                    type={inputType}
                    value={value}
                    maxLength={maxLength}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={placeholder}
                    className={`w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-white placeholder:text-zinc-600 outline-none transition-colors ${variantStyles.borderFocus}`}
                  />
                )}

                <div className="mt-1.5 flex items-center justify-between px-0.5 text-[11px]">
                  {minLength > 0 && (
                    <span
                      className={`flex items-center gap-1 font-medium transition-colors ${
                        isSatisfied ? "text-emerald-400" : "text-amber-400"
                      }`}
                    >
                      {isSatisfied ? (
                        <>
                          <CheckCircle2 className="h-3 w-3" /> Mínimo alcanzado
                        </>
                      ) : (
                        <>
                          <AlertCircle className="h-3 w-3" /> Mínimo {minLength} caracteres ({minLength - trimmedLen} restantes)
                        </>
                      )}
                    </span>
                  )}
                  <span className="text-zinc-500 font-mono ml-auto">
                    {trimmedLen}
                    {maxLength ? ` / ${maxLength}` : ""} caracteres
                  </span>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2.5 pt-2 border-t border-zinc-800/60">
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={onCancel}
                  className="rounded-xl px-4 py-2.5 text-xs font-bold text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
                >
                  {labelCancel}
                </button>
                <button
                  type="submit"
                  disabled={!isSatisfied || isLoading}
                  className={`rounded-xl px-5 py-2.5 text-xs font-bold shadow-md transition-all flex items-center gap-1.5 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500 disabled:shadow-none ${variantStyles.btn}`}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Procesando...
                    </>
                  ) : (
                    labelConfirm
                  )}
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
