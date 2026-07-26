"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  getJefesAction,
  createJefeAction,
  deleteJefeAction,
  updateJefeAction,
  generateTelegramOtpAction,
} from "@/lib/actions/jefes";
import ConfirmDialog from "../ui/ConfirmDialog";
import InputField from "../ui/InputField";
import SearchBar from "../ui/SearchBar";
import CreateButton from "../ui/CreateButton";
import ReliabilityRating from "../ui/ReliabilityRating";

interface Jefe {
  id: string;
  email: string;
  nombre?: string | null;
  apellido?: string | null;
  trustScore?: number | null;
}

const inputClass =
  "w-full bg-black/40 border border-zinc-800 text-white text-sm font-medium px-4 py-3 rounded-lg transition-all duration-300 focus:border-[#C5A55A]/60 focus:bg-black/60 focus:ring-4 focus:ring-[#C5A55A]/10 placeholder:text-zinc-600 focus:outline-none tracking-wide";

interface JefesDashboardProps {
  initialJefes: Jefe[];
}

export default function JefesDashboard({ initialJefes }: JefesDashboardProps) {
  const [jefes, setJefes] = useState<Jefe[]>(initialJefes);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [editingJefe, setEditingJefe] = useState<Jefe | null>(null);
  const [saving, setSaving] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<Jefe | null>(null);
  const [otpCodes, setOtpCodes] = useState<Record<string, string>>({});

  const fetchJefes = async () => {
    try {
      const data = await getJefesAction();
      setJefes(data);
    } catch (err: any) {
      toast.error(`Error: ${err.message || "Error al cargar jefes"}`);
    }
  };

  const handleSaveJefe = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingJefe) {
        const res = await updateJefeAction(editingJefe.id, nombre, apellido, email, password);
        if (!res.success) {
          throw new Error(res.error || "No se pudo actualizar el jefe");
        }
        toast.success("Jefe actualizado correctamente.");
      } else {
        const res = await createJefeAction(nombre, apellido, email, password);
        if (!res.success) {
          throw new Error(res.error || "No se pudo crear el jefe");
        }
        toast.success("Jefe creado correctamente.");
      }
      setShowModal(false);
      setNombre("");
      setApellido("");
      setEmail("");
      setPassword("");
      setEditingJefe(null);
      await fetchJefes();
    } catch (err: any) {
      toast.error(err.message || "Error al guardar el jefe");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteJefe = async (jefe: Jefe) => {
    setConfirmDelete(null);
    try {
      const res = await deleteJefeAction(jefe.id);
      if (!res.success) {
        throw new Error(res.error || "No se pudo eliminar el jefe");
      }
      toast.success("Jefe eliminado correctamente.");
      await fetchJefes();
    } catch (err: any) {
      toast.error(err.message || "Error al eliminar el jefe");
    }
  };

  const handleGenerateOtp = async (jefeId: string) => {
    try {
      const res = await generateTelegramOtpAction(jefeId);
      if (!res.success) {
        throw new Error(res.error || "No se pudo generar el OTP");
      }
      if (res.code) {
        setOtpCodes((prev) => ({ ...prev, [jefeId]: res.code || "" }));
        toast.success("OTP generado correctamente.");
      }
    } catch (err: any) {
      toast.error(err.message || "Error al generar OTP");
    }
  };

  const openCreateModal = () => {
    setEditingJefe(null);
    setNombre("");
    setApellido("");
    setEmail("");
    setPassword("");
    setShowModal(true);
  };

  const openEditModal = (jefe: Jefe) => {
    setEditingJefe(jefe);
    setNombre(jefe.nombre || "");
    setApellido(jefe.apellido || "");
    setEmail(jefe.email);
    setPassword("");
    setShowModal(true);
  };

  const filtered = jefes.filter((j) => {
    const fullName = `${j.nombre || ""} ${j.apellido || ""}`.toLowerCase();
    const emailMatch = j.email.toLowerCase().includes(searchQuery.toLowerCase());
    const nameMatch = fullName.includes(searchQuery.toLowerCase());
    return emailMatch || nameMatch;
  });

  return (
    <div className="w-full">
      {/* Dialogo de confirmacion */}
      <AnimatePresence>
        {confirmDelete && (
          <ConfirmDialog
            key="confirm-delete"
            title={`Eliminar a "${confirmDelete.email}"`}
            description="Esta accion es permanente. El jefe de area perdera acceso de inmediato al panel de gestion."
            labelConfirm="Si, eliminar"
            onConfirm={() => handleDeleteJefe(confirmDelete)}
            onCancel={() => setConfirmDelete(null)}
          />
        )}
      </AnimatePresence>

      {/* Modal de Crear/Editar Jefe */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-zinc-950 border border-zinc-800 p-8 rounded-2xl shadow-2xl relative"
            >
              <button
                onClick={() => setShowModal(false)}
                className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>

              <h3 className="font-heading text-2xl font-semibold text-white tracking-wide mb-6">
                {editingJefe ? "Editar Jefe" : "Crear Nuevo Jefe"}
              </h3>

              <form onSubmit={handleSaveJefe} className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <InputField
                    label="Nombre"
                    type="text"
                    required
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Juan"
                  />
                  <InputField
                    label="Apellido"
                    type="text"
                    required
                    value={apellido}
                    onChange={(e) => setApellido(e.target.value)}
                    placeholder="Perez"
                  />
                </div>

                <InputField
                  label="Correo Electronico"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jefe@colombiasexys.com"
                />

                <InputField
                  label={editingJefe ? "Contrasena (opcional)" : "Contrasena"}
                  type="password"
                  required={!editingJefe}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={editingJefe ? "Dejar en blanco para no cambiar" : "--------"}
                />

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full bg-[#C5A55A] text-black font-black text-xs tracking-[0.2em] uppercase py-4 rounded-lg mt-4 hover:bg-[#D4AF37] transition-all duration-300 disabled:opacity-50 flex justify-center items-center"
                >
                  {saving ? "Guardando..." : editingJefe ? "Guardar Cambios" : "Crear Jefe"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-10 gap-6">
        <div>
          <h2 className="font-heading text-3xl font-semibold text-white tracking-wide">
            Jefes de Area
          </h2>
          <p className="text-sm text-[#C5A55A]/80 font-light mt-1">
            Gestiona las cuentas de los jefes asignados a las modelos
          </p>
        </div>
        <CreateButton onClick={openCreateModal} label="Nuevo Jefe" />
      </div>

      <SearchBar
        placeholder="Buscar por nombre o correo..."
        value={searchQuery}
        onChange={setSearchQuery}
      />

      {loading ? (
        <div className="flex gap-2 py-24 justify-center">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 bg-[#C5A55A]/50 rounded-full"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2 }}
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-zinc-800 border-dashed py-24 text-center">
          <p className="text-sm text-zinc-500 font-light">
            No hay jefes registrados o no coinciden con la busqueda.
          </p>
        </div>
      ) : (
        <div className="border border-zinc-800/80 bg-zinc-950/40 rounded-xl overflow-x-auto">
          <table className="w-full min-w-[900px] text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/30">
                <th className="px-6 py-4 text-[10px] font-bold tracking-[0.2em] text-zinc-400 uppercase">
                  Nombre y Apellido
                </th>
                <th className="px-6 py-4 text-[10px] font-bold tracking-[0.2em] text-zinc-400 uppercase">
                  Correo Electronico
                </th>
                <th className="px-6 py-4 text-[10px] font-bold tracking-[0.2em] text-zinc-400 uppercase">
                  Confiabilidad
                </th>
                <th className="px-6 py-4 text-[10px] font-bold tracking-[0.2em] text-zinc-400 uppercase">
                  Telegram OTP
                </th>
                <th className="px-6 py-4 text-[10px] font-bold tracking-[0.2em] text-zinc-400 uppercase text-right">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((jefe) => (
                <tr key={jefe.id} className="border-b border-zinc-800/40 hover:bg-zinc-900/10 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-white">
                    {jefe.nombre || "-"} {jefe.apellido || ""}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-zinc-300">
                    {jefe.email}
                  </td>
                  <td className="px-6 py-4">
                    <ReliabilityRating score={jefe.trustScore} compact />
                  </td>
                  <td className="px-6 py-4 text-sm font-medium">
                    {otpCodes[jefe.id] ? (
                      <div className="flex items-center gap-2">
                        <span className="bg-[#C5A55A]/10 text-[#C5A55A] border border-[#C5A55A]/30 px-3 py-1 rounded text-xs font-mono font-bold">
                          {otpCodes[jefe.id]}
                        </span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`/vincular ${otpCodes[jefe.id]}`);
                            toast.success("Copiado al portapapeles");
                          }}
                          title="Copiar comando de vinculacion"
                          className="text-[#C5A55A] hover:text-[#E8D5A3] transition-colors p-1"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleGenerateOtp(jefe.id)}
                        className="text-[10px] font-bold tracking-widest text-[#C5A55A] hover:text-[#E8D5A3] transition-colors uppercase"
                      >
                        Generar OTP
                      </button>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right space-x-4">
                    <button
                      onClick={() => openEditModal(jefe)}
                      className="text-[10px] font-bold tracking-widest text-zinc-400 uppercase hover:text-white transition-colors"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => setConfirmDelete(jefe)}
                      className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase hover:text-red-400 transition-colors"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
