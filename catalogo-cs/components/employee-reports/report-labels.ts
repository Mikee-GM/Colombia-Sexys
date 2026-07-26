import type {
  EmployeeReportCategory,
  EmployeeReportOrigin,
  EmployeeReportPriority,
  EmployeeReportStatus,
} from "@/lib/types";

export const categoryLabels: Record<EmployeeReportCategory, string> = {
  trato_inadecuado: "Trato inadecuado",
  demora_impuntualidad: "Demora o impuntualidad",
  incumplimiento: "Incumplimiento",
  cobro: "Cobro",
  seguridad: "Seguridad",
  otro: "Otro",
};

export const originLabels: Record<EmployeeReportOrigin, string> = {
  cliente: "Cliente",
  chofer: "Chofer",
};

export const priorityLabels: Record<EmployeeReportPriority, string> = {
  normal: "Normal",
  alta: "Alta",
  urgente: "Urgente",
};

export const statusLabels: Record<EmployeeReportStatus, string> = {
  nuevo: "Nuevo",
  en_revision: "En revisión",
  resuelto: "Resuelto",
  descartado: "Descartado",
};

export const historyLabels: Record<string, string> = {
  creado: "Reporte creado",
  asignado: "Responsable asignado",
  prioridad_cambiada: "Prioridad modificada",
  estado_cambiado: "Estado actualizado",
  nota_agregada: "Nota interna agregada",
};

export function priorityClass(priority: EmployeeReportPriority) {
  if (priority === "urgente") return "border-red-500/40 bg-red-500/10 text-red-300";
  if (priority === "alta") return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  return "border-zinc-700 bg-zinc-900 text-zinc-300";
}

export function statusClass(status: EmployeeReportStatus) {
  if (status === "nuevo") return "border-sky-500/40 bg-sky-500/10 text-sky-300";
  if (status === "en_revision") return "border-[#C5A55A]/40 bg-[#C5A55A]/10 text-[#D8BC77]";
  if (status === "resuelto") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  return "border-zinc-700 bg-zinc-900 text-zinc-500";
}

export function formatReportDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
