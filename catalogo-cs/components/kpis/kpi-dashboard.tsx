import PageHeader from "@/components/ui/page-header";
import type { DriverKpi, EmployeeKpi } from "@/lib/types";
import KpiPyramid from "./kpi-pyramid";

interface Props {
  employees: EmployeeKpi[];
  drivers?: DriverKpi[];
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

export default function KpiDashboard({ employees, drivers = [] }: Props) {
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

  const driversAsKpi: EmployeeKpi[] = drivers.map((driver) => ({
    id: driver.id,
    nombreArtistico: driver.nombre,
    fotoPerfilUrl: null,
    promedioCalificacion: driver.ratingAverage,
    totalServiciosValorados: 0,
    confirmedReports90Days: driver.confirmedReports90Days,
    score: driver.score,
    position: driver.position,
  }));

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        title="Indicadores"
        description="Comportamiento y desempeño de todas las modelos y choferes"
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

      {driversAsKpi.length > 0 && (
        <KpiPyramid
          employees={driversAsKpi}
          title="Pirámide de choferes"
          subtitle="Basada en calificación de las empleadas y reportes confirmados en los últimos 90 días."
          linkBase="/admin/drivers"
        />
      )}
    </div>
  );
}
