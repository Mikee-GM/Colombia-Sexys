import PageHeader from "@/components/ui/page-header";
import type { EmployeeKpi } from "@/lib/types";
import KpiPyramid from "./kpi-pyramid";

interface Props {
  employees: EmployeeKpi[];
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-black/40 p-4">
      <p className="text-xs uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className="mt-2 font-serif text-2xl text-zinc-100">{value}</p>
    </div>
  );
}

export default function KpiDashboard({ employees }: Props) {
  const rated = employees.filter((employee) => employee.score != null);
  const averageScore = rated.length
    ? Math.round(
        rated.reduce((sum, employee) => sum + (employee.score as number), 0) /
          rated.length,
      )
    : null;
  const withConfirmedReports = employees.filter(
    (employee) => employee.confirmedReports90Days > 0,
  ).length;
  const topEmployee = rated[0];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        title="Indicadores"
        description="Comportamiento y desempeño de todas las modelos"
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Puntuación promedio"
          value={averageScore != null ? `${averageScore}/100` : "Sin datos"}
        />
        <SummaryCard
          label="Con reportes confirmados (90 días)"
          value={String(withConfirmedReports)}
        />
        <SummaryCard
          label="Mejor calificada"
          value={topEmployee ? topEmployee.nombreArtistico : "Sin datos"}
        />
      </section>

      <KpiPyramid employees={employees} />
    </div>
  );
}
