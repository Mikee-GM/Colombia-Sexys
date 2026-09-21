"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, ArrowRight, User } from "lucide-react";
import Link from "next/link";
import { getPendingServices } from "@/lib/data/services";
import { getModelosAction } from "@/lib/actions/modelos";
import type { Service } from "@/lib/types";
import type { RecentChat } from "@/lib/actions/telegram-conversations";
import AccionesDelServicio from "@/components/erp/acciones-del-servicio";
import CreateServiceDialog from "@/components/services/create-service-dialog";
import { formatCurrency } from "@/lib/calculations";
import { StatusBadge } from "@/components/erp/primitives";
import ChatMonitorServiceForm from "@/components/erp/chat-monitor-service-form";

const ESTADO_TONE: Record<string, "green" | "gold" | "zinc" | "blue" | "red"> = {
  en_curso: "green",
  agendado: "gold",
  pendiente: "zinc",
  finalizado: "blue",
  cancelado: "red",
};

export default function ChatMonitorServicePanel({
  activeChat,
}: {
  activeChat: RecentChat | null;
}) {
  const [activeService, setActiveService] = useState<Service | null | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [modelos, setModelos] = useState<any[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  useEffect(() => {
    async function loadModelos() {
      const m = await getModelosAction();
      setModelos(m);
    }
    loadModelos();
  }, []);

  useEffect(() => {
    if (!activeChat) {
      setActiveService(undefined);
      return;
    }

    let isMounted = true;
    async function fetchService() {
      setIsLoading(true);
      try {
        const pending = await getPendingServices();
        if (isMounted) {
          const clientService = pending.find(
            (s) => s.clienteId === activeChat?.clienteId
          );
          setActiveService(clientService || null);
        }
      } catch (err) {
        console.error("Error fetching pending services:", err);
        if (isMounted) setActiveService(null);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    fetchService();
  }, [activeChat?.clienteId]);

  const refreshService = async () => {
    try {
      const pending = await getPendingServices();
      const clientService = pending.find(
        (s) => s.clienteId === activeChat?.clienteId
      );
      setActiveService(clientService || null);
    } catch (err) {
      console.error("Error refreshing pending services:", err);
    }
  };

  if (!activeChat) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        <p className="text-sm">Selecciona un chat para ver su servicio activo</p>
      </div>
    );
  }

  if (isLoading || activeService === undefined) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        <Loader2 className="animate-spin text-[#C5A55A]" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6 overflow-y-auto">
      <h2 className="text-lg font-bold text-zinc-200 mb-6 flex items-center gap-2">
        <User className="text-[#C5A55A]" size={20} /> Perfil y Servicio
      </h2>

      {activeService ? (
        <div className="space-y-6 animate-in fade-in">
          <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">
                Servicio Activo
              </span>
              <StatusBadge
                tone={ESTADO_TONE[activeService.estado] ?? "zinc"}
                dot={activeService.estado === "en_curso"}
              >
                {String(activeService.estado).replaceAll("_", " ")}
              </StatusBadge>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm bg-black/40 p-3 rounded-xl border border-zinc-800">
                <div className="flex flex-col">
                  <span className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wider">Total Final</span>
                  <span className="font-bold text-[#E8D5A3] text-base">
                    {formatCurrency(Number(activeService.totalFinal))}
                  </span>
                </div>
                <div className="flex flex-col text-right">
                  <span className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wider">Modelo</span>
                  <span className="font-medium text-zinc-200 text-sm">
                    {activeService.empleada?.nombreArtistico || "Sin asignar"}
                  </span>
                </div>
              </div>

              <ChatMonitorServiceForm
                service={activeService}
                onRefresh={refreshService}
              />
            </div>

            <Link
              href={`/admin/services/${activeService.id}`}
              className="flex items-center justify-center gap-2 w-full mt-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl transition-colors text-sm font-semibold"
            >
              Ficha Completa <ArrowRight size={14} />
            </Link>
          </div>

          <AccionesDelServicio
            servicioId={activeService.id}
            estado={String(activeService.estado)}
            empleadaId={activeService.empleadaId}
            etiqueta={activeService.empleada?.nombreArtistico ?? "este servicio"}
            modelos={modelos}
          />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center text-center p-6 bg-zinc-900 border border-zinc-800 border-dashed rounded-2xl h-64">
          <div className="h-12 w-12 rounded-full bg-zinc-800 flex items-center justify-center mb-4 text-zinc-500">
            <Plus size={24} />
          </div>
          <h3 className="text-zinc-200 font-medium mb-1">Sin servicio activo</h3>
          <p className="text-zinc-500 text-xs mb-6 max-w-[200px]">
            Este cliente no tiene ningún servicio pendiente o en curso.
          </p>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="w-full py-3 bg-[#C5A55A] hover:bg-[#d8b769] text-black font-bold uppercase tracking-wide text-xs rounded-xl shadow-lg shadow-amber-500/10 transition-colors"
          >
            Concretar Servicio
          </button>
        </div>
      )}

      {isCreateOpen && (
        <CreateServiceDialog
          open={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          preselectedClientId={activeChat.clienteId}
          onCreated={(newService) => {
            setActiveService(newService);
          }}
        />
      )}
    </div>
  );
}
