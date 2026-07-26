import type { Service } from "@/lib/types";

type Props = {
  services: Service[];
  error?: string;
};

const statusLabels: Record<Service["estado"], string> = {
  pendiente: "Pendiente",
  agendado: "Agendado",
  en_curso: "En curso",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
};

export default function ActivityFeed({ services, error }: Props) {
  const recentServices = [...services]
    .sort(
      (a, b) =>
        new Date(b.updatedAt ?? b.createdAt).getTime() -
        new Date(a.updatedAt ?? a.createdAt).getTime(),
    )
    .slice(0, 5);

  return (
    <div className="rounded-3xl border border-zinc-800 bg-[#0f0f0f] p-6">
      <h3 className="mb-6 text-xl font-semibold">Activity Feed</h3>

      <div className="space-y-4">
        {error ? (
          <p className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-200">
            {error}
          </p>
        ) : recentServices.length > 0 ? (
          recentServices.map((service) => (
            <div
              key={service.id}
              className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">
                  {service.cliente?.nombreTelegram ?? "Cliente sin nombre"}
                </p>
                <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
                  {statusLabels[service.estado]}
                </span>
              </div>
              <p className="mt-2 text-sm text-zinc-400">
                {service.empleada?.nombreArtistico ?? "Sin empleada"} · $
                {Number(service.totalFinal).toLocaleString("es-MX")}
              </p>
            </div>
          ))
        ) : (
          <p className="text-zinc-400">No hay servicios registrados.</p>
        )}
      </div>
    </div>
  );
}
