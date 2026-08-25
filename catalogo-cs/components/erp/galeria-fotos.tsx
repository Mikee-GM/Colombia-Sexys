"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import imageCompression from "browser-image-compression";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Lock,
  Trash2,
  Upload,
  Globe,
} from "lucide-react";
import { toast } from "sonner";

import { Panel, StatusBadge } from "@/components/erp/primitives";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import {
  addGalleryPhotoAction,
  deleteGalleryPhotoAction,
  getGalleryAction,
  movePhotoAction,
  reorderGalleryAction,
  type PhotoGallery,
} from "@/lib/actions/modelos";
import { uploadImagesAction } from "@/lib/actions/upload";

type Foto = { id: string; url: string; orden: number };

const ETIQUETA: Record<PhotoGallery, string> = {
  publica: "Publicas",
  exclusiva: "Exclusivas",
};

const DESCRIPCION: Record<PhotoGallery, string> = {
  publica: "Se muestran en el catalogo de la web",
  exclusiva: "Se envian por Telegram solo a clientes con membresia",
};

/**
 * Galeria de fotos de una modelo: ver, subir, reordenar, mover y borrar.
 *
 * Existe una sola y se monta igual en el expediente del ERP y en el panel del
 * jefe. Antes cada pantalla hacia una parte del trabajo -- unas dejaban ver y
 * otras borrar -- asi que dependia de por donde entraras lo que podias hacer.
 */
export default function GaleriaFotos({
  empleadaId,
  nombre,
  galeriaInicialPublica,
  galeriaInicialExclusiva,
  compact = false,
}: {
  empleadaId: string;
  nombre: string;
  galeriaInicialPublica?: Foto[];
  galeriaInicialExclusiva?: Foto[];
  /** En el panel del jefe la galeria va dentro de un modal mas estrecho. */
  compact?: boolean;
}) {
  const [activa, setActiva] = useState<PhotoGallery>("publica");
  const [publicas, setPublicas] = useState<Foto[]>(galeriaInicialPublica ?? []);
  const [exclusivas, setExclusivas] = useState<Foto[]>(
    galeriaInicialExclusiva ?? [],
  );
  const [cargando, setCargando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [porBorrar, setPorBorrar] = useState<Foto | null>(null);
  const [pending, startTransition] = useTransition();

  const fotos = activa === "publica" ? publicas : exclusivas;
  const setFotos = activa === "publica" ? setPublicas : setExclusivas;
  const ocupado = pending || subiendo || cargando;

  /* Sin datos iniciales la galeria se pide al abrir; con ellos, no hay ida y vuelta. */
  useEffect(() => {
    const yaTengo =
      activa === "publica"
        ? galeriaInicialPublica !== undefined
        : galeriaInicialExclusiva !== undefined;
    if (yaTengo) return;

    let vigente = true;
    setCargando(true);
    getGalleryAction(empleadaId, activa)
      .then((data) => {
        if (!vigente) return;
        if (activa === "publica") setPublicas(data);
        else setExclusivas(data);
      })
      .catch(() => toast.error("No se pudieron cargar las fotos"))
      .finally(() => vigente && setCargando(false));

    return () => {
      vigente = false;
    };
  }, [empleadaId, activa, galeriaInicialPublica, galeriaInicialExclusiva]);

  const recargar = async (gallery: PhotoGallery) => {
    const data = await getGalleryAction(empleadaId, gallery);
    if (gallery === "publica") setPublicas(data);
    else setExclusivas(data);
  };

  const subir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setSubiendo(true);
      const comprimida = await imageCompression(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 1080,
        useWebWorker: true,
      });
      const formData = new FormData();
      formData.append("files", comprimida);
      const [url] = await uploadImagesAction(formData);
      await addGalleryPhotoAction(empleadaId, activa, url, fotos.length);
      await recargar(activa);
      toast.success("Foto agregada");
    } catch (err: any) {
      toast.error(err.message || "No se pudo subir la foto");
    } finally {
      setSubiendo(false);
      e.target.value = "";
    }
  };

  const borrar = (foto: Foto) => {
    startTransition(async () => {
      try {
        await deleteGalleryPhotoAction(foto.id, activa);
        setFotos((prev) => prev.filter((item) => item.id !== foto.id));
        setPorBorrar(null);
        toast.success("Foto borrada");
      } catch (err: any) {
        toast.error(err.message || "No se pudo borrar la foto");
      }
    });
  };

  /* El orden se manda entero: mover una foto recoloca a todas las demas. */
  const mover = (index: number, direccion: -1 | 1) => {
    const destino = index + direccion;
    if (destino < 0 || destino >= fotos.length) return;

    const siguiente = [...fotos];
    [siguiente[index], siguiente[destino]] = [
      siguiente[destino],
      siguiente[index],
    ];
    setFotos(siguiente);

    startTransition(async () => {
      try {
        await reorderGalleryAction(
          empleadaId,
          activa,
          siguiente.map((foto) => foto.id),
        );
      } catch (err: any) {
        toast.error(err.message || "No se pudo guardar el orden");
        await recargar(activa);
      }
    });
  };

  const cambiarGaleria = (foto: Foto) => {
    const destino: PhotoGallery =
      activa === "publica" ? "exclusiva" : "publica";

    startTransition(async () => {
      try {
        await movePhotoAction(foto.id, activa, destino);
        await Promise.all([recargar("publica"), recargar("exclusiva")]);
        toast.success(
          destino === "exclusiva"
            ? "Foto movida a exclusivas"
            : "Foto publicada en el catalogo",
        );
      } catch (err: any) {
        toast.error(err.message || "No se pudo mover la foto");
      }
    });
  };

  return (
    <>
      {porBorrar && (
        <ConfirmDialog
          title={`Borrar una foto de ${nombre}`}
          description={
            activa === "publica"
              ? "Sale del catalogo publico y se borra el archivo. No se puede deshacer."
              : "Sale de las fotos exclusivas y se borra el archivo. No se puede deshacer."
          }
          labelConfirm="Si, borrar"
          onConfirm={() => borrar(porBorrar)}
          onCancel={() => setPorBorrar(null)}
        />
      )}

      <Panel
        title="Fotos"
        subtitle="empleada_fotos y empleada_fotos_exclusivas"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {(["publica", "exclusiva"] as const).map((gallery) => (
              <button
                key={gallery}
                type="button"
                onClick={() => setActiva(gallery)}
                className={`rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.04em] transition-colors ${
                  activa === gallery
                    ? "bg-[#C5A55A] text-black"
                    : "border border-zinc-800 text-zinc-400 hover:text-white"
                }`}
              >
                {ETIQUETA[gallery]} (
                {gallery === "publica" ? publicas.length : exclusivas.length})
              </button>
            ))}

            <label
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#C5A55A]/40 bg-[#C5A55A]/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.04em] text-[#C5A55A] transition-colors hover:bg-[#C5A55A]/20 ${
                ocupado ? "pointer-events-none opacity-50" : ""
              }`}
            >
              <Upload className="h-3 w-3" />
              {subiendo ? "Subiendo" : "Agregar"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={ocupado}
                onChange={subir}
              />
            </label>
          </div>
        }
      >
        <p className="mb-4 text-[11px] text-zinc-500">
          {DESCRIPCION[activa]}. El orden de esta lista es el que ve el cliente.
        </p>

        {cargando ? (
          <p className="py-8 text-center text-sm text-zinc-500">
            Cargando fotos...
          </p>
        ) : fotos.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">
            {activa === "publica"
              ? "Esta modelo no tiene fotos en el catalogo."
              : "Esta modelo no tiene fotos exclusivas."}
          </p>
        ) : (
          <div
            className={`grid gap-4 ${
              compact
                ? "grid-cols-2 sm:grid-cols-3"
                : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-5"
            }`}
          >
            {fotos.map((foto, index) => (
              <div key={foto.id} className="flex flex-col gap-2">
                <div className="relative aspect-3/4 overflow-hidden rounded-xl border border-zinc-800 bg-black">
                  <Image
                    src={foto.url}
                    alt={`Foto ${index + 1} de ${nombre}`}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1280px) 33vw, 20vw"
                    className="object-cover"
                    unoptimized
                  />

                  <div className="absolute left-2 top-2">
                    <StatusBadge tone={activa === "publica" ? "green" : "gold"}>
                      {index + 1}
                    </StatusBadge>
                  </div>

                  <a
                    href={foto.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute right-2 top-2 rounded-lg border border-zinc-700 bg-black/80 p-1.5 text-zinc-300 transition-colors hover:text-white"
                    title="Ver en tamano completo"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    disabled={ocupado || index === 0}
                    onClick={() => mover(index, -1)}
                    className="flex items-center justify-center rounded-[9px] border border-zinc-800 py-1.5 text-zinc-400 transition-colors hover:text-white disabled:opacity-30"
                    title="Mover antes"
                  >
                    <ArrowLeft className="h-3 w-3" />
                  </button>

                  <button
                    type="button"
                    disabled={ocupado || index === fotos.length - 1}
                    onClick={() => mover(index, 1)}
                    className="flex items-center justify-center rounded-[9px] border border-zinc-800 py-1.5 text-zinc-400 transition-colors hover:text-white disabled:opacity-30"
                    title="Mover despues"
                  >
                    <ArrowRight className="h-3 w-3" />
                  </button>

                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => cambiarGaleria(foto)}
                    className="col-span-2 flex min-w-0 items-center justify-center gap-1 rounded-[9px] border border-[#C5A55A]/30 bg-[#C5A55A]/[0.08] px-1.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.04em] text-[#C5A55A] transition-colors hover:bg-[#C5A55A]/20 disabled:opacity-50"
                  >
                    {activa === "publica" ? (
                      <Lock className="h-3 w-3 shrink-0" />
                    ) : (
                      <Globe className="h-3 w-3 shrink-0" />
                    )}
                    <span className="truncate">
                      {activa === "publica" ? "A exclusiva" : "A publica"}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => setPorBorrar(foto)}
                    className="col-span-2 flex min-w-0 items-center justify-center gap-1 rounded-[9px] border border-red-400/25 bg-red-400/[0.08] px-1.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.04em] text-red-400 transition-colors hover:bg-red-400/20 disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3 shrink-0" />
                    <span className="truncate">Borrar</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
