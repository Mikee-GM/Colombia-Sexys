"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Plus, Search } from "lucide-react";
import ServiceStatusBadge from "./service-status-badge";
import ServiceDetailDialog from "./service-detail-dialog";
import CreateServiceDialog from "./create-service-dialog";
import type { Service } from "@/lib/types";
import { formatAvailabilityTime } from "@/lib/availability";
import { getServices } from "@/lib/data/services";

type Props = {
  initialServices?: Service[];
};

export default function ServicesTable({ initialServices = [] }: Props) {
  const router = useRouter();
  const [services, setServices] = useState<Service[]>(initialServices);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [creatingService, setCreatingService] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    setServices(initialServices);
  }, [initialServices]);

  const filteredServices = services.filter((service) => {
    const matchesSearch =
      service.id.toLowerCase().includes(search.toLowerCase()) ||
      (service.cliente?.nombreTelegram || "").toLowerCase().includes(search.toLowerCase()) ||
      (service.empleada?.nombreArtistico || "").toLowerCase().includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || service.estado === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleRefresh = async () => {
    try {
      const fresh = await getServices();
      if (fresh) setServices(fresh);
    } catch (err) {
      console.error("Error refreshing services:", err);
    }
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {/* Filtros y Búsqueda */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por ID, modelo o cliente..."
            className="w-full pl-10 pr-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-2xl text-xs text-white placeholder:text-zinc-600 focus:border-[#C5A55A] outline-none"
          />
        </div>

        <div className="flex gap-2 items-center flex-wrap sm:flex-nowrap">
          <div className="flex gap-2 items-center overflow-x-auto pb-1 sm:pb-0">
          {(
            [
              ["all", "Todos"],
              ["pendiente", "Pendientes"],
              ["agendado", "Agendados"],
              ["en_curso", "En Curso"],
              ["finalizado", "Finalizados"],
              ["cancelado", "Cancelados"],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setStatusFilter(val)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all whitespace-nowrap ${
                statusFilter === val
                  ? "bg-[#C5A55A] text-black font-bold"
                  : "border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
          </div>

          <button
            type="button"
            onClick={() => setCreatingService(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#C5A55A] text-zinc-950 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-[#d8b769] shadow-md shadow-amber-500/20 transition-all whitespace-nowrap ml-auto sm:ml-0"
          >
            <Plus size={15} />
            <span>Crear Servicio</span>
          </button>
        </div>
      </div>

      {/* Tabla de Servicios */}
      <div className="rounded-3xl border border-zinc-800 bg-zinc-950 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-zinc-800 text-xs font-bold uppercase tracking-wider text-zinc-400 bg-black/30">
                <th className="p-4">ID</th>
                <th className="p-4">Cliente</th>
                <th className="p-4">Modelo</th>
                <th className="p-4">Duración</th>
                <th className="p-4">Pago / Total</th>
                <th className="p-4">Estado</th>
                <th className="p-4 text-right">Acciones</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-900 text-sm">
              {filteredServices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-zinc-500 italic">
                    No se encontraron servicios registrados con los filtros actuales.
                  </td>
                </tr>
              ) : (
                filteredServices.map((service) => (
                  <tr
                    key={service.id}
                    onClick={() => setSelectedService(service)}
                    className="hover:bg-zinc-900/50 cursor-pointer transition-colors group"
                  >
                    <td className="p-4 text-xs font-mono font-bold text-[#C5A55A]">
                      #{service.id.slice(-6).toUpperCase()}
                    </td>

                    <td className="p-4">
                      <p className="font-semibold text-zinc-200">
                        {service.cliente?.nombreTelegram || "Cliente sin nombre"}
                      </p>
                      {service.locationNameSnapshot && (
                        <p className="text-xs text-zinc-500 truncate max-w-xs">
                          {service.locationNameSnapshot}
                        </p>
                      )}
                    </td>

                    <td className="p-4 text-zinc-300 font-medium">
                      {service.empleada?.nombreArtistico || "No asignada"}
                    </td>

                    <td className="p-4 text-zinc-300">
                      {service.duracionPactadaHoras}h
                    </td>

                    <td className="p-4">
                      <p className="font-bold text-white">
                        ${parseFloat(service.totalFinal || "0").toLocaleString()}
                      </p>
                      <p className="text-[10px] text-zinc-500 uppercase">
                        {service.metodoPago}
                      </p>
                    </td>

                    <td className="p-4">
                      <div className="flex items-center gap-1.5">
                        <ServiceStatusBadge status={service.estado} />
                        {service.tipoAgenda === "programado" && (
                          <span className="rounded-md border border-purple-500/30 bg-purple-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-purple-300">
                            📅 Cita
                          </span>
                        )}
                      </div>
                      {service.tipoAgenda === "programado" && service.fechaProgramada ? (
                        <p className="mt-1 text-[11px] text-purple-300 font-medium">
                          Cita: {new Date(service.fechaProgramada).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                        </p>
                      ) : (
                        service.horaInicioEstimada && (
                          <p className="mt-1 text-[11px] text-zinc-500">
                            Llegada: {formatAvailabilityTime(service.horaInicioEstimada)}
                          </p>
                        )
                      )}
                    </td>

                    <td className="p-4 text-right">
                      <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setSelectedService(service)}
                          className="p-2 rounded-xl border border-zinc-800 bg-black/60 text-zinc-300 hover:border-[#C5A55A] hover:text-[#E8D5A3] transition-colors"
                          title="Ver detalle completo"
                        >
                          <Eye size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Detalle y Gestión Completa */}
      {selectedService && (
        <ServiceDetailDialog
          service={selectedService}
          allServices={services}
          onClose={() => setSelectedService(null)}
          onUpdated={() => {
            handleRefresh();
            setSelectedService(null);
          }}
        />
      )}
      {/* Modal de Creación Manual */}
      <CreateServiceDialog
        open={creatingService}
        onClose={() => setCreatingService(false)}
        onCreated={() => {
          handleRefresh();
        }}
      />
    </div>
  );
}
