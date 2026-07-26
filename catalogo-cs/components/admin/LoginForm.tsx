"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

import { checkSessionAction, loginAction } from "@/lib/actions/auth";
import { refreshSession } from "@/lib/client-session";

const inputClass =
  "w-full bg-black/40 border border-zinc-800 text-white text-sm font-medium px-4 py-3.5 rounded-lg transition-all duration-300 focus:border-[#C5A55A]/60 focus:bg-black/60 focus:ring-4 focus:ring-[#C5A55A]/10 placeholder:text-zinc-600 focus:outline-none tracking-wide";

interface LoginFormProps {
  onSuccess: (redirectTo: string) => void;
}

export default function LoginForm({ onSuccess }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const onSuccessRef = useRef(onSuccess);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      const result = await refreshSession();
      if (result !== "refreshed" || !active) return;

      const user = await checkSessionAction();
      if (!user || !active) return;
      onSuccessRef.current(
        user.rol === "jefe" ? "/jefe" : "/admin/dashboard",
      );
    }

    void restoreSession();
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await loginAction(email, password);

      if (!res.success) {
        throw new Error(res.error || "Credenciales incorrectas");
      }

      toast.success("Bienvenido al panel");
      onSuccess(res.redirectTo || "/admin/dashboard");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "No se pudo iniciar sesión",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center px-4 relative overflow-hidden">
      {/* Fondo decorativo */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-[radial-gradient(circle_at_center,rgba(197,165,90,0.04)_0%,transparent_60%)] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md relative z-10"
      >
        <div className="bg-zinc-950/80 backdrop-blur-sm border border-zinc-800/60 p-10 rounded-2xl shadow-2xl">
          {/* Cabecera con Logo */}
          <div className="flex flex-col items-center mb-10">
            <div className="w-20 h-20 mb-6 relative">
              <Image
                src="/logo-icono.webp"
                alt="Colombia Sexys"
                fill
                className="object-contain drop-shadow-[0_0_15px_rgba(197,165,90,0.2)]"
                priority
              />
            </div>
            <p className="text-[10px] font-black tracking-[0.4em] text-[#C5A55A]/60 uppercase mb-3">
              Acceso Restringido
            </p>
            <h1 className="font-heading text-2xl font-semibold text-white tracking-wide text-center">
              Panel de Administracion
            </h1>
          </div>

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="input-email"
                className="block text-[10px] font-bold tracking-[0.2em] text-zinc-400 uppercase mb-2 ml-1"
              >
                Correo Electronico
              </label>
              <input
                id="input-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@colombiasexys.com"
                className={inputClass}
              />
            </div>

            <div>
              <label
                htmlFor="input-password"
                className="block text-[10px] font-bold tracking-[0.2em] text-zinc-400 uppercase mb-2 ml-1"
              >
                Contrasena
              </label>
              <input
                id="input-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="--------"
                className={inputClass}
              />
            </div>

            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-xs text-red-400 font-medium bg-red-950/30 border border-red-900/40 px-4 py-3 rounded-lg text-center overflow-hidden"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <button
              id="btn-iniciar-sesion"
              type="submit"
              disabled={loading}
              className="w-full bg-[#C5A55A] text-black font-black text-xs tracking-[0.2em] uppercase py-4 rounded-lg mt-4 hover:bg-[#D4AF37] transition-all duration-300 disabled:opacity-50 hover:shadow-[0_0_20px_rgba(197,165,90,0.25)] flex justify-center items-center gap-2"
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-black"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>Verificando...</span>
                </>
              ) : (
                "Iniciar Sesion"
              )}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
