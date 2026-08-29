"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  X,
  Building2,
  MapPin,
  FileText,
  Save,
  Loader2,
  Compass,
} from "lucide-react";
import LocationPickerMapDynamic from "./LocationPickerMapDynamic";
import type { Apartment, ApartmentInput } from "@/lib/actions/apartments";
import { createApartmentAction, updateApartmentAction } from "@/lib/actions/apartments";

interface DepartmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  department: Apartment | null;
  onSaved: (saved: Apartment) => void;
}

export default function DepartmentModal({
  isOpen,
  onClose,
  department,
  onSaved,
}: DepartmentModalProps) {
  const isEditing = Boolean(department);

  const [nombre, setNombre] = useState("");
  const [direccion, setDireccion] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (department) {
      setNombre(department.nombre || "");
      setDireccion(department.direccion || "");
      setDescripcion(department.descripcion || "");
      setLat(department.ubicacionLat);
      setLng(department.ubicacionLng);
    } else {
      setNombre("");
      setDireccion("");
      setDescripcion("");
      setLat(null);
      setLng(null);
    }
  }, [department, isOpen]);

  const handleLocationChange = (latitude: number, longitude: number, formattedAddress?: string) => {
    setLat(latitude);
    setLng(longitude);
    if (formattedAddress && !direccion) {
      setDireccion(formattedAddress);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      toast.error("El nombre del departamento es obligatorio");
      return;
    }

    setSaving(true);
    try {
      const payload: ApartmentInput = {
        nombre: nombre.trim(),
        direccion: direccion.trim() || null,
        descripcion: descripcion.trim() || null,
        ubicacionLat: lat,
        ubicacionLng: lng,
      };

      let result: Apartment;
      if (isEditing && department) {
        result = await updateApartmentAction(department.id, payload);
        toast.success(`Departamento "${result.nombre}" actualizado con éxito`);
      } else {
        result = await createApartmentAction(payload);
        toast.success(`Departamento "${result.nombre}" creado con éxito`);
      }

      onSaved(result);
      onClose();
    } catch (err: any) {
      console.error("Error saving department:", err);
      toast.error(err.message || "Error al guardar el departamento");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/85 backdrop-blur-sm"
        />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-3xl rounded-2xl border border-zinc-800 bg-[#080808] p-6 shadow-2xl z-10 my-8 flex flex-col max-h-[90vh] overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#C5A55A]/15 border border-[#C5A55A]/30 text-[#C5A55A]">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white tracking-wide">
                  {isEditing ? "Editar Departamento" : "Nuevo Departamento"}
                </h2>
                <p className="text-xs text-zinc-400">
                  {isEditing
                    ? "Modifica los datos y ubicación de este departamento"
                    : "Registra un nuevo departamento y fija su ubicación en el mapa"}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Form Content */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-5 pr-1 space-y-5 custom-scrollbar">
            {/* Nombre y Dirección */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                  Nombre del Departamento <span className="text-[#C5A55A]">*</span>
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
                  <input
                    type="text"
                    required
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ej. Montecarlo 204, Torre Reforma 12B"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-2.5 pl-10 pr-4 text-sm text-white placeholder-zinc-600 focus:border-[#C5A55A] focus:outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                  Dirección Física
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
                  <input
                    type="text"
                    value={direccion}
                    onChange={(e) => setDireccion(e.target.value)}
                    placeholder="Ej. Av. Horacio 1520, Polanco, CDMX"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-2.5 pl-10 pr-4 text-sm text-white placeholder-zinc-600 focus:border-[#C5A55A] focus:outline-none transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Descripción / Notas */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                Descripción / Notas de Acceso
              </label>
              <div className="relative">
                <FileText className="absolute left-3.5 top-3 h-4 w-4 text-zinc-500 pointer-events-none" />
                <textarea
                  rows={2}
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Ej. Entrada por portón gris, timbre 4, piso 2. Contraseña del elevador 4521..."
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-2.5 pl-10 pr-4 text-sm text-white placeholder-zinc-600 focus:border-[#C5A55A] focus:outline-none transition-all resize-none"
                />
              </div>
            </div>

            {/* Selector de Ubicación en el Mapa con Buscador de Dirección */}
            <div className="space-y-2 pt-2 border-t border-zinc-850">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Compass className="h-4 w-4 text-[#C5A55A]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                    Ubicación y Geocodificación en Mapa
                  </span>
                </div>
                <span className="text-[11px] text-zinc-500">
                  Busca por dirección o haz clic directo en el mapa
                </span>
              </div>

              <LocationPickerMapDynamic
                latitude={lat}
                longitude={lng}
                onChange={handleLocationChange}
                address={direccion}
                onAddressChange={(newAddr) => setDireccion(newAddr)}
                heightClass="h-72"
              />
            </div>
          </form>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-2.5 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || !nombre.trim()}
              className="flex items-center gap-2 rounded-xl bg-[#C5A55A] px-5 py-2.5 text-xs font-bold text-black hover:bg-[#E8D5A3] transition-all shadow-lg shadow-[#C5A55A]/20 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>{isEditing ? "Guardar Cambios" : "Crear Departamento"}</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
