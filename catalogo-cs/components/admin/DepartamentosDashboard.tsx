"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Building2,
  Plus,
  Search,
  MapPin,
  Users,
  Edit2,
  Trash2,
  ExternalLink,
  LayoutGrid,
  List,
  Map as MapIcon,
  X,
  Compass,
  AlertTriangle,
} from "lucide-react";
import type { Apartment } from "@/lib/actions/apartments";
import { deleteApartmentAction, getApartmentsAction } from "@/lib/actions/apartments";
import DepartmentModal from "./DepartmentModal";
import DepartamentosOverviewMapDynamic from "./DepartamentosOverviewMapDynamic";
import ConfirmDialog from "../ui/ConfirmDialog";

interface DepartamentosDashboardProps {
  initialDepartments: Apartment[];
}

export default function DepartamentosDashboard({
  initialDepartments,
}: DepartamentosDashboardProps) {
  const [departments, setDepartments] = useState<Apartment[]>(initialDepartments);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "with_gps" | "without_gps" | "with_models">("all");
  const [viewMode, setViewMode] = useState<"grid" | "list" | "map">("grid");

  // Estados de modales
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Apartment | null>(null);
  const [deletingDepartment, setDeletingDepartment] = useState<Apartment | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Recargar departamentos desde el servidor
  const refreshData = async () => {
    try {
      const data = await getApartmentsAction();
      setDepartments(data);
    } catch (err) {
      console.error("Error refreshing departments:", err);
    }
  };

  // Filtrado y búsqueda
  const filteredDepartments = useMemo(() => {
    let result = departments;

    // Filtro por pestaña
    if (filterTab === "with_gps") {
      result = result.filter(
        (d) => d.ubicacionLat !== null && d.ubicacionLng !== null,
      );
    } else if (filterTab === "without_gps") {
      result = result.filter(
        (d) => d.ubicacionLat === null || d.ubicacionLng === null,
      );
    } else if (filterTab === "with_models") {
      result = result.filter((d) => (d.empleadas || []).length > 0);
    }

    // Búsqueda por texto
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((d) => {
        const matchName = d.nombre.toLowerCase().includes(q);
        const matchAddress = (d.direccion || "").toLowerCase().includes(q);
        const matchDesc = (d.descripcion || "").toLowerCase().includes(q);
        const matchModel = (d.empleadas || []).some((m) =>
          m.nombreArtistico.toLowerCase().includes(q) ||
          (m.nombreReal || "").toLowerCase().includes(q),
        );
        return matchName || matchAddress || matchDesc || matchModel;
      });
    }

    return result;
  }, [departments, filterTab, searchQuery]);

  // Estadísticas rápidas
  const stats = useMemo(() => {
    const total = departments.length;
    const withGps = departments.filter(
      (d) => d.ubicacionLat !== null && d.ubicacionLng !== null,
    ).length;
    const totalModels = departments.reduce(
      (acc, d) => acc + (d.empleadas || []).length,
      0,
    );
    return { total, withGps, totalModels };
  }, [departments]);

  // Manejadores
  const handleOpenCreate = () => {
    setEditingDepartment(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (dept: Apartment) => {
    setEditingDepartment(dept);
    setIsModalOpen(true);
  };

  const handleSaved = (saved: Apartment) => {
    setDepartments((prev) => {
      const idx = prev.findIndex((d) => d.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...saved };
        return next;
      }
      return [saved, ...prev];
    });
    refreshData();
  };

  const handleConfirmDelete = async () => {
    if (!deletingDepartment) return;
    setIsDeleting(true);
    try {
      await deleteApartmentAction(deletingDepartment.id);
      toast.success(`Departamento "${deletingDepartment.nombre}" eliminado`);
      setDepartments((prev) => prev.filter((d) => d.id !== deletingDepartment.id));
      setDeletingDepartment(null);
    } catch (err: any) {
      console.error("Error deleting department:", err);
      toast.error(err.message || "Error al eliminar departamento");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Acciones Principales */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#C5A55A]/15 border border-[#C5A55A]/30 text-[#C5A55A]">
              <Building2 className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white font-heading">
              Departamentos y Sedes
            </h1>
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            Administra los departamentos operativos, su ubicación exacta en el mapa y las modelos asignadas.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="flex items-center justify-center gap-2 rounded-xl bg-[#C5A55A] px-4 py-2.5 text-xs font-bold text-black hover:bg-[#E8D5A3] transition-all shadow-lg shadow-[#C5A55A]/20 shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>Nuevo Departamento</span>
        </button>
      </div>

      {/* Tarjetas de Estadísticas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-zinc-800 bg-[#0A0A0A] p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              Total Departamentos
            </p>
            <p className="text-2xl font-bold text-white mt-1 font-heading">
              {stats.total}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-[#C5A55A]">
            <Building2 className="h-5 w-5" />
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-[#0A0A0A] p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              Con Ubicación GPS
            </p>
            <p className="text-2xl font-bold text-emerald-400 mt-1 font-heading">
              {stats.withGps}
              <span className="text-xs font-normal text-zinc-500 ml-1">
                / {stats.total}
              </span>
            </p>
          </div>
          <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-400">
            <Compass className="h-5 w-5" />
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-[#0A0A0A] p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              Modelos Asignadas
            </p>
            <p className="text-2xl font-bold text-purple-400 mt-1 font-heading">
              {stats.totalModels}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-purple-950/40 border border-purple-500/30 text-purple-400">
            <Users className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Barra de Filtros, Búsqueda y Modos de Vista */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#0A0A0A] p-3 rounded-2xl border border-zinc-800">
        {/* Buscador */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar departamento, dirección o modelo..."
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-2 pl-9 pr-8 text-xs text-white placeholder:text-zinc-500 focus:border-[#C5A55A] focus:outline-none transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-0.5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Pestañas de Filtro y Switch de Vista */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-zinc-950 border border-zinc-800 p-1 text-xs">
            <button
              onClick={() => setFilterTab("all")}
              className={`px-3 py-1 rounded-lg font-medium transition-all ${
                filterTab === "all"
                  ? "bg-[#C5A55A] text-black font-bold shadow"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Todos ({departments.length})
            </button>
            <button
              onClick={() => setFilterTab("with_gps")}
              className={`px-3 py-1 rounded-lg font-medium transition-all ${
                filterTab === "with_gps"
                  ? "bg-[#C5A55A] text-black font-bold shadow"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Con GPS ({stats.withGps})
            </button>
            <button
              onClick={() => setFilterTab("with_models")}
              className={`px-3 py-1 rounded-lg font-medium transition-all ${
                filterTab === "with_models"
                  ? "bg-[#C5A55A] text-black font-bold shadow"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Con Modelos
            </button>
          </div>

          <div className="flex rounded-xl bg-zinc-950 border border-zinc-800 p-1 text-xs">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === "grid"
                  ? "bg-[#C5A55A] text-black"
                  : "text-zinc-400 hover:text-white"
              }`}
              title="Vista en cuadrícula"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === "list"
                  ? "bg-[#C5A55A] text-black"
                  : "text-zinc-400 hover:text-white"
              }`}
              title="Vista en lista"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("map")}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === "map"
                  ? "bg-[#C5A55A] text-black"
                  : "text-zinc-400 hover:text-white"
              }`}
              title="Vista en mapa general"
            >
              <MapIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Contenido Principal según el Modo de Vista */}
      {viewMode === "map" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-semibold text-zinc-400">
              Mostrando {filteredDepartments.filter((d) => d.ubicacionLat !== null).length} departamentos con marcadores en el mapa
            </p>
          </div>
          <DepartamentosOverviewMapDynamic
            departments={filteredDepartments}
            onSelectDepartment={(dept) => handleOpenEdit(dept)}
          />
        </div>
      ) : filteredDepartments.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-[#0A0A0A] p-12 text-center">
          <Building2 className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white">No se encontraron departamentos</h3>
          <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
            {searchQuery
              ? "Intenta con otro término de búsqueda o limpia los filtros."
              : "Comienza agregando el primer departamento operativo para asignarle modelos y coordenadas."}
          </p>
          {!searchQuery && (
            <button
              onClick={handleOpenCreate}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#C5A55A] px-4 py-2 text-xs font-bold text-black hover:bg-[#E8D5A3] transition-all"
            >
              <Plus className="h-4 w-4" />
              <span>Crear Primer Departamento</span>
            </button>
          )}
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {filteredDepartments.map((dept) => {
              const hasGps = dept.ubicacionLat !== null && dept.ubicacionLng !== null;
              const modelos = dept.empleadas || [];

              return (
                <motion.article
                  key={dept.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="rounded-2xl border border-zinc-800 bg-[#0A0A0A] p-5 flex flex-col justify-between hover:border-[#C5A55A]/40 transition-all group shadow-lg"
                >
                  <div className="space-y-3">
                    {/* Header de la tarjeta */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#C5A55A]/10 border border-[#C5A55A]/30 text-[#C5A55A] group-hover:bg-[#C5A55A] group-hover:text-black transition-colors">
                          <Building2 className="h-4.5 w-4.5" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-bold text-white text-base truncate group-hover:text-[#E8D5A3] transition-colors">
                            {dept.nombre}
                          </h3>
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold mt-0.5 uppercase tracking-wider ${
                              hasGps
                                ? "bg-emerald-950/60 text-emerald-400 border border-emerald-500/30"
                                : "bg-zinc-900 text-zinc-500 border border-zinc-800"
                            }`}
                          >
                            <MapPin className="h-2.5 w-2.5" />
                            {hasGps ? "GPS Activo" : "Sin Coordenadas"}
                          </span>
                        </div>
                      </div>

                      {hasGps && (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${dept.ubicacionLat},${dept.ubicacionLng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-[#C5A55A] hover:bg-zinc-900 transition-colors"
                          title="Abrir en Google Maps"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>

                    {/* Dirección */}
                    {dept.direccion ? (
                      <p className="text-xs text-zinc-400 flex items-start gap-1.5 line-clamp-2">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-[#C5A55A] mt-0.5" />
                        <span>{dept.direccion}</span>
                      </p>
                    ) : (
                      <p className="text-xs text-zinc-600 italic">
                        Sin dirección registrada
                      </p>
                    )}

                    {/* Descripción / Notas de acceso */}
                    {dept.descripcion && (
                      <div className="rounded-xl bg-zinc-950/90 border border-zinc-900 p-2.5 text-[11px] text-zinc-400 line-clamp-2">
                        <span className="text-zinc-500 font-semibold block text-[10px] uppercase">
                          Notas:
                        </span>
                        {dept.descripcion}
                      </div>
                    )}

                    {/* Modelos Asignadas */}
                    <div className="pt-2 border-t border-zinc-900">
                      <div className="flex items-center justify-between text-[11px] mb-1.5">
                        <span className="font-semibold text-zinc-400 flex items-center gap-1">
                          <Users className="h-3.5 w-3.5 text-purple-400" />
                          Modelos en esta sede:
                        </span>
                        <span className="font-bold text-white">
                          {modelos.length}
                        </span>
                      </div>

                      {modelos.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 max-h-16 overflow-y-auto custom-scrollbar">
                          {modelos.map((m) => (
                            <Link
                              key={m.id}
                              href="/admin/modelos"
                              className="inline-flex items-center gap-1 rounded-lg bg-purple-950/40 border border-purple-500/30 px-2 py-0.5 text-[10px] font-semibold text-purple-300 hover:bg-purple-900/60 transition-colors"
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
                              <span>{m.nombreArtistico}</span>
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-zinc-600 italic">
                          Ninguna modelo vinculada actualmente
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Acciones de Tarjeta */}
                  <div className="mt-4 pt-3 border-t border-zinc-900 flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleOpenEdit(dept)}
                      className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:text-white hover:border-[#C5A55A]/50 transition-colors"
                    >
                      <Edit2 className="h-3.5 w-3.5 text-[#C5A55A]" />
                      <span>Editar</span>
                    </button>
                    <button
                      onClick={() => setDeletingDepartment(dept)}
                      className="p-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 text-zinc-500 hover:text-red-400 hover:border-red-500/40 transition-colors"
                      title="Eliminar departamento"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </motion.article>
              );
            })}
          </AnimatePresence>
        </div>
      ) : (
        /* Vista en Lista */
        <div className="rounded-2xl border border-zinc-800 bg-[#0A0A0A] overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-800 bg-zinc-950 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Dirección</th>
                  <th className="px-4 py-3">Modelos Asignadas</th>
                  <th className="px-4 py-3">Coordenadas</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900 text-zinc-300">
                {filteredDepartments.map((dept) => {
                  const hasGps = dept.ubicacionLat !== null && dept.ubicacionLng !== null;
                  const modelos = dept.empleadas || [];

                  return (
                    <tr key={dept.id} className="hover:bg-zinc-900/40 transition-colors">
                      <td className="px-4 py-3 font-semibold text-white">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-[#C5A55A] shrink-0" />
                          <span className="truncate">{dept.nombre}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 max-w-xs truncate text-zinc-400">
                        {dept.direccion || <span className="text-zinc-600 italic">Sin dirección</span>}
                      </td>
                      <td className="px-4 py-3">
                        {modelos.length > 0 ? (
                          <div className="flex items-center gap-1">
                            <span className="rounded bg-purple-950/70 border border-purple-500/30 px-1.5 py-0.5 text-[10px] font-bold text-purple-300">
                              {modelos.length}
                            </span>
                            <span className="text-[11px] text-zinc-400 truncate max-w-[140px]">
                              {modelos.map((m) => m.nombreArtistico).join(", ")}
                            </span>
                          </div>
                        ) : (
                          <span className="text-zinc-600 text-[10px]">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px]">
                        {hasGps ? (
                          <span className="text-emerald-400">
                            {Number(dept.ubicacionLat).toFixed(4)}, {Number(dept.ubicacionLng).toFixed(4)}
                          </span>
                        ) : (
                          <span className="text-zinc-600">Sin GPS</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenEdit(dept)}
                            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                            title="Editar"
                          >
                            <Edit2 className="h-3.5 w-3.5 text-[#C5A55A]" />
                          </button>
                          <button
                            onClick={() => setDeletingDepartment(dept)}
                            className="p-1 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal para Crear / Editar */}
      <DepartmentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        department={editingDepartment}
        onSaved={handleSaved}
      />

      {/* Modal de Confirmación para Eliminar */}
      {deletingDepartment && (
        <ConfirmDialog
          title={`¿Eliminar "${deletingDepartment.nombre}"?`}
          description={
            (deletingDepartment.empleadas || []).length > 0
              ? `¿Estás seguro de que deseas eliminar este departamento? Hay ${(deletingDepartment.empleadas || []).length} modelo(s) asignadas que quedarán desvinculadas.`
              : `¿Estás seguro de que deseas eliminar este departamento? Esta acción no se puede deshacer.`
          }
          labelConfirm="Eliminar Departamento"
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeletingDepartment(null)}
        />
      )}
    </div>
  );
}
