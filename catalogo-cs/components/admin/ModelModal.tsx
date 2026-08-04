"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import imageCompression from "browser-image-compression";
import type { Modelo, ModeloPayload } from "@/types";

import { uploadImagesAction, deleteImageAction } from "@/lib/actions/upload";
import InputField from "../ui/InputField";
import TextareaField from "../ui/TextareaField";
import SelectField from "../ui/SelectField";

const inputClass =
  "w-full bg-black border border-zinc-800 text-white text-sm font-medium px-4 py-3 transition-all duration-200 focus:border-[#C5A55A] placeholder:text-zinc-600 focus:outline-none";

interface ModelModalProps {
  modelo: Modelo | null;
  onClose: () => void;
  onSave: (payload: ModeloPayload, id?: string) => Promise<void>;
  showNotification: (msg: string, type: "success" | "error") => void;
  jefes: { id: string; email: string }[];
  apartments: { id: string; name: string }[];
}

const PREDEFINED_EXTRAS = [
  { nombre: "Oral natural", precio: 500 },
  { nombre: "Oral natural terminado en cara", precio: 1000 },
  { nombre: "Oral natural con terminado en boca", precio: 1500 },
  { nombre: "Trío", precio: 1500 },
  { nombre: "Atención a parejas", precio: 2500 },
  { nombre: "Córrete donde quieras", precio: 12000 },
];

export default function ModelModal({
  modelo,
  onClose,
  onSave,
  showNotification,
  jefes,
  apartments,
}: ModelModalProps) {
  const [newExtraNombre, setNewExtraNombre] = useState("");
  const [newExtraPrecio, setNewExtraPrecio] = useState("");

  const [form, setForm] = useState<ModeloPayload>(
    modelo
      ? {
          nombreReal: modelo.nombreReal || "",
          nombreArtistico: modelo.nombreArtistico || "",
          descripcion: modelo.descripcion,
          fotoPrincipal: modelo.fotoPrincipal,
          fotos: [...modelo.fotos],
          linkX: modelo.linkX,
          contactLink: modelo.contactLink,
          contactLabel: modelo.contactLabel,
          disponible: modelo.disponible,
          catalogoActivo: (modelo as any).catalogoActivo !== false && modelo.availabilityStatus !== "inactiva",
          precioBaseHora: modelo.precioBaseHora,
          jefeId: modelo.jefeId,
          jefeSecundarioId: modelo.jefeSecundarioId,
          apartmentId: modelo.apartmentId,
          extras: modelo.extras ? [...modelo.extras] : [],
        }
      : {
          nombreReal: "",
          nombreArtistico: "",
          descripcion: "",
          fotoPrincipal: "",
          fotos: [],
          linkX: "",
          contactLink: "",
          contactLabel: "Contacto",
          disponible: true,
          catalogoActivo: true,
          precioBaseHora: 2500,
          jefeId: "",
          jefeSecundarioId: "",
          apartmentId: "",
          extras: [],
        }
  );

  // Estados locales para manejo de archivos locales y previsualizaciones antes de subir a R2
  const [fotoPrincipalFile, setFotoPrincipalFile] = useState<File | null>(null);
  const [fotoPrincipalPreview, setFotoPrincipalPreview] = useState<string>(modelo?.fotoPrincipal || "");

  interface GalleryItem {
    id: string;
    type: "url" | "file";
    url?: string;
    file?: File;
    preview?: string;
  }

  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>(
    modelo?.fotos.map((url, i) => ({ id: `url-${i}-${url}`, type: "url" as const, url })) || []
  );

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Limpiar URLs de objetos de tipo file al desmontar el componente para evitar fugas de memoria
  useEffect(() => {
    return () => {
      if (fotoPrincipalPreview && fotoPrincipalPreview.startsWith("blob:")) {
        URL.revokeObjectURL(fotoPrincipalPreview);
      }
      galleryItems.forEach((item) => {
        if (item.type === "file" && item.preview) {
          URL.revokeObjectURL(item.preview);
        }
      });
    };
  }, [fotoPrincipalPreview, galleryItems]);

  // Helper para comprimir imagen
  const compressImage = async (file: File) => {
    return imageCompression(file, {
      maxSizeMB: 0.5,
      maxWidthOrHeight: 1080,
      useWebWorker: true,
    });
  };

  const handleUploadPrincipal = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (fotoPrincipalPreview && fotoPrincipalPreview.startsWith("blob:")) {
      URL.revokeObjectURL(fotoPrincipalPreview);
    }

    setFotoPrincipalFile(file);
    setFotoPrincipalPreview(URL.createObjectURL(file));
  };

  const handleUploadGaleria = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (galleryItems.length + files.length > 5) {
      showNotification("No puedes subir mas de 5 fotos a la galeria", "error");
      return;
    }

    const newItems: GalleryItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const preview = URL.createObjectURL(file);
      newItems.push({
        id: `file-${Date.now()}-${i}`,
        type: "file",
        file,
        preview,
      });
    }

    setGalleryItems((prev) => [...prev, ...newItems]);
  };

  const removeFotoGaleria = (index: number) => {
    setGalleryItems((prev) => {
      const copy = [...prev];
      const item = copy[index];
      if (item.type === "file" && item.preview) {
        URL.revokeObjectURL(item.preview);
      }
      copy.splice(index, 1);
      return copy;
    });
  };

  const addExtra = () => {
    if (!newExtraNombre.trim()) {
      showNotification("El nombre del servicio extra no puede estar vacío.", "error");
      return;
    }
    const precioNum = parseFloat(newExtraPrecio);
    if (isNaN(precioNum) || precioNum < 0) {
      showNotification("El precio debe ser un número válido mayor o igual a 0.", "error");
      return;
    }
    
    // Validar duplicados por nombre
    const duplicado = form.extras?.some(
      (e) => e.nombre.toLowerCase().trim() === newExtraNombre.toLowerCase().trim()
    );
    if (duplicado) {
      showNotification("Ya existe un servicio extra con ese nombre.", "error");
      return;
    }

    setForm((prev) => ({
      ...prev,
      extras: [...(prev.extras || []), { nombre: newExtraNombre.trim(), precio: precioNum }],
    }));
    setNewExtraNombre("");
    setNewExtraPrecio("");
  };

  const removeExtra = (index: number) => {
    setForm((prev) => {
      const newExtras = [...(prev.extras || [])];
      newExtras.splice(index, 1);
      return { ...prev, extras: newExtras };
    });
  };

  const togglePredefinedExtra = (item: { nombre: string; precio: number }) => {
    setForm((prev) => {
      const existingIndex = (prev.extras || []).findIndex(
        (e) => e.nombre.toLowerCase().trim() === item.nombre.toLowerCase().trim()
      );
      if (existingIndex >= 0) {
        const updated = [...(prev.extras || [])];
        updated.splice(existingIndex, 1);
        return { ...prev, extras: updated };
      } else {
        return {
          ...prev,
          extras: [...(prev.extras || []), { nombre: item.nombre, precio: item.precio }],
        };
      }
    });
  };

  const updateExtraPrecio = (index: number, newPrecio: number) => {
    setForm((prev) => {
      const newExtras = [...(prev.extras || [])];
      newExtras[index] = { ...newExtras[index], precio: newPrecio };
      return { ...prev, extras: newExtras };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombreReal.trim() || !form.nombreArtistico.trim()) {
      showNotification("El nombre real y el artistico son obligatorios.", "error");
      return;
    }
    if (!fotoPrincipalPreview) {
      showNotification("La foto principal es obligatoria.", "error");
      return;
    }

    setSaving(true);
    try {
      const filesToUpload: File[] = [];
      let principalUploadIndex = -1;

      if (fotoPrincipalFile) {
        filesToUpload.push(fotoPrincipalFile);
        principalUploadIndex = 0;
      }

      galleryItems.forEach((item) => {
        if (item.type === "file" && item.file) {
          filesToUpload.push(item.file);
        }
      });

      let uploadedUrls: string[] = [];
      if (filesToUpload.length > 0) {
        // Comprimir todas las fotos en paralelo
        const compressedFiles = await Promise.all(
          filesToUpload.map((file) => compressImage(file))
        );
        const formData = new FormData();
        for (const compressed of compressedFiles) {
          formData.append("files", compressed);
        }
        uploadedUrls = await uploadImagesAction(formData);
      }

      let finalFotoPrincipal = form.fotoPrincipal;
      if (principalUploadIndex !== -1) {
        finalFotoPrincipal = uploadedUrls[principalUploadIndex];
      }

      let uploadCounter = principalUploadIndex !== -1 ? 1 : 0;
      const finalFotos: string[] = [];
      for (const item of galleryItems) {
        if (item.type === "file" && item.file) {
          finalFotos.push(uploadedUrls[uploadCounter]);
          uploadCounter++;
        } else if (item.type === "url" && item.url) {
          finalFotos.push(item.url);
        }
      }

      const updatedForm: ModeloPayload = {
        ...form,
        fotoPrincipal: finalFotoPrincipal,
        fotos: finalFotos,
      };

      await onSave(updatedForm, modelo?._id);
      onClose();
    } catch (error: any) {
      showNotification(error.message || "Error al procesar y guardar el perfil.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/90 backdrop-blur-sm overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && !saving && !uploading && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 20 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-5xl bg-black border border-zinc-800 shadow-2xl my-auto"
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800 bg-zinc-900/30">
          <div>
            <h2 className="text-xl font-heading font-semibold text-white tracking-wide">
              {modelo ? "Editar Modelo" : "Nueva Modelo"}
            </h2>
            <p className="text-xs text-zinc-500 font-light mt-1">
              Configura los datos del perfil y fotos (maximo 5 en galeria).
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={saving || uploading}
            className="text-zinc-600 hover:text-[#C5A55A] transition-colors disabled:opacity-40"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Columna Izquierda: Datos */}
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <InputField
                  label="Nombre Real"
                  type="text"
                  value={form.nombreReal}
                  onChange={(e) => setForm({ ...form, nombreReal: e.target.value })}
                  placeholder="Ej: Sofia Gomez Velez"
                  required
                />
                <InputField
                  label="Nombre Artistico"
                  type="text"
                  value={form.nombreArtistico}
                  onChange={(e) => setForm({ ...form, nombreArtistico: e.target.value })}
                  placeholder="Ej: Sofia Velez"
                  required
                />
              </div>

              <TextareaField
                label="Descripcion"
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                placeholder="Breve bio o descripcion del perfil..."
                rows={3}
              />

              <div className="grid grid-cols-2 gap-4">
                <SelectField
                  label="Jefe Asignado"
                  value={form.jefeId || ""}
                  onChange={(e) => setForm({ ...form, jefeId: e.target.value || null })}
                  options={[
                    { value: "", label: "Ninguno" },
                    ...jefes.map((j) => ({ value: j.id, label: j.email })),
                  ]}
                />
                <SelectField
                  label="Jefe Secundario"
                  value={form.jefeSecundarioId || ""}
                  onChange={(e) => setForm({ ...form, jefeSecundarioId: e.target.value || null })}
                  options={[
                    { value: "", label: "Ninguno" },
                    ...jefes.map((j) => ({ value: j.id, label: j.email })),
                  ]}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <SelectField
                  label="Departamento/Apartamento"
                  value={form.apartmentId || ""}
                  onChange={(e) => setForm({ ...form, apartmentId: e.target.value || null })}
                  options={[
                    { value: "", label: "Ninguno" },
                    ...apartments.map((a) => ({ value: a.id, label: a.name })),
                  ]}
                />
                <InputField
                  label="Tarifa por Hora (MXN)"
                  type="number"
                  value={form.precioBaseHora}
                  onChange={(e) => setForm({ ...form, precioBaseHora: parseFloat(e.target.value) || 0 })}
                  placeholder="Ej: 2500"
                  required
                  min={0}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <InputField
                  label="Etiqueta Boton Contacto"
                  type="text"
                  value={form.contactLabel}
                  onChange={(e) => setForm({ ...form, contactLabel: e.target.value })}
                  placeholder="Contratar"
                />
                <InputField
                  label="Link de X (Twitter)"
                  type="url"
                  value={form.linkX}
                  onChange={(e) => setForm({ ...form, linkX: e.target.value })}
                  placeholder="https://x.com/..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-zinc-800 pt-5">
                <div>
                  <label className="block text-[10px] font-bold tracking-widest text-[#C5A55A] uppercase mb-2">
                    Estado en la Agencia
                  </label>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, catalogoActivo: form.catalogoActivo === false ? true : false })}
                    className={`relative w-12 h-6 transition-colors duration-300 rounded-full ${
                      form.catalogoActivo !== false ? "bg-[#C5A55A]" : "bg-red-900"
                    }`}
                  >
                    <span
                      className={`absolute top-1 h-4 w-4 rounded-full transition-all duration-300 ${
                        form.catalogoActivo !== false ? "left-7 bg-black" : "left-1 bg-white"
                      }`}
                    />
                  </button>
                  <span className="ml-3 text-xs text-zinc-300 font-medium">
                    {form.catalogoActivo !== false ? "Activa en Agencia" : "Inactiva / Baja (Oculta)"}
                  </span>
                </div>

                <div>
                  <label className="block text-[10px] font-bold tracking-widest text-[#C5A55A] uppercase mb-2">
                    Disponibilidad Actual
                  </label>
                  <button
                    type="button"
                    disabled={form.catalogoActivo === false}
                    onClick={() => setForm({ ...form, disponible: !form.disponible })}
                    className={`relative w-12 h-6 transition-colors duration-300 rounded-full ${
                      form.catalogoActivo === false
                        ? "bg-zinc-800 opacity-50 cursor-not-allowed"
                        : form.disponible
                        ? "bg-[#C5A55A]"
                        : "bg-amber-700"
                    }`}
                  >
                    <span
                      className={`absolute top-1 h-4 w-4 rounded-full transition-all duration-300 ${
                        form.disponible ? "left-7 bg-black" : "left-1 bg-white"
                      }`}
                    />
                  </button>
                  <span className="ml-3 text-xs text-zinc-300 font-medium">
                    {form.catalogoActivo === false
                      ? "Inactiva (Baja)"
                      : form.disponible
                      ? "Disponible"
                      : "En Servicio (Ocupada)"}
                  </span>
                </div>
              </div>

              {/* Servicios Extra */}
              <div className="border-t border-zinc-800 pt-5 space-y-4">
                <div>
                  <label className="block text-[10px] font-bold tracking-widest text-[#C5A55A] uppercase mb-1">
                    Servicios Extra Rápidos (Clic para agregar o quitar)
                  </label>
                  <p className="text-[11px] text-zinc-400 font-light mb-2.5">
                    Selecciona de la lista predefinida para agregarlo a la modelo. Puedes modificar el costo individualmente abajo.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {PREDEFINED_EXTRAS.map((item, idx) => {
                      const selected = (form.extras || []).some(
                        (e) => e.nombre.toLowerCase().trim() === item.nombre.toLowerCase().trim()
                      );
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => togglePredefinedExtra(item)}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-300 border flex items-center gap-1.5 ${
                            selected
                              ? "bg-[#C5A55A]/20 border-[#C5A55A] text-[#E8D5A3] shadow-sm"
                              : "bg-zinc-900/80 border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"
                          }`}
                        >
                          <span>{selected ? "✓" : "+"}</span>
                          <span>{item.nombre}</span>
                          <span className="text-[10px] opacity-70">(${item.precio})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Lista de extras agregados */}
                {form.extras && form.extras.length > 0 ? (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1 border border-zinc-800/80 p-2.5 rounded bg-black/40">
                    <div className="text-[10px] font-bold tracking-widest text-zinc-400 uppercase mb-2 px-1">
                      Servicios asignados a esta modelo ({form.extras.length})
                    </div>
                    {form.extras.map((extra, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between bg-zinc-950 border border-zinc-800 px-3 py-2 rounded text-xs gap-3"
                      >
                        <div className="font-semibold text-white truncate flex-1">{extra.nombre}</div>
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500 text-[11px]">$</span>
                          <input
                            type="number"
                            value={extra.precio}
                            onChange={(e) => updateExtraPrecio(idx, parseFloat(e.target.value) || 0)}
                            min={0}
                            className="w-20 bg-zinc-900 border border-zinc-700 px-2 py-1 text-right text-white font-mono rounded text-xs focus:border-[#C5A55A]"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeExtra(idx)}
                          className="text-zinc-500 hover:text-red-400 font-bold uppercase tracking-wider text-[10px] transition-colors ml-1"
                        >
                          Quitar
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500 font-light italic">
                    No hay servicios extra asignados. Clic arriba para agregar uno o usa el campo personalizado abajo.
                  </p>
                )}

                {/* Inputs para agregar personalizado */}
                <div className="pt-2">
                  <span className="block text-[10px] font-bold tracking-widest text-zinc-500 uppercase mb-2">
                    ¿Otro servicio no en la lista? Agrégalo aquí
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                    <div className="sm:col-span-2 space-y-1">
                      <input
                        type="text"
                        value={newExtraNombre}
                        onChange={(e) => setNewExtraNombre(e.target.value)}
                        placeholder="Nombre del servicio personalizado..."
                        className={inputClass}
                      />
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={newExtraPrecio}
                        onChange={(e) => setNewExtraPrecio(e.target.value)}
                        placeholder="Costo"
                        min="0"
                        className={`${inputClass} w-full`}
                      />
                      <button
                        type="button"
                        onClick={addExtra}
                        className="bg-zinc-900 border border-[#C5A55A] hover:bg-[#C5A55A] hover:text-black text-white font-bold text-xs uppercase px-4 py-3 transition-all duration-300 flex-shrink-0"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Columna Derecha: Fotos */}
            <div className="space-y-6 border-t lg:border-t-0 lg:border-l border-zinc-800 pt-6 lg:pt-0 lg:pl-8">
              {/* Foto Principal */}
              <div>
                <label className="block text-[10px] font-bold tracking-widest text-[#C5A55A] uppercase mb-2">
                  Foto Principal *
                </label>
                <div className="flex gap-4 items-start">
                  <div className="w-28 h-36 bg-zinc-900 border border-zinc-800 relative flex-shrink-0 flex items-center justify-center overflow-hidden">
                    {fotoPrincipalPreview ? (
                      <Image src={fotoPrincipalPreview} alt="Principal" fill className="object-cover" unoptimized />
                    ) : (
                      <span className="text-[10px] text-zinc-600 font-bold uppercase">Vacia</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="relative overflow-hidden inline-block">
                      <button type="button" className="bg-zinc-900 border border-zinc-700 hover:border-[#C5A55A] text-xs font-semibold px-4 py-2 uppercase tracking-wider transition-colors disabled:opacity-50">
                        Cambiar Foto
                      </button>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={saving}
                        onChange={handleUploadPrincipal}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </div>
                    <p className="text-xs text-zinc-500 mt-2">
                      Esta foto se muestra en el catalogo y como la primera de la galeria. Recomendado: formato vertical.
                    </p>
                  </div>
                </div>
              </div>

              {/* Galeria (Max 5) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[10px] font-bold tracking-widest text-[#C5A55A] uppercase">
                    Galeria ({galleryItems.length}/5)
                  </label>
                  {galleryItems.length < 5 && (
                    <div className="relative overflow-hidden">
                      <button type="button" className="text-[10px] text-white hover:text-[#C5A55A] font-bold uppercase tracking-wider transition-colors disabled:opacity-50">
                        + Anadir Fotos
                      </button>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        disabled={saving || galleryItems.length >= 5}
                        onChange={handleUploadGaleria}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </div>
                  )}
                </div>

                {galleryItems.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    <AnimatePresence>
                      {galleryItems.map((item, i) => {
                        const src = item.type === "url" ? item.url! : item.preview!;
                        return (
                          <motion.div
                            key={item.id}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            className="aspect-[3/4] relative border border-zinc-800 group"
                          >
                            <Image src={src} alt={`Galeria ${i}`} fill className="object-cover" unoptimized />
                            <button
                              type="button"
                              onClick={() => removeFotoGaleria(i)}
                              className="absolute top-1 right-1 bg-black/80 text-white p-1 rounded hover:bg-red-900/80 transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                ) : (
                  <div className="border border-dashed border-zinc-800 p-6 text-center">
                    <p className="text-xs text-zinc-500">Sin fotos adicionales en la galeria.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-4 pt-8 mt-8 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={saving || uploading}
              className="flex-1 border border-zinc-800 text-zinc-400 font-bold text-xs tracking-[0.2em] uppercase py-4 hover:border-zinc-600 hover:text-white transition-all duration-300 disabled:opacity-40 bg-zinc-900/50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || uploading}
              className="flex-1 bg-[#C5A55A] text-black font-black text-xs tracking-[0.2em] uppercase py-4 hover:bg-[#D4AF37] transition-colors duration-300 disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Guardar Perfil"}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}