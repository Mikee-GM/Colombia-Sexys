import Link from "next/link";
import Image from "next/image";
import type { EmployeeKpi } from "@/lib/types";

interface Props {
  employees: EmployeeKpi[];
}

function scoreToColor(score: number) {
  const clamped = Math.max(0, Math.min(100, score));
  const hue = Math.round((clamped / 100) * 140);
  return {
    border: `linear-gradient(135deg, hsl(${hue} 80% 55%), hsl(${Math.min(150, hue + 20)} 70% 45%))`,
    glow: `hsla(${hue}, 85%, 50%, 0.35)`,
    text: `hsl(${hue} 85% 65%)`,
    chip: `hsl(${hue} 55% 16%)`,
  };
}

function buildRows(count: number) {
  const rows: number[] = [];
  let remaining = count;
  let size = 1;
  while (remaining > 0) {
    const take = Math.min(size, remaining);
    rows.push(take);
    remaining -= take;
    size += 1;
  }
  return rows;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function EmployeeTile({
  employee,
  size,
}: {
  employee: EmployeeKpi;
  size: number;
}) {
  const unrated = employee.score == null;
  const colors = unrated ? null : scoreToColor(employee.score as number);

  return (
    <Link
      href={`/admin/employees/${employee.id}`}
      className="group flex flex-col items-center gap-2 transition-transform duration-300 hover:-translate-y-1"
      style={{ width: size }}
    >
      <div
        className="relative flex items-center justify-center rounded-2xl p-[2px] transition-shadow duration-300"
        style={{
          width: size,
          height: size,
          background: unrated
            ? "repeating-linear-gradient(135deg, rgba(113,113,122,0.5) 0 8px, rgba(63,63,70,0.3) 8px 16px)"
            : colors!.border,
          boxShadow: unrated ? "none" : `0 0 18px ${colors!.glow}`,
        }}
      >
        <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-[14px] bg-zinc-950">
          {employee.fotoPerfilUrl ? (
            <Image
              src={employee.fotoPerfilUrl}
              alt={employee.nombreArtistico}
              width={size}
              height={size}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="font-serif text-lg text-zinc-500">
              {initials(employee.nombreArtistico)}
            </span>
          )}
        </div>
        <span
          className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-zinc-800 px-2 py-0.5 text-[10px] font-bold tabular-nums"
          style={{
            background: unrated ? "#18181b" : colors!.chip,
            color: unrated ? "#71717a" : colors!.text,
          }}
        >
          {unrated ? "S/C" : employee.score}
        </span>
      </div>
      <p className="mt-1 max-w-[9rem] truncate text-center text-xs font-medium text-zinc-300 group-hover:text-white">
        {employee.nombreArtistico}
      </p>
    </Link>
  );
}

export default function KpiPyramid({ employees }: Props) {
  const rated = employees
    .filter((employee) => employee.score != null)
    .sort((a, b) => (b.score as number) - (a.score as number));
  const unrated = employees.filter((employee) => employee.score == null);

  const rows = buildRows(rated.length);
  let cursor = 0;
  const maxSize = 128;
  const minSize = 84;

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6 sm:p-8">
      <h2 className="mb-1 font-serif text-lg font-semibold text-zinc-100">
        Pirámide de desempeño
      </h2>
      <p className="mb-8 text-sm text-zinc-500">
        Ordenadas por puntuación total. Verde es lo mejor calificado, rojo
        requiere atención.
      </p>

      {rated.length === 0 ? (
        <p className="py-8 text-center text-sm italic text-zinc-600">
          Todavía no hay calificaciones registradas.
        </p>
      ) : (
        <div className="flex flex-col items-center gap-8">
          {rows.map((rowSize, rowIndex) => {
            const slice = rated.slice(cursor, cursor + rowSize);
            cursor += rowSize;
            const size = Math.max(minSize, maxSize - rowIndex * 10);
            return (
              <div
                key={rowIndex}
                className="flex flex-wrap items-start justify-center gap-6"
              >
                {slice.map((employee) => (
                  <EmployeeTile
                    key={employee.id}
                    employee={employee}
                    size={size}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {unrated.length > 0 && (
        <div className="mt-10 border-t border-zinc-900 pt-6">
          <p className="mb-4 text-xs font-bold uppercase tracking-wider text-zinc-600">
            Sin calificar todavía
          </p>
          <div className="flex flex-wrap items-start justify-center gap-6">
            {unrated.map((employee) => (
              <EmployeeTile key={employee.id} employee={employee} size={84} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
