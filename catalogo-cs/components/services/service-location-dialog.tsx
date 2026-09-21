"use client";

import { useEffect, useState } from "react";
import { Building2, Check, Loader2, MapPin, X } from "lucide-react";
import { toast } from "sonner";

import {
  changeServiceLocationAction,
  getActiveLocationsAction,
} from "@/lib/data/services";
import type { PresetServiceLocation } from "@/lib/types";
import LocationPickerMapDynamic from "@/components/admin/LocationPickerMapDynamic";

type Pestana = "registrados" | "direccion";

/**
 * Cambiar el lugar de un servicio.
 *
 * Antes solo se podia reescribir el texto de las notas, que no mueve nada: el
 * servicio seguia apuntando a las coordenadas viejas y el chofer salia hacia
 * el punto anterior. Aqui se elige de verdad el destino, y son las coordenadas
 * lo que se guarda.
 *
 * Dos caminos, porque son los dos que ocurren en la operacion: un motel de la
 * casa --que no le cuesta transporte al cliente y ya tiene su punto exacto
 * registrado-- o la direccion del cliente, que se busca en el mapa igual que
 * en los departamentos.
 */
export default function ServiceLocationDialog({
  serviceId,
  ubicacionActual,
  latitudActual,
  longitudActual,
  presetLocationIdActual,
  onClose,
  onChanged,
}: {
  serviceId: string;
  /** Lo que hoy tiene el servicio, para que se vea de dónde se está moviendo. */
  ubicacionActual: string | null;
  latitudActual: number | null;
  longitudActual: number | null;
  presetLocationIdActual: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [pestana, setPestana] = useState<Pestana>(
    presetLocationIdActual ? "registrados" : "direccion",
  );
  const [lugares, setLugares] = useState<PresetServiceLocation[] | null>(null);
  const [elegido, setElegido] = useState<string | null>(presetLocationIdActual);

  // El centro de Querétaro como punto de partida cuando el servicio no traía uno.
  const [latitud, setLatitud] = useState<number>(latitudActual ?? 20.5888);
  const [longitud, setLongitud] = useState<number>(longitudActual ?? -100.3899);
  const [direccion, setDireccion] = useState<string>(
    presetLocationIdActual ? "" : (ubicacionActual ?? ""),
  );

  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vigente = true;
    getActiveLocationsAction()
      .then((resultado) => {
        if (!vigente) return;
        setLugares(resultado.success ? (resultado.data ?? []) : []);
        if (!resultado.success) {
          toast.error(resultado.error || "No se pudo cargar la lista de lugares");
        }
      })
      .catch(() => vigente && setLugares([]));
    return () => {
      vigente = false;
    };
  }, []);

  const guardar = async () => {
    if (pestana === "registrados" && !elegido) {
      toast.error("Elige uno de los lugares registrados");
      return;
    }
    if (pestana === "direccion" && !direccion.trim()) {
      toast.error("Busca la dirección en el mapa o marca el punto");
      return;
    }

    setGuardando(true);
    const resultado = await changeServiceLocationAction(
      serviceId,
      pestana === "registrados"
        ? { presetLocationId: elegido! }
        : { latitud, longitud, direccion: direccion.trim().slice(0, 240) },
    );
    setGuardando(false);

    if (!resultado.success) {
      toast.error(resultado.error || "No se pudo cambiar la ubicación");
      return;
    }

    toast.success("Ubicación actualizada");
    onChanged();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-sm sm:items-center"
      onMouseDown={(event) =>
        event.target === event.currentTarget && !guardando && onClose()
      }
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="ubicacion-titulo"
        className="my-4 w-full max-w-2xl rounded-2xl border border-[#C5A55A]/40 bg-[#050505] p-5 shadow-2xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#C5A55A]">
              Cambiar ubicación
            </p>
            <h2 id="ubicacion-titulo" className="mt-1 font-heading text-3xl">
              ¿Dónde será?
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            aria-label="Cerrar"
            className="rounded-lg border border-zinc-800 p-2 text-zinc-500 transition-colors hover:text-white disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {ubicacionActual && (
          <p className="mt-5 rounded-xl border border-zinc-800 bg-black p-4 text-sm text-zinc-400">
            Ahora está en{" "}
            <span className="text-[#E8D5A3]">{ubicacionActual}</span>.
          </p>
        )}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setPestana("registrados")}
            className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-bold transition-all ${
              pestana === "registrados"
                ? "border-[#C5A55A] bg-[#C5A55A] text-zinc-950"
                : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700"
            }`}
          >
            <Building2 size={13} />
            Lugares registrados
          </button>
          <button
            type="button"
            onClick={() => setPestana("direccion")}
            className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-bold transition-all ${
              pestana === "direccion"
                ? "border-[#C5A55A] bg-[#C5A55A] text-zinc-950"
                : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700"
            }`}
          >
            <MapPin size={13} />
            Dirección
          </button>
        </div>

        {pestana === "registrados" ? (
          <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
            {lugares === null && (
              <p className="flex items-center gap-2 py-6 text-sm text-zinc-500">
                <Loader2 size={14} className="animate-spin text-[#C5A55A]" />
                Cargando los lugares...
              </p>
            )}

            {lugares?.length === 0 && (
              <p className="rounded-xl border border-zinc-800 bg-black p-4 text-sm text-zinc-500">
                No hay ningún lugar registrado y activo. Se dan de alta en
                Transporte, en la configuración.
              </p>
            )}

            {lugares?.map((lugar) => (
              <button
                key={lugar.id}
                type="button"
                onClick={() => setElegido(lugar.id)}
                className={`flex w-full items-start justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                  elegido === lugar.id
                    ? "border-[#C5A55A] bg-[#C5A55A]/10"
                    : "border-zinc-800 bg-black hover:border-zinc-700"
                }`}
              >
                <span>
                  <span className="block text-sm font-semibold text-white">
                    {lugar.name}
                  </span>
                  {lugar.address && (
                    <span className="mt-0.5 block text-xs text-zinc-500">
                      {lugar.address}
                    </span>
                  )}
                </span>
                {elegido === lugar.id && (
                  <Check size={16} className="mt-0.5 shrink-0 text-[#C5A55A]" />
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C5A55A]">
                Dirección
              </span>
              <input
                value={direccion}
                onChange={(event) => setDireccion(event.target.value)}
                maxLength={240}
                placeholder="Busca en el mapa o escríbela aquí"
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-[#C5A55A]"
              />
            </label>

            <LocationPickerMapDynamic
              latitude={latitud}
              longitude={longitud}
              onChange={(nuevaLat, nuevaLng, direccionFormateada) => {
                setLatitud(nuevaLat);
                setLongitud(nuevaLng);
                if (direccionFormateada) setDireccion(direccionFormateada);
              }}
              address={direccion}
              onAddressChange={setDireccion}
              heightClass="h-72"
            />

            <p className="text-xs text-zinc-600">
              Busca la dirección arriba o marca el punto exacto en el mapa.{" "}
              {latitud.toFixed(6)}, {longitud.toFixed(6)}
            </p>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3 pb-[env(safe-area-inset-bottom)]">
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            className="rounded-xl border border-zinc-800 px-5 py-3 text-sm text-zinc-400 transition-colors hover:text-white disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            aria-busy={guardando}
            className="inline-flex items-center gap-2 rounded-xl bg-[#C5A55A] px-5 py-3 text-xs font-bold uppercase tracking-wider text-black transition-opacity disabled:opacity-50"
          >
            {guardando && <Loader2 size={14} className="animate-spin" />}
            Guardar la ubicación
          </button>
        </div>
      </section>
    </div>
  );
}
