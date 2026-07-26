import type { ServiceStatus } from "@/lib/types";

type Props = {
  status: ServiceStatus;
};

export default function ServiceStatusBadge({ status }: Props) {
  const colors: Record<ServiceStatus, string> = {
    pendiente: "bg-yellow-500/20 text-yellow-400",
    agendado: "bg-purple-500/20 text-purple-300",
    en_curso: "bg-cyan-500/20 text-cyan-400",
    finalizado: "bg-green-500/20 text-green-400",
    cancelado: "bg-red-500/20 text-red-400",
  };

  const labels: Record<ServiceStatus, string> = {
    pendiente: "Pendiente",
    agendado: "Agendado",
    en_curso: "En Curso",
    finalizado: "Finalizado",
    cancelado: "Cancelado",
  };

  return (
    <span
      className={`
      px-3
      py-1
      rounded-full
      text-xs
      font-medium
      ${colors[status] || "bg-zinc-500/20 text-zinc-400"}
      `}
    >
      {labels[status] || status}
    </span>
  );
}
