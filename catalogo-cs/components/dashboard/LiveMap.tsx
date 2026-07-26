"use client";

import type { Driver, Employee } from "@/lib/types";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";

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

export default function LiveMap({ employees, drivers }: Props) {
  const [localDrivers, setLocalDrivers] = useState<Driver[]>(drivers);
  const [localEmployees, setLocalEmployees] = useState<Employee[]>(employees);

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

  const driverIcon = L.divIcon({
    html: `
    <div style="
    background:#22c55e;
    width:18px;
    height:18px;
    border-radius:999px;
    border:3px solid white;
    ">
    </div>
    `,
    className: "",
  });

  const employeeIcon = L.divIcon({
    html: `
    <div style="
    background:#a855f7;
    width:18px;
    height:18px;
    border-radius:999px;
    border:3px solid white;
    ">
    </div>
    `,
    className: "",
  });

  const driverMarkers = localDrivers
    .map((driver) => ({
      ...driver,
      position: toPosition(driver.ubicacionLat, driver.ubicacionLng),
    }))
    .filter(
      (driver): driver is typeof driver & { position: [number, number] } =>
        Boolean(driver.position),
    );

  const employeeMarkers = localEmployees
    .map((employee) => ({
      ...employee,
      position: toPosition(employee.ubicacionLat, employee.ubicacionLng),
    }))
    .filter(
      (employee): employee is typeof employee & { position: [number, number] } =>
        Boolean(employee.position),
    );

  return (
    <div className="h-[550px] overflow-hidden rounded-2xl border border-zinc-800">
      <MapContainer
        center={initialCenter}
        zoom={13}
        style={{
          width: "100%",
          height: "100%",
        }}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        {driverMarkers.map((driver) => (
          <Marker key={driver.id} position={driver.position} icon={driverIcon}>
            <Popup>
              Driver
              <br />
              {driver.nombre}
            </Popup>
          </Marker>
        ))}

        {employeeMarkers.map((employee) => (
          <Marker
            key={employee.id}
            position={employee.position}
            icon={employeeIcon}
          >
            <Popup>
              Employee
              <br />
              {employee.nombreArtistico}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
