"use client";

import type { Driver, Employee } from "@/lib/types";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useState, useMemo } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { Search, X, Users, Car, MapPin, Eye, Filter } from "lucide-react";

type Props = {
  employees: Employee[];
  drivers: Driver[];
};

function toPosition(lat?: string | null, lng?: string | null) {
  if (!lat || !lng) return null;

  const position: [number, number] = [Number(lat), Number(lng)];

  if (Number.isNaN(position[0]) || Number.isNaN(position[1])) {
    return null;
  }

  return position;
}

// Componente auxiliar para animar el mapa cuando se selecciona un usuario
function MapFlyTo({ position, zoom }: { position: [number, number] | null; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.flyTo(position, zoom ?? 15, { duration: 1.2 });
    }
  }, [position, zoom, map]);
  return null;
}

function MapResizeObserver() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    let frame: number | null = null;
    const resize = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = null;
        if (container.clientWidth && container.clientHeight) {
          map.invalidateSize({ pan: false });
        }
      });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [map]);

  return null;
}

export default function LiveMap({ employees, drivers }: Props) {
  const [localDrivers, setLocalDrivers] = useState<Driver[]>(drivers);
  const [localEmployees, setLocalEmployees] = useState<Employee[]>(employees);

  // Filtros y selección
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "employees" | "drivers">("all");
  const [selectedUser, setSelectedUser] = useState<{
    id: string;
    type: "employee" | "driver";
    name: string;
    position: [number, number] | null;
  } | null>(null);

  const [initialCenter] = useState<[number, number]>(() => {
    const dMarkers = drivers
      .map((driver) => ({
        ...driver,
        position: toPosition(driver.ubicacionLat, driver.ubicacionLng),
      }))
      .filter(
        (driver): driver is typeof driver & { position: [number, number] } =>
          Boolean(driver.position),
      );

    const eMarkers = employees
      .map((employee) => ({
        ...employee,
        position: toPosition(employee.ubicacionLat, employee.ubicacionLng),
      }))
      .filter(
        (employee): employee is typeof employee & { position: [number, number] } =>
          Boolean(employee.position),
      );

    return (
      dMarkers[0]?.position ??
      eMarkers[0]?.position ??
      [20.5235, -100.8157]
    );
  });

  useEffect(() => {
    setLocalDrivers(drivers);
  }, [drivers]);

  useEffect(() => {
    setLocalEmployees(employees);
  }, [employees]);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      eventSource = new EventSource("/api/realtime/sse", {
        withCredentials: true,
      });

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "DRIVER_LOCATION_UPDATE" && payload.choferId) {
            setLocalDrivers((prev) =>
              prev.map((d) =>
                d.id === payload.choferId
                  ? { ...d, ubicacionLat: payload.lat, ubicacionLng: payload.lng }
                  : d,
              ),
            );
          } else if (payload.type === "EMPLOYEE_LOCATION_UPDATE" && payload.empleadaId) {
            setLocalEmployees((prev) =>
              prev.map((e) =>
                e.id === payload.empleadaId
                  ? { ...e, ubicacionLat: payload.lat, ubicacionLng: payload.lng }
                  : e,
              ),
            );
          }
        } catch {
          /* Ignorar errores de parseo puntuales */
        }
      };

      eventSource.onerror = () => {
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        if (!reconnectTimer) {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connect();
          }, 3000);
        }
      };
    }

    connect();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (eventSource) eventSource.close();
    };
  }, []);

  const createCustomIcon = (color: string, isHighlighted: boolean, isDimmed: boolean) => {
    const size = isHighlighted ? 26 : 18;
    const pulse = isHighlighted
      ? `<div style="position:absolute;inset:-8px;border-radius:999px;background:${color};opacity:0.4;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>`
      : "";
    const opacity = isDimmed ? 0.25 : 1;
    return L.divIcon({
      html: `
      <div style="position:relative;width:${size}px;height:${size}px;opacity:${opacity};transition:all 0.3s;">
        ${pulse}
        <div style="
          background:${color};
          width:${size}px;
          height:${size}px;
          border-radius:999px;
          border:${isHighlighted ? "3px solid #ffffff" : "2px solid #ffffff"};
          box-shadow:${isHighlighted ? "0 0 16px " + color : "0 2px 6px rgba(0,0,0,0.5)"};
          display:flex;
          align-items:center;
          justify-content:center;
        ">
        </div>
      </div>
      `,
      className: "",
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  };

  const driverMarkers = useMemo(
    () =>
      localDrivers
        .map((driver) => ({
          ...driver,
          position: toPosition(driver.ubicacionLat, driver.ubicacionLng),
        }))
        .filter(
          (driver): driver is typeof driver & { position: [number, number] } =>
            Boolean(driver.position),
        ),
    [localDrivers],
  );

  const employeeMarkers = useMemo(
    () =>
      localEmployees
        .map((employee) => ({
          ...employee,
          position: toPosition(employee.ubicacionLat, employee.ubicacionLng),
        }))
        .filter(
          (employee): employee is typeof employee & { position: [number, number] } =>
            Boolean(employee.position),
        ),
    [localEmployees],
  );

  // Lista unificada para el buscador lateral
  const allUsersList = useMemo(() => {
    const list: Array<{
      id: string;
      type: "employee" | "driver";
      name: string;
      subtext: string;
      hasLocation: boolean;
      position: [number, number] | null;
      disponible: boolean;
    }> = [];

    if (typeFilter === "all" || typeFilter === "employees") {
      localEmployees.forEach((emp) => {
        const pos = toPosition(emp.ubicacionLat, emp.ubicacionLng);
        list.push({
          id: emp.id,
          type: "employee",
          name: emp.nombreArtistico || emp.nombreReal || "Empleada",
          subtext: emp.disponible ? "Disponible" : "Ocupada / Inactiva",
          hasLocation: Boolean(pos),
          position: pos,
          disponible: emp.disponible,
        });
      });
    }

    if (typeFilter === "all" || typeFilter === "drivers") {
      localDrivers.forEach((drv) => {
        const pos = toPosition(drv.ubicacionLat, drv.ubicacionLng);
        list.push({
          id: drv.id,
          type: "driver",
          name: drv.nombre || "Chofer",
          subtext: drv.telefono || (drv.disponible ? "Disponible" : "No disponible"),
          hasLocation: Boolean(pos),
          position: pos,
          disponible: drv.disponible,
        });
      });
    }

    const q = searchQuery.trim().toLowerCase();
    return list.filter((item) => {
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.subtext.toLowerCase().includes(q)
      );
    });
  }, [localEmployees, localDrivers, typeFilter, searchQuery]);

  // Selección de usuario
  const handleSelectUser = (user: typeof allUsersList[0]) => {
    if (selectedUser?.id === user.id) {
      setSelectedUser(null);
    } else {
      setSelectedUser({
        id: user.id,
        type: user.type,
        name: user.name,
        position: user.position,
      });
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-zinc-800 bg-[#080808] p-3 shadow-2xl lg:h-[620px] lg:flex-row lg:gap-4 lg:overflow-hidden">
      {/* Panel Lateral de Búsqueda y Selección */}
      <div className="flex min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-3 lg:w-80">
        {/* Encabezado del selector */}
        <div className="flex items-center justify-between pb-2 border-b border-zinc-800/60">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-[#C5A55A]" />
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
              Filtrar en Mapa
            </span>
          </div>
          {selectedUser && (
            <button
              type="button"
              onClick={() => setSelectedUser(null)}
              className="flex min-h-11 items-center gap-1 text-[11px] font-semibold text-[#C5A55A] transition-colors hover:text-[#E8D5A3]"
            >
              <Eye className="h-3 w-3" />
              Ver todos
            </button>
          )}
        </div>

        {/* Pestañas de tipo */}
        <div className="mt-2.5 flex gap-1 rounded-lg bg-zinc-900/90 p-1 text-xs">
          <button
            type="button"
            onClick={() => setTypeFilter("all")}
            aria-pressed={typeFilter === "all"}
            className={`min-h-11 flex-1 rounded-md py-1 font-semibold transition-all ${
              typeFilter === "all"
                ? "bg-[#C5A55A] text-black font-bold shadow"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Todos
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter("employees")}
            aria-pressed={typeFilter === "employees"}
            className={`min-h-11 flex-1 rounded-md py-1 font-semibold transition-all ${
              typeFilter === "employees"
                ? "bg-[#C5A55A] text-black font-bold shadow"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Empleadas
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter("drivers")}
            aria-pressed={typeFilter === "drivers"}
            className={`min-h-11 flex-1 rounded-md py-1 font-semibold transition-all ${
              typeFilter === "drivers"
                ? "bg-[#C5A55A] text-black font-bold shadow"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Choferes
          </button>
        </div>

        {/* Input de búsqueda */}
        <div className="mt-2.5 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por nombre..."
            aria-label="Buscar personas en el mapa"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-zinc-800 bg-zinc-900/70 py-1.5 pl-8 pr-12 text-base text-zinc-200 placeholder-zinc-500 focus:border-[#C5A55A]/60 focus:outline-none transition-colors sm:text-sm"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Limpiar búsqueda"
              className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-zinc-500 hover:text-zinc-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Leyenda y estado de selección */}
        <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-400 px-1">
          <span>{allUsersList.length} resultado(s)</span>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-purple-500 inline-block" /> Empleada
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" /> Chofer
            </span>
          </div>
        </div>

        {/* Lista interactiva */}
        <div className="mt-2 flex max-h-40 min-h-0 flex-col gap-1.5 overflow-y-auto overscroll-contain pr-1 lg:max-h-none lg:flex-1">
          {allUsersList.length > 0 ? (
            allUsersList.map((user) => {
              const isSelected = selectedUser?.id === user.id;
              return (
                <button
                  type="button"
                  key={`${user.type}-${user.id}`}
                  onClick={() => handleSelectUser(user)}
                  aria-pressed={isSelected}
                  className={`flex min-h-11 shrink-0 items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-all ${
                    isSelected
                      ? "border border-[#C5A55A] bg-[#C5A55A]/15 text-white shadow-lg"
                      : "border border-zinc-900 bg-zinc-900/40 text-zinc-400 hover:border-zinc-800 hover:text-zinc-200"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`h-6 w-6 shrink-0 rounded-full flex items-center justify-center ${
                        user.type === "employee"
                          ? "bg-purple-950/80 border border-purple-500/40 text-purple-300"
                          : "bg-emerald-950/80 border border-emerald-500/40 text-emerald-300"
                      }`}
                    >
                      {user.type === "employee" ? (
                        <Users className="h-3 w-3" />
                      ) : (
                        <Car className="h-3 w-3" />
                      )}
                    </div>
                    <div className="truncate">
                      <p className="font-semibold text-zinc-200 truncate">{user.name}</p>
                      <p className="text-[10px] text-zinc-500 truncate">{user.subtext}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {user.hasLocation ? (
                      <span
                        className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold ${
                          isSelected
                            ? "bg-[#C5A55A] text-black"
                            : "bg-emerald-950/60 text-emerald-400 border border-emerald-500/30"
                        }`}
                      >
                        <MapPin className="h-2.5 w-2.5" />
                        GPS
                      </span>
                    ) : (
                      <span className="text-[9px] text-zinc-600 font-medium">Sin GPS</span>
                    )}
                  </div>
                </button>
              );
            })
          ) : (
            <div className="py-8 text-center text-xs text-zinc-500">
              No se encontraron coincidencias
            </div>
          )}
        </div>
      </div>

      {/* Contenedor del Mapa */}
      <div className="relative isolate h-[55dvh] min-h-[320px] w-full min-w-0 shrink-0 overflow-hidden rounded-xl border border-zinc-800 lg:h-full lg:min-h-0 lg:flex-1">
        {selectedUser && (
          <div className="absolute bottom-6 left-3 right-3 z-[1000] flex items-center gap-2.5 rounded-xl border border-[#C5A55A]/60 bg-black/85 px-3.5 py-2 shadow-xl backdrop-blur-md sm:right-auto sm:max-w-[calc(100%-5rem)]">
            <div
              className={`h-2.5 w-2.5 rounded-full ${
                selectedUser.type === "employee" ? "bg-purple-500 animate-ping" : "bg-emerald-500 animate-ping"
              }`}
            />
            <div className="min-w-0 flex-1 break-words text-xs">
              <span className="text-zinc-400 font-medium">Enfocando a: </span>
              <span className="text-white font-bold">{selectedUser.name}</span>
              {!selectedUser.position && (
                <span className="ml-2 text-[10px] text-amber-400">(Sin ubicación GPS registrada)</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelectedUser(null)}
              className="ml-2 flex h-11 w-11 shrink-0 items-center justify-center text-zinc-400 hover:text-white"
              title="Quitar filtro"
              aria-label="Quitar filtro"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <MapContainer
          center={initialCenter}
          zoom={13}
          style={{
            width: "100%",
            height: "100%",
          }}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapResizeObserver />

          {/* Centrado suave automático cuando se selecciona un usuario */}
          <MapFlyTo position={selectedUser?.position ?? null} />

          {/* Marcadores de Choferes */}
          {driverMarkers.map((driver) => {
            const isHighlighted = selectedUser?.id === driver.id && selectedUser?.type === "driver";
            const isDimmed = Boolean(selectedUser && !isHighlighted);
            if (selectedUser && selectedUser.type !== "driver" && selectedUser.id !== driver.id) {
              return null;
            }
            return (
              <Marker
                key={`drv-${driver.id}`}
                position={driver.position}
                icon={createCustomIcon("#22c55e", isHighlighted, isDimmed)}
                eventHandlers={{
                  click: () =>
                    setSelectedUser({
                      id: driver.id,
                      type: "driver",
                      name: driver.nombre,
                      position: driver.position,
                    }),
                }}
              >
                <Popup>
                  <div className="text-xs p-1">
                    <p className="font-bold text-emerald-700">Chofer: {driver.nombre}</p>
                    <p className="text-zinc-600">Tel: {driver.telefono}</p>
                    <p className="text-zinc-500 text-[10px]">
                      Estado: {driver.disponible ? "Disponible" : "No disponible"}
                    </p>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* Marcadores de Empleadas */}
          {employeeMarkers.map((employee) => {
            const isHighlighted = selectedUser?.id === employee.id && selectedUser?.type === "employee";
            const isDimmed = Boolean(selectedUser && !isHighlighted);
            if (selectedUser && selectedUser.type !== "employee" && selectedUser.id !== employee.id) {
              return null;
            }
            return (
              <Marker
                key={`emp-${employee.id}`}
                position={employee.position}
                icon={createCustomIcon("#a855f7", isHighlighted, isDimmed)}
                eventHandlers={{
                  click: () =>
                    setSelectedUser({
                      id: employee.id,
                      type: "employee",
                      name: employee.nombreArtistico,
                      position: employee.position,
                    }),
                }}
              >
                <Popup>
                  <div className="text-xs p-1">
                    <p className="font-bold text-purple-700">
                      Empleada: {employee.nombreArtistico}
                    </p>
                    <p className="text-zinc-600">Nombre real: {employee.nombreReal}</p>
                    <p className="text-zinc-500 text-[10px]">
                      Estado: {employee.disponible ? "Disponible" : "Ocupada"}
                    </p>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
