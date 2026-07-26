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
          precioBaseHora: 100,
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
        const formData = new FormData();
        for (const file of filesToUpload) {
          const compressed = await compressImage(file);
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
                  placeholder="Ej: 100"
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

              <div className="flex items-center gap-6">
                <div className="flex-1">
                  <label className="block text-[10px] font-bold tracking-widest text-[#C5A55A] uppercase mb-2">
                    Visibilidad
                  </label>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, disponible: !form.disponible })}
                    className={`relative w-12 h-6 transition-colors duration-300 rounded-full ${
                      form.disponible ? "bg-[#C5A55A]" : "bg-zinc-800"
                    }`}
                  >
                    <span
                      className={`absolute top-1 h-4 w-4 rounded-full transition-all duration-300 ${
                        form.disponible ? "left-7 bg-black" : "left-1 bg-zinc-500"
                      }`}
                    />
                  </button>
                  <span className="ml-3 text-xs text-zinc-400">
                    {form.disponible ? "Visible en catalogo" : "Oculta"}
                  </span>
                </div>
              </div>

              {/* Servicios Extra */}
              <div className="border-t border-zinc-800 pt-5 space-y-4">
                <label className="block text-[10px] font-bold tracking-widest text-[#C5A55A] uppercase">
                  Servicios Extra
                </label>
                
                {/* Inputs para agregar nuevo */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div className="sm:col-span-2 space-y-1">
                    <span className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase">
                      Nombre del Servicio
                    </span>
                    <input
                      type="text"
                      value={newExtraNombre}
                      onChange={(e) => setNewExtraNombre(e.target.value)}
                      placeholder="Ej: Masaje Terapeutico"
                      className={inputClass}
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase">
                      Precio (MXN)
                    </span>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={newExtraPrecio}
                        onChange={(e) => setNewExtraPrecio(e.target.value)}
                        placeholder="Ej: 50"
                        min="0"
                        className={inputClass}
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

                {/* Lista de extras agregados */}
                {form.extras && form.extras.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {form.extras.map((extra, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between bg-zinc-950 border border-zinc-900 px-4 py-3 text-xs"
                      >
                        <div className="flex items-center gap-4">
                          <span className="font-semibold text-white">{extra.nombre}</span>
                          <span className="text-zinc-500 font-mono">${extra.precio}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeExtra(idx)}
                          className="text-zinc-500 hover:text-red-500 font-semibold uppercase tracking-wider transition-colors"
                        >
                          Eliminar
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-600 font-light italic">
                    No se han configurado servicios extra.
                  </p>
                )}
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