import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/cn";

/**
 * Primitivas visuales del ERP.
 *
 * Reproducen el lenguaje del panel administrativo: fondo negro, bordes zinc-800,
 * dorado #C5A55A para acentos, Cinzel (font-heading) para cifras y titulos, y
 * Montserrat (font-body) para el resto. Se mantienen aparte de StatCard y
 * SectionCard porque esas ya las consumen las pantallas actuales con otra
 * densidad; las vistas del ERP se migran modulo por modulo.
 */

/* -------------------------------------------------------------------------- */
/* Panel                                                                      */
/* -------------------------------------------------------------------------- */

type PanelProps = {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Desactiva el padding interno para tablas y listas a sangre. */
  flush?: boolean;
};

export function Panel({
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName,
  flush = false,
}: PanelProps) {
  return (
    <section
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-black/40",
        className,
      )}
    >
      {title ? (
        <div className="flex items-center justify-between gap-4 border-b border-zinc-800 px-5 py-[18px]">
          <div className="min-w-0">
            <h2 className="font-heading text-base font-semibold tracking-[0.04em] text-zinc-200">
              {title}
            </h2>

            {subtitle ? (
              <p className="mt-1 text-[11px] text-zinc-500">{subtitle}</p>
            ) : null}
          </div>

          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}

      <div
        className={cn(
          flush ? "" : "flex flex-col gap-4 p-5",
          bodyClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* KpiCard                                                                    */
/* -------------------------------------------------------------------------- */

type KpiCardProps = {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  /** Linea inferior de contexto. Acepta nodos para resaltar variaciones. */
  footnote?: ReactNode;
  className?: string;
};

export function KpiCard({
  label,
  value,
  icon: Icon,
  footnote,
  className,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-2xl border border-zinc-800 bg-black/40 p-4",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
        {Icon ? <Icon className="h-[13px] w-[13px] shrink-0 text-[#8B7635]" /> : null}
        <span className="truncate">{label}</span>
      </div>

      <p className="font-heading text-[26px] font-semibold leading-[1.1] text-white tabular-nums">
        {value}
      </p>

      {footnote ? (
        <div className="text-[11px] text-zinc-500">{footnote}</div>
      ) : null}
    </div>
  );
}

/** Variacion positiva dentro de un footnote. */
export function Up({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-green-400">{children}</span>;
}

/** Variacion negativa dentro de un footnote. */
export function Down({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-red-400">{children}</span>;
}

/* -------------------------------------------------------------------------- */
/* StatusBadge                                                                */
/* -------------------------------------------------------------------------- */

export type BadgeTone = "gold" | "green" | "red" | "amber" | "blue" | "zinc";

const TONE_CLASSES: Record<BadgeTone, string> = {
  gold: "border-[#C5A55A]/30 bg-[#C5A55A]/10 text-[#C5A55A]",
  green: "border-green-400/25 bg-green-400/[0.08] text-green-400",
  red: "border-red-400/25 bg-red-400/[0.08] text-red-400",
  amber: "border-amber-400/25 bg-amber-400/[0.08] text-amber-400",
  blue: "border-blue-400/25 bg-blue-400/[0.08] text-blue-400",
  zinc: "border-zinc-800 bg-zinc-900/60 text-zinc-400",
};

type StatusBadgeProps = {
  children: ReactNode;
  tone?: BadgeTone;
  /** Punto delante del texto, para estados en vivo. */
  dot?: boolean;
  className?: string;
};

export function StatusBadge({
  children,
  tone = "zinc",
  dot = false,
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-[0.03em]",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {dot ? (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      ) : null}
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* RecordLink                                                                 */
/* -------------------------------------------------------------------------- */

type RecordLinkProps = {
  href: string;
  children: ReactNode;
  className?: string;
};

/**
 * Campo navegable dentro de una tabla o ficha: nombre de persona, numero de
 * servicio, viaje o reporte. El subrayado dorado tenue indica que abre el
 * detalle sin competir con los botones de accion.
 */
export function RecordLink({ href, children, className }: RecordLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "border-b border-[#C5A55A]/35 font-semibold text-white transition-colors hover:border-[#C5A55A] hover:text-[#E8D5A3]",
        className,
      )}
    >
      {children}
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* PersonCell                                                                 */
/* -------------------------------------------------------------------------- */

type PersonCellProps = {
  name: string;
  meta?: string;
  /** Si se indica, el nombre abre la ficha de la persona. */
  href?: string;
  /** Iniciales del avatar. Se derivan del nombre si se omiten. */
  initials?: string;
};

export function initialsFrom(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function PersonCell({ name, meta, href, initials }: PersonCellProps) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] border border-[#C5A55A]/25 bg-[#C5A55A]/[0.12] font-heading text-[13px] font-semibold text-[#C5A55A]">
        {initials ?? initialsFrom(name)}
      </div>

      <div className="flex min-w-0 flex-col gap-0.5">
        {href ? (
          <RecordLink href={href} className="w-fit">
            {name}
          </RecordLink>
        ) : (
          <span className="truncate font-semibold text-white">{name}</span>
        )}

        {meta ? (
          <span className="truncate text-[11px] text-zinc-500">{meta}</span>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tabla                                                                      */
/* -------------------------------------------------------------------------- */

export function ErpTable({ children }: { children: ReactNode }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse">{children}</table>
    </div>
  );
}

export function Th({
  children,
  numeric = false,
}: {
  children?: ReactNode;
  numeric?: boolean;
}) {
  return (
    <th
      className={cn(
        "whitespace-nowrap border-b border-zinc-800 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-500",
        numeric ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  numeric = false,
  className,
  colSpan,
}: {
  children?: ReactNode;
  numeric?: boolean;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        "border-b border-zinc-800/55 px-4 py-[13px] align-middle text-[13px] text-zinc-300",
        numeric ? "whitespace-nowrap text-right tabular-nums" : "",
        className,
      )}
    >
      {children}
    </td>
  );
}

/** Fila de totales. Las cifras deben cuadrar con la suma de las filas visibles. */
export function TFootRow({ children }: { children: ReactNode }) {
  return (
    <tr className="[&>td]:border-t [&>td]:border-zinc-800 [&>td]:bg-zinc-900/50 [&>td]:font-bold [&>td]:text-white">
      {children}
    </tr>
  );
}

/** Marcador de dato ausente, atenuado y consistente en todas las tablas. */
export function Empty() {
  return <span className="text-zinc-500">&mdash;</span>;
}

/* -------------------------------------------------------------------------- */
/* Cabecera de pagina del ERP                                                 */
/* -------------------------------------------------------------------------- */

type ErpPageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function ErpPageHeader({
  title,
  description,
  actions,
}: ErpPageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 border-b border-zinc-800 pb-5 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <h1 className="font-heading text-3xl font-semibold leading-[1.15] text-[#E8D5A3]">
          {title}
        </h1>

        {description ? (
          <p className="mt-1.5 text-[13px] text-zinc-500">{description}</p>
        ) : null}
      </div>

      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Rejilla de KPIs                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Rejilla responsiva para la fila de indicadores. Las clases se enumeran
 * completas porque Tailwind no puede resolver nombres construidos en runtime.
 */
export function KpiGrid({
  columns = 4,
  children,
}: {
  columns?: 3 | 4 | 5;
  children: ReactNode;
}) {
  const columnClasses = {
    3: "sm:grid-cols-2 lg:grid-cols-3",
    4: "sm:grid-cols-2 xl:grid-cols-4",
    5: "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5",
  } as const;

  return (
    <div className={cn("grid grid-cols-1 gap-4", columnClasses[columns])}>
      {children}
    </div>
  );
}
