"use client";

import { useState } from "react";
import { User, Lock, Mail, CheckCircle2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { updateMyProfileAction } from "@/lib/actions/auth";

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: {
    nombre?: string | null;
    apellido?: string | null;
    email?: string | null;
  } | null;
  onProfileUpdated?: (updated: { nombre?: string | null; apellido?: string | null; email?: string | null }) => void;
}

export default function EditProfileModal({
  isOpen,
  onClose,
  currentUser,
  onProfileUpdated,
}: EditProfileModalProps) {
  const [nombre, setNombre] = useState(currentUser?.nombre || "");
  const [apellido, setApellido] = useState(currentUser?.apellido || "");
  const [email, setEmail] = useState(currentUser?.email || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password && password.length < 6) {
      toast.error("La nueva contraseña debe tener al menos 6 caracteres");
      return;
    }

    if (password && password !== confirmPassword) {
      toast.error("Las contraseñas no coinciden");
      return;
    }

    setSaving(true);
    try {
      const res = await updateMyProfileAction({
        nombre,
        apellido,
        email: email.trim() ? email.trim() : undefined,
        password: password.trim() ? password.trim() : undefined,
      });

      if (res.success) {
        toast.success("Perfil actualizado con éxito");
        onProfileUpdated?.({ nombre, apellido, email });
        setPassword("");
        setConfirmPassword("");
        onClose();
      } else {
        toast.error(res.error || "Error al actualizar perfil");
      }
    } catch (err: any) {
      toast.error(err.message || "Error al actualizar datos");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-[#0c0c0c] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#C5A55A]/30 bg-[#C5A55A]/10 text-[#C5A55A]">
              <User className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Mi Perfil (Admin)</h3>
              <p className="text-xs text-zinc-400">Actualiza tus datos y credenciales</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-zinc-300 font-semibold">Nombre</label>
              <div className="relative mt-1">
                <input
                  type="text"
                  placeholder="Ej: Carlos"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-white placeholder:text-zinc-600 focus:border-[#C5A55A] focus:outline-none transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="text-zinc-300 font-semibold">Apellido</label>
              <div className="relative mt-1">
                <input
                  type="text"
                  placeholder="Ej: Gomez"
                  value={apellido}
                  onChange={(e) => setApellido(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-white placeholder:text-zinc-600 focus:border-[#C5A55A] focus:outline-none transition-colors"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-zinc-300 font-semibold">Correo Electrónico</label>
            <div className="relative mt-1">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-500">
                <Mail className="h-4 w-4" />
              </div>
              <input
                type="email"
                placeholder="admin@colombiasexys.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 pl-9 pr-3.5 py-2.5 text-white placeholder:text-zinc-600 focus:border-[#C5A55A] focus:outline-none transition-colors"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-zinc-900 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Cambiar Contraseña (opcional)
            </p>

            <div>
              <label className="text-zinc-300">Nueva Contraseña</label>
              <div className="relative mt-1">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-500">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type="password"
                  placeholder="Dejar en blanco para mantener la actual"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 pl-9 pr-3.5 py-2.5 text-white placeholder:text-zinc-600 focus:border-[#C5A55A] focus:outline-none transition-colors"
                />
              </div>
            </div>

            {password && (
              <div>
                <label className="text-zinc-300">Confirmar Nueva Contraseña</label>
                <div className="relative mt-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-500">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    type="password"
                    placeholder="Repite la nueva contraseña"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 pl-9 pr-3.5 py-2.5 text-white placeholder:text-zinc-600 focus:border-[#C5A55A] focus:outline-none transition-colors"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-[#C5A55A] px-5 py-2.5 text-xs font-bold text-black hover:bg-[#d8b86d] disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {saving ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Guardando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" /> Guardar Cambios
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
