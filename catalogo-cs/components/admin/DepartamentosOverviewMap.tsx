"use client";

import { useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import { Building2, MapPin, Users, ExternalLink } from "lucide-react";
import type { Apartment } from "@/lib/actions/apartments";

interface DepartamentosOverviewMapProps {
  departments: Apartment[];
  onSelectDepartment?: (dept: Apartment) => void;
}

const apartmentMarkerIcon = L.divIcon({
  html: `
    <div style="position: relative; width: 34px; height: 34px; transform: translate(-50%, -100%);">
      <div style="
        background: #000000;
        width: 34px;
        height: 34px;
        border-radius: 999px 999px 0 999px;
        transform: rotate(45deg);
        border: 2.5px solid #C5A55A;
        box-shadow: 0 4px 14px rgba(197, 165, 90, 0.5), 0 2px 6px rgba(0,0,0,0.8);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="width: 14px; height: 14px; background: #C5A55A; border-radius: 999px; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center;">
          <div style="width: 6px; height: 6px; background: #000000; border-radius: 999px;"></div>
        </div>
      </div>
    </div>
  `,
  className: "",
  iconSize: [34, 34],
  iconAnchor: [17, 34],
});

export default function DepartamentosOverviewMap({
  departments,
  onSelectDepartment,
}: DepartamentosOverviewMapProps) {
  const deptsWithCoords = useMemo(() => {
    return departments.filter(
      (d) =>
        d.ubicacionLat !== null &&
        d.ubicacionLng !== null &&
        !Number.isNaN(Number(d.ubicacionLat)) &&
        !Number.isNaN(Number(d.ubicacionLng)),
    );
  }, [departments]);

  const defaultCenter: [number, number] = useMemo(() => {
    if (deptsWithCoords.length > 0) {
      return [Number(deptsWithCoords[0].ubicacionLat), Number(deptsWithCoords[0].ubicacionLng)];
    }
    return [19.4326, -99.1332];
  }, [deptsWithCoords]);

  return (
    <div className="relative h-[550px] w-full rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl bg-zinc-950">
      <MapContainer
        center={defaultCenter}
        zoom={12}
        style={{ width: "100%", height: "100%" }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {deptsWithCoords.map((dept) => {
          const lat = Number(dept.ubicacionLat);
          const lng = Number(dept.ubicacionLng);
          const modelos = dept.empleadas || [];

          return (
            <Marker
              key={dept.id}
              position={[lat, lng]}
              icon={apartmentMarkerIcon}
              eventHandlers={{
                click: () => onSelectDepartment?.(dept),
              }}
            >
              <Popup className="custom-popup">
                <div className="p-2 text-zinc-900 min-w-[200px]">
                  <div className="flex items-center gap-1.5 font-bold text-sm text-[#8c6d23] pb-1 border-b border-zinc-200">
                    <Building2 className="h-4 w-4" />
                    <span>{dept.nombre}</span>
                  </div>

                  {dept.direccion && (
                    <p className="text-xs text-zinc-600 mt-1.5 flex items-start gap-1">
                      <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-zinc-400" />
                      <span>{dept.direccion}</span>
                    </p>
                  )}

                  {dept.descripcion && (
                    <p className="text-[11px] text-zinc-500 italic mt-1 bg-zinc-100 p-1 rounded">
                      {dept.descripcion}
                    </p>
                  )}

                  <div className="mt-2 pt-1.5 border-t border-zinc-100 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1 font-semibold text-zinc-700">
                      <Users className="h-3 w-3 text-purple-600" />
                      {modelos.length} {modelos.length === 1 ? "modelo" : "modelos"}
                    </span>

                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-bold text-[#8c6d23] hover:underline flex items-center gap-0.5"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Ver mapa
                    </a>
                  </div>

                  {modelos.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {modelos.map((m) => (
                        <span
                          key={m.id}
                          className="inline-block px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 text-[10px] font-medium"
                        >
                          {m.nombreArtistico}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Floating Info Badge */}
      <div className="absolute bottom-3 left-3 z-[1000] bg-black/85 backdrop-blur-md border border-zinc-800 px-3 py-1.5 rounded-xl text-xs text-zinc-300 shadow-xl flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-[#C5A55A] animate-pulse" />
        <span>{deptsWithCoords.length} departamentos con ubicación en el mapa</span>
      </div>
    </div>
  );
}
