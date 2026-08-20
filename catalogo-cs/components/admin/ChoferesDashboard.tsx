"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  getChoferesAction,
  createChoferAction,
  deleteChoferAction,
  updateChoferAction,
} from "@/lib/actions/choferes";
import { generateTelegramOtpAction } from "@/lib/actions/jefes";
import ConfirmDialog from "../ui/ConfirmDialog";
import InputField from "../ui/InputField";
import SearchBar from "../ui/SearchBar";
import CreateButton from "../ui/CreateButton";
import ReliabilityRating from "../ui/ReliabilityRating";
import EvaluationHistorySheet from "./evaluations/evaluation-history-sheet";

interface Chofer {
  id: string;
  nombre: string;
  telefono: string;
  email: string;
  usuarioId: string;
  sancionada?: boolean;
  vehiculoMarca?: string;
  vehiculoModelo?: string;
  vehiculoColor?: string;
  vehiculoPlaca?: string;
  trustScore?: number | null;
}

const formatPhoneNumber = (value: string): string => {
  let cleaned = value.replace(/[^\d+]/g, "");
  if (cleaned && !cleaned.startsWith("+")) {
    cleaned = "+" + cleaned;
  }
  if (cleaned.startsWith("+52")) {
    const rest = cleaned.substring(3).replace(/\D/g, "");
    if (rest.length === 0) return "+52";
    if (rest.length <= 2) {
      return `+52 ${rest}`;
    }
    if (rest.length <= 6) {
      return `+52 ${rest.substring(0, 2)} ${rest.substring(2)}`;
    }
    return `+52 ${rest.substring(0, 2)} ${rest.substring(2, 6)} ${rest.substring(6, 10)}`;
  }
  return cleaned;
};

interface ChoferesDashboardProps {
  initialChoferes: Chofer[];
}

export default function ChoferesDashboard({ initialChoferes }: ChoferesDashboardProps) {
  const [choferes, setChoferes] = useState<Chofer[]>(initialChoferes);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("+52");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [vehiculoMarca, setVehiculoMarca] = useState("");
  const [vehiculoModelo, setVehiculoModelo] = useState("");
  const [vehiculoColor, setVehiculoColor] = useState("");
  const [vehiculoPlaca, setVehiculoPlaca] = useState("");
  const [editingChofer, setEditingChofer] = useState<Chofer | null>(null);
  const [saving, setSaving] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<Chofer | null>(null);
  const [otpCodes, setOtpCodes] = useState<Record<string, string>>({});
  const [selectedEvaluationUser, setSelectedEvaluationUser] = useState<{ id: string; name: string } | null>(null);

  const handleSaveChofer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const telefonoLimpio = telefono.replace(/\s+/g, "");
    try {
      if (editingChofer) {
        const res = await updateChoferAction(
          editingChofer.id,
          nombre,
          telefonoLimpio,
          email,
          password,
          vehiculoMarca,
          vehiculoModelo,
          vehiculoColor,
          vehiculoPlaca
        );
        if (!res.success) {
          throw new Error(res.error || "No se pudo actualizar el chofer");
        }
        toast.success("Chofer actualizado correctamente.");
        setChoferes((prev) =>
          prev.map((c) =>
            c.id === editingChofer.id
              ? {
                  ...c,
                  nombre,
                  telefono: telefonoLimpio,
                  email,
                  vehiculoMarca: vehiculoMarca || "",
                  vehiculoModelo: vehiculoModelo || "",
                  vehiculoColor: vehiculoColor || "",
                  vehiculoPlaca: vehiculoPlaca || "",
                }
              : c
          )
        );
      } else {
        const res = await createChoferAction(
          nombre,
          telefonoLimpio,
          email,
          password,
          vehiculoMarca,
          vehiculoModelo,
          vehiculoColor,
          vehiculoPlaca
        );
        if (!res.success) {
          throw new Error(res.error || "No se pudo crear el chofer");
        }
        toast.success("Chofer creado correctamente.");
        if (res.data) {
          setChoferes((prev) => [...prev, res.data]);
        }
      }
      setShowModal(false);
      setNombre("");
      setTelefono("+52");
      setEmail("");
      setPassword("");
      setVehiculoMarca("");
      setVehiculoModelo("");
      setVehiculoColor("");
      setVehiculoPlaca("");
      setEditingChofer(null);
    } catch (err: any) {
      toast.error(err.message || "Error al guardar el chofer");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteChofer = async (chofer: Chofer) => {
    setConfirmDelete(null);
    try {
      const res = await deleteChoferAction(chofer.id);
      if (!res.success) {
        throw new Error(res.error || "No se pudo eliminar el chofer");
      }
      toast.success("Chofer eliminado correctamente.");
      setChoferes((prev) => prev.filter((c) => c.id !== chofer.id));
    } catch (err: any) {
      toast.error(err.message || "Error al eliminar el chofer");
    }
  };

  const handleGenerateOtp = async (usuarioId: string) => {
    try {
      const res = await generateTelegramOtpAction(usuarioId);
      if (!res.success) {
        throw new Error(res.error || "No se pudo generar el OTP");
      }
      if (res.code) {
        setOtpCodes((prev) => ({ ...prev, [usuarioId]: res.code || "" }));
        toast.success("OTP generado correctamente.");
      }
    } catch (err: any) {
      toast.error(err.message || "Error al generar OTP");
    }
  };

  const openCreateModal = () => {
    setEditingChofer(null);
    setNombre("");
    setTelefono("+52");
    setEmail("");
    setPassword("");
    setVehiculoMarca("");
    setVehiculoModelo("");
    setVehiculoColor("");
    setVehiculoPlaca("");
    setShowModal(true);
  };

  const openEditModal = (chofer: Chofer) => {
    setEditingChofer(chofer);
    setNombre(chofer.nombre);
    setTelefono(formatPhoneNumber(chofer.telefono));
    setEmail(chofer.email);
    setPassword("");
    setVehiculoMarca(chofer.vehiculoMarca || "");
    setVehiculoModelo(chofer.vehiculoModelo || "");
    setVehiculoColor(chofer.vehiculoColor || "");
    setVehiculoPlaca(chofer.vehiculoPlaca || "");
    setShowModal(true);
  };

  const filtered = choferes.filter((c) => {
    const emailMatch = c.email.toLowerCase().includes(searchQuery.toLowerCase());
    const nameMatch = c.nombre.toLowerCase().includes(searchQuery.toLowerCase());
    return emailMatch || nameMatch;
  });

  return (
    <div className="w-full">
      {/* Dialogo de confirmacion */}
      <AnimatePresence>
        {confirmDelete && (
          <ConfirmDialog
            key="confirm-delete"
            title={`Eliminar a "${confirmDelete.nombre}"`}
            description="Esta accion es permanente. El chofer perdera acceso de inmediato a la aplicacion."
            labelConfirm="Si, eliminar"
            onConfirm={() => handleDeleteChofer(confirmDelete)}
            onCancel={() => setConfirmDelete(null)}
          />
        )}
      </AnimatePresence>

      {/* Modal de Crear/Editar Chofer */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-zinc-950 border border-zinc-800 p-8 rounded-2xl shadow-2xl relative max-h-[90vh] overflow-y-auto"
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
                {editingChofer ? "Editar Chofer" : "Crear Nuevo Chofer"}
              </h3>

              <form onSubmit={handleSaveChofer} className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <InputField
                    label="Nombre"
                    type="text"
                    required
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Carlos"
                  />
                  <InputField
                    label="Telefono"
                    type="text"
                    required
                    value={telefono}
                    onChange={(e) => setTelefono(formatPhoneNumber(e.target.value))}
                    placeholder="+52 55 1234 5678"
                  />
                </div>

                <InputField
                  label="Correo Electronico"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="chofer@colombiasexys.com"
                />

                <InputField
                  label={editingChofer ? "Contrasena (opcional)" : "Contrasena"}
                  type="password"
                  required={!editingChofer}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={editingChofer ? "Dejar en blanco para no cambiar" : "--------"}
                />

                <div className="border-t border-zinc-850 pt-5 space-y-4">
                  <h4 className="text-[10px] font-bold tracking-widest text-[#C5A55A] uppercase">
                    Datos del Vehiculo
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <InputField
                      label="Marca"
                      type="text"
                      value={vehiculoMarca}
                      onChange={(e) => setVehiculoMarca(e.target.value)}
                      placeholder="Nissan"
                    />
                    <InputField
                      label="Modelo"
                      type="text"
                      value={vehiculoModelo}
                      onChange={(e) => setVehiculoModelo(e.target.value)}
                      placeholder="Versa"
                    />
                    <InputField
                      label="Color"
                      type="text"
                      value={vehiculoColor}
                      onChange={(e) => setVehiculoColor(e.target.value)}
                      placeholder="Blanco"
                    />
                    <InputField
                      label="Placa"
                      type="text"
                      value={vehiculoPlaca}
                      onChange={(e) => setVehiculoPlaca(e.target.value)}
                      placeholder="ABC-123-D"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full bg-[#C5A55A] text-black font-black text-xs tracking-[0.2em] uppercase py-4 rounded-lg mt-6 hover:bg-[#D4AF37] transition-all duration-300 disabled:opacity-50 flex justify-center items-center cursor-pointer"
                >
                  {saving ? "Guardando..." : editingChofer ? "Guardar Cambios" : "Crear Chofer"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-10 gap-6">
        <div>
          <h2 className="font-heading text-3xl font-semibold text-white tracking-wide">
            Choferes
          </h2>
          <p className="text-sm text-[#C5A55A]/80 font-light mt-1">
            Gestiona las cuentas de los choferes y su vinculacion con Telegram
          </p>
        </div>
        <CreateButton onClick={openCreateModal} label="Nuevo Chofer" />
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
            No hay choferes registrados o no coinciden con la busqueda.
          </p>
        </div>
      ) : (
        <div className="border border-zinc-800/80 bg-zinc-950/40 rounded-xl overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/30">
                <th className="px-6 py-4 text-xs font-bold tracking-wider text-zinc-400 uppercase">
                  Nombre
                </th>
                <th className="px-6 py-4 text-xs font-bold tracking-wider text-zinc-400 uppercase">
                  Teléfono
                </th>
                <th className="px-6 py-4 text-xs font-bold tracking-wider text-zinc-400 uppercase">
                  Correo Electrónico
                </th>
                <th className="px-6 py-4 text-xs font-bold tracking-wider text-zinc-400 uppercase">
                  Confiabilidad
                </th>
                <th className="px-6 py-4 text-xs font-bold tracking-wider text-zinc-400 uppercase">
                  Telegram OTP
                </th>
                <th className="px-6 py-4 text-xs font-bold tracking-wider text-zinc-400 uppercase text-right">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((chofer) => (
                <tr key={chofer.id} className="border-b border-zinc-800/40 hover:bg-zinc-900/10 transition-colors">
                  <td className="px-6 py-4 text-base font-semibold text-white">
                    <div className="flex items-center gap-2">
                      <span>{chofer.nombre}</span>
                      {chofer.sancionada && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-950/80 border border-red-500/40 px-2 py-0.5 text-[10px] font-bold text-red-400">
                          ⛔ Sancionado
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-zinc-300">
                    {chofer.telefono}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-zinc-300">
                    {chofer.email}
                  </td>
                  <td className="px-6 py-4">
                    <ReliabilityRating score={chofer.trustScore} compact />
                  </td>
                  <td className="px-6 py-4 text-sm font-medium">
                    {otpCodes[chofer.usuarioId] ? (
                      <div className="flex items-center gap-2">
                        <span className="bg-[#C5A55A]/10 text-[#C5A55A] border border-[#C5A55A]/30 px-3 py-1.5 rounded-lg text-sm font-mono font-bold">
                          {otpCodes[chofer.usuarioId]}
                        </span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`/vincular ${otpCodes[chofer.usuarioId]}`);
                            toast.success("Copiado al portapapeles");
                          }}
                          title="Copiar comando de vinculacion"
                          className="text-[#C5A55A] hover:text-[#E8D5A3] transition-colors p-1"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleGenerateOtp(chofer.usuarioId)}
                        className="text-xs font-bold tracking-wider text-[#C5A55A] hover:text-[#E8D5A3] transition-colors uppercase"
                      >
                        Generar OTP
                      </button>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right space-x-4">
                    <button
                      onClick={() => openEditModal(chofer)}
                      className="text-[10px] font-bold tracking-widest text-zinc-400 uppercase hover:text-white transition-colors"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() =>
                        setSelectedEvaluationUser({
                          id: chofer.usuarioId || chofer.id,
                          name: chofer.nombre,
                        })
                      }
                      className="text-[10px] font-bold tracking-widest text-[#C5A55A] uppercase hover:text-white transition-colors"
                    >
                      Exámenes
                    </button>
                    <button
                      onClick={() => setConfirmDelete(chofer)}
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

      <EvaluationHistorySheet
        userId={selectedEvaluationUser?.id ?? null}
        workerName={selectedEvaluationUser?.name}
        open={Boolean(selectedEvaluationUser)}
        onOpenChange={(open) => !open && setSelectedEvaluationUser(null)}
      />
    </div>
  );
}
