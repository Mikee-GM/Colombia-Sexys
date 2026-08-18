"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  getModelosAction as getModelos,
  deleteModeloAction as deleteModelo,
  createModeloAction as createModelo,
  updateModeloAction as updateModelo,
} from "@/lib/actions/modelos";
import { generateTelegramOtpAction } from "@/lib/actions/jefes";
import type { Modelo, ModeloPayload } from "@/types";
import ModelModal from "./ModelModal";
import ConfirmDialog from "../ui/ConfirmDialog";
import SearchBar from "../ui/SearchBar";
import CreateButton from "../ui/CreateButton";
import ReliabilityRating from "../ui/ReliabilityRating";
import EvaluationHistorySheet from "./evaluations/evaluation-history-sheet";

interface ModelosDashboardProps {
  initialModelos: Modelo[];
  initialJefes: { id: string; email: string }[];
  initialApartments: { id: string; name: string }[];
}

export default function ModelosDashboard({
  initialModelos,
  initialJefes,
  initialApartments,
}: ModelosDashboardProps) {
  const [modelos, setModelos] = useState<Modelo[]>(initialModelos);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [editingModelo, setEditingModelo] = useState<Modelo | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Modelo | null>(null);
  const [otpCodes, setOtpCodes] = useState<Record<string, string>>({});
  const [selectedEvaluationUser, setSelectedEvaluationUser] = useState<{ id: string; name: string } | null>(null);

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

  const fetchData = async () => {
    try {
      const data = await getModelos(false); // Obtener todas (visibles y ocultas)
      setModelos(data);
    } catch (err: any) {
      showNotification(`Error: ${err.message || "Error al cargar modelos"}`, "error");
    }
  };

  const showNotification = (msg: string, type: "success" | "error") => {
    if (type === "success") {
      toast.success(msg);
    } else {
      toast.error(msg);
    }
  };

  const handleSaveModelo = async (payload: ModeloPayload, id?: string) => {
    try {
      if (id) {
        await updateModelo(id, payload);
        showNotification("Modelo actualizada correctamente.", "success");
      } else {
        await createModelo(payload);
        showNotification("Modelo creada correctamente.", "success");
      }
      await fetchData();
    } catch (err: any) {
      showNotification(`Error: ${err.message || "No se pudo guardar."}`, "error");
      throw err;
    }
  };

  const confirmDeleteHandler = async (modelo: Modelo) => {
    setConfirmDelete(null);
    try {
      await deleteModelo(modelo._id);
      showNotification("Modelo eliminada.", "success");
      await fetchData();
    } catch (err: any) {
      showNotification(`Error: ${err.message || "No se pudo eliminar."}`, "error");
    }
  };

  const filtered = modelos.filter((m) =>
    m.nombre.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeModels = filtered.filter(
    (m) => m.availabilityStatus !== "inactiva" && m.catalogoActivo !== false
  );
  const inactiveModels = filtered.filter(
    (m) => m.availabilityStatus === "inactiva" || m.catalogoActivo === false
  );

  const renderModelCard = (modelo: Modelo, index: number) => (
    <div
      key={modelo._id}
      className="bg-zinc-900/30 border border-zinc-800 group hover:border-zinc-700 transition-colors flex flex-col"
    >
      <div className="aspect-[3/4] relative bg-black border-b border-zinc-800">
        {modelo.fotoPrincipal ? (
          <Image
            src={modelo.fotoPrincipal}
            alt={modelo.nombre}
            fill
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">
              Sin Foto
            </span>
          </div>
        )}
        {modelo.availabilityStatus === "inactiva" || modelo.catalogoActivo === false ? (
          <div className="absolute top-2 left-2 bg-red-950/90 px-2.5 py-1 border border-red-500/50">
            <span className="text-[9px] text-red-300 font-bold tracking-widest uppercase">
              Inactiva (Baja)
            </span>
          </div>
        ) : !modelo.disponible || modelo.availabilityStatus === "ocupada" ? (
          <div className="absolute top-2 left-2 bg-amber-950/90 px-2.5 py-1 border border-amber-500/50">
            <span className="text-[9px] text-amber-300 font-bold tracking-widest uppercase">
              Ocupada
            </span>
          </div>
        ) : (
          <div className="absolute top-2 left-2 bg-black/80 px-2.5 py-1 border border-[#C5A55A]/50">
            <span className="text-[9px] text-[#E8D5A3] font-bold tracking-widest uppercase">
              Disponible
            </span>
          </div>
        )}
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
          <div className="bg-black/80 px-2 py-1 border border-[#C5A55A]/30">
            <span className="text-[9px] text-[#C5A55A] font-bold">
              #{index + 1}
            </span>
          </div>
          {Number(modelo.pendingWeeklyPhotosCount) > 0 && (
            <div className="bg-emerald-950/90 border border-emerald-500/80 px-2 py-1 shadow-lg animate-pulse">
              <span className="text-[9px] text-emerald-300 font-bold uppercase tracking-wider">
                📸 {modelo.pendingWeeklyPhotosCount} por validar
              </span>
            </div>
          )}
          {modelo.weeklyContentStatus === "atrasado" && Number(modelo.pendingWeeklyPhotosCount || 0) === 0 && (
            <div className="bg-red-950/90 border border-red-500/80 px-2 py-1 shadow-lg">
              <span className="text-[9px] text-red-300 font-bold uppercase tracking-wider">
                ⚠️ Fotos atrasadas
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 flex-1 flex flex-col">
        <h3 className="font-heading text-lg font-semibold text-white mb-2">
          {modelo.nombre}
        </h3>
        <ReliabilityRating
          score={modelo.trustScore}
          compact
          className="mb-3"
        />
        {modelo.usuarioId && (
          <div className="mb-3">
            {otpCodes[modelo.usuarioId!] ? (
              <div className="flex items-center gap-2">
                <div className="inline-block bg-[#C5A55A]/10 text-[#C5A55A] border border-[#C5A55A]/30 px-3 py-1 rounded text-xs font-mono font-bold">
                  OTP: {otpCodes[modelo.usuarioId!]}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `/vincular ${otpCodes[modelo.usuarioId!]}`,
                    );
                    toast.success("Copiado al portapapeles");
                  }}
                  title="Copiar comando de vinculacion"
                  className="text-[#C5A55A] hover:text-[#E8D5A3] transition-colors p-1"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </button>
              </div>
            ) : (
              <button
                onClick={() => handleGenerateOtp(modelo.usuarioId!)}
                className="text-[10px] font-bold tracking-widest text-[#C5A55A] hover:text-[#E8D5A3] transition-colors uppercase"
              >
                Generar OTP
              </button>
            )}
          </div>
        )}
        <div className="mt-auto flex gap-3 pt-3 border-t border-zinc-800/60">
          <button
            onClick={() => {
              setEditingModelo(modelo);
              setShowModal(true);
            }}
            className="text-[10px] font-bold tracking-widest text-[#E8D5A3] uppercase hover:text-white transition-colors"
          >
            Editar
          </button>
          <button
            onClick={() =>
              setSelectedEvaluationUser({
                id: modelo.usuarioId || modelo._id,
                name: modelo.nombre,
              })
            }
            className="text-[10px] font-bold tracking-widest text-[#C5A55A] uppercase hover:text-white transition-colors"
          >
            Exámenes
          </button>
          <button
            onClick={() => setConfirmDelete(modelo)}
            className="text-[10px] font-bold tracking-widest text-zinc-600 uppercase hover:text-red-400 transition-colors ml-auto"
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-full">
      {/* Dialogo de confirmacion */}
      <AnimatePresence>
        {confirmDelete && (
          <ConfirmDialog
            key="confirm-delete"
            title={`Eliminar a "${confirmDelete.nombre}"`}
            description="Esta accion es permanente. El perfil, sus datos y sus fotos asociadas en la nube seran removidos por completo de inmediato."
            labelConfirm="Si, eliminar"
            onConfirm={() => confirmDeleteHandler(confirmDelete)}
            onCancel={() => setConfirmDelete(null)}
          />
        )}
      </AnimatePresence>

      {/* Modal de Modelo */}
      <AnimatePresence>
        {showModal && (
          <ModelModal
            modelo={editingModelo}
            onClose={() => {
              setShowModal(false);
              setEditingModelo(null);
            }}
            onSave={handleSaveModelo}
            showNotification={showNotification}
            jefes={initialJefes}
            apartments={initialApartments}
          />
        )}
      </AnimatePresence>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-10 gap-6">
        <div>
          <h2 className="font-heading text-3xl font-semibold text-white tracking-wide">
            Directorio
          </h2>
          <p className="text-sm text-[#C5A55A]/80 font-light mt-1">
            Gestiona los perfiles y fotos de las modelos
          </p>
        </div>
        <CreateButton
          onClick={() => {
            setEditingModelo(null);
            setShowModal(true);
          }}
          label="Nueva Modelo"
        />
      </div>

      <SearchBar
        placeholder="Buscar por nombre..."
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
            No hay modelos registradas o no coinciden con la busqueda.
          </p>
        </div>
      ) : (
        <div className="space-y-12">
          {/* Sección de Modelos Activas */}
          <div>
            <div className="flex items-center gap-3 mb-6">
              <span className="w-2 h-2 rounded-full bg-[#C5A55A]"></span>
              <h3 className="font-heading text-sm font-bold text-white tracking-widest uppercase">
                Modelos Activas ({activeModels.length})
              </h3>
            </div>
            {activeModels.length === 0 ? (
              <div className="border border-zinc-800/60 border-dashed py-12 text-center">
                <p className="text-xs text-zinc-500 font-light">
                  No hay modelos activas que coincidan con la búsqueda.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {activeModels.map((modelo, index) =>
                  renderModelCard(modelo, index),
                )}
              </div>
            )}
          </div>

          {/* Sección de Modelos Inactivas / Ocultas */}
          {inactiveModels.length > 0 && (
            <div className="pt-8 border-t border-zinc-800/80">
              <div className="flex items-center gap-3 mb-6">
                <span className="w-2 h-2 rounded-full bg-zinc-500"></span>
                <h3 className="font-heading text-sm font-bold text-zinc-400 tracking-widest uppercase">
                  Modelos Inactivas / Baja de Agencia ({inactiveModels.length})
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 opacity-75 hover:opacity-100 transition-opacity">
                {inactiveModels.map((modelo, index) =>
                  renderModelCard(modelo, index),
                )}
              </div>
            </div>
          )}
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
