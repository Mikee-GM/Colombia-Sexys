"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ArrowLeft, ArrowRight, Eye, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  cancelOrVoidServiceAction,
  softDeleteServiceAction,
} from "@/lib/actions/service-history";
import { formatCurrency } from "@/lib/calculations";
import { APP_LOCALE, APP_TIME_ZONE } from "@/lib/locale";
import type {
  WeeklyHistoryData,
  WeeklyHistoryRow,
} from "@/lib/service-history";

type Role = "admin" | "jefe" | "empleada";

export default function WeeklyServiceHistory({
  data,
  role,
  basePath,
}: {
  data: WeeklyHistoryData;
  role: Role;
  basePath: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const weekHref = (
    weekStart: string,
    employeeId = data.selectedEmployeeId,
  ) => {
    const query = new URLSearchParams({ weekStart });
    if (employeeId) query.set("employeeId", employeeId);
    return `${basePath}?${query}`;
  };

  const run = (action: () => Promise<{ success: boolean; error?: string }>) =>
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        toast.error(result.error ?? "No se pudo completar la acción");
        return;
      }
      toast.success("Acción administrativa guardada");
      router.refresh();
    });

  const cancelOrVoid = (row: WeeklyHistoryRow) => {
    const reason = window.prompt(
      row.status === "finalizado"
        ? "Motivo de la anulación administrativa"
        : "Motivo de la cancelación administrativa",
    );
    if (!reason || reason.trim().length < 10) {
      if (reason !== null)
        toast.error("Escribe un motivo de al menos 10 caracteres");
      return;
    }
    run(() => cancelOrVoidServiceAction(row.id, reason.trim()));
  };

  const moveToTrash = (row: WeeklyHistoryRow) => {
    const reason = window.prompt(
      "Motivo para enviar el servicio a la papelera",
    );
    if (!reason || reason.trim().length < 10) {
      if (reason !== null)
        toast.error("Escribe un motivo de al menos 10 caracteres");
      return;
    }
    if (
      !window.confirm(
        "El servicio se ocultará de operación, historial y cortes. ¿Continuar?",
      )
    )
      return;
    run(() => softDeleteServiceAction(row.id, reason.trim()));
  };

  return (
    <section className="space-y-5">
      <header className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#C5A55A]">
              Hoja semanal
            </p>
            <h1 className="mt-1 font-heading text-2xl font-semibold text-white">
              Historial de servicios
            </h1>
            <p className="mt-1 text-xs text-zinc-500">
              Semana del {formatDateOnly(data.week.startDate)} al{" "}
              {formatDateOnly(data.week.endDate)}
            </p>
          </div>
          {role === "admin" ? (
            <Link
              href="/admin/servicios/papelera"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-zinc-700 px-4 text-xs font-semibold uppercase tracking-wider text-zinc-300 hover:border-[#C5A55A] hover:text-[#E8D5A3]"
            >
              <Trash2 size={15} /> Papelera
            </Link>
          ) : null}
        </div>

        <nav
          className="mt-5 grid grid-cols-[44px_1fr_44px] items-center gap-2"
          aria-label="Navegación semanal"
        >
          <Link
            href={weekHref(data.week.previousStart)}
            aria-label="Semana anterior"
            className="flex h-11 items-center justify-center rounded-xl border border-zinc-800 text-zinc-300 hover:border-[#C5A55A]"
          >
            <ArrowLeft size={17} />
          </Link>
          <div className="text-center text-sm font-semibold text-white">
            {formatDateOnly(data.week.startDate)} -{" "}
            {formatDateOnly(data.week.endDate)}
          </div>
          {data.week.canGoNext ? (
            <Link
              href={weekHref(data.week.nextStart)}
              aria-label="Semana siguiente"
              className="flex h-11 items-center justify-center rounded-xl border border-zinc-800 text-zinc-300 hover:border-[#C5A55A]"
            >
              <ArrowRight size={17} />
            </Link>
          ) : (
            <span className="h-11 rounded-xl border border-zinc-900 opacity-40" />
          )}
        </nav>
      </header>

      {role !== "empleada" ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Link
            href={weekHref(data.week.startDate, null)}
            className={chipClass(data.selectedEmployeeId === null)}
          >
            Todas
          </Link>
          {data.employees.map((employee) => (
            <Link
              key={employee.id}
              href={weekHref(data.week.startDate, employee.id)}
              className={chipClass(data.selectedEmployeeId === employee.id)}
            >
              {role === "admin" && employee.bossName
                ? `${employee.bossName} · ${employee.name}`
                : employee.name}
            </Link>
          ))}
        </div>
      ) : null}

      <WeeklySummary data={data} />

      {data.rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-500">
          No hay servicios visibles en esta semana.
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-950 lg:block">
            <table className="min-w-[1900px] w-full text-left text-xs">
              <thead className="border-b border-zinc-800 bg-black text-[10px] uppercase tracking-wider text-zinc-500">
                <tr>
                  {[
                    "#",
                    "Folio",
                    "Fecha/hora",
                    "Duración",
                    "Servicio base",
                    "Extensiones",
                    "Ganancia servicio",
                    "Extra tarjeta",
                    "Comisión extra",
                    "Neto extra",
                    "Transporte cliente",
                    "Método",
                    "Lugar",
                    "Inicio",
                    "Estado",
                    "Calificación",
                    "Observaciones",
                    "Acciones",
                  ].map((label) => (
                    <th key={label} className="whitespace-nowrap px-3 py-3">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {data.rows.map((row, index) => (
                  <tr key={row.id} className="align-top text-zinc-300">
                    <td className="px-3 py-3 tabular-nums">{index + 1}</td>
                    <td className="px-3 py-3 font-semibold text-white">
                      {row.folio}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {formatDateTime(row.date)}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {row.durationHours} h
                    </td>
                    <MoneyCell value={row.financials.serviceBaseAmount} />
                    <MoneyCell value={row.financials.extensionsAmount} />
                    <MoneyCell
                      value={row.financials.employeeServiceExpected}
                      accent
                    />
                    <MoneyCell value={row.financials.cardExtrasTotal} />
                    <MoneyCell
                      value={row.financials.cardExtraCompanyCommission}
                    />
                    <MoneyCell
                      value={row.financials.cardExtrasEmployeeNet}
                      accent
                    />
                    <MoneyCell value={row.financials.customerTransportCharge} />
                    <td className="px-3 py-3 uppercase">{row.paymentMethod}</td>
                    <td className="max-w-48 px-3 py-3">{row.place}</td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {row.startAt ? formatDateTime(row.startAt) : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <Status value={row.status} />
                    </td>
                    <td className="px-3 py-3">{row.rating ?? "—"}</td>
                    <td className="max-w-56 px-3 py-3 text-zinc-500">
                      {row.observations ?? "—"}
                    </td>
                    <td className="px-3 py-3">
                      <RowActions
                        row={row}
                        role={role}
                        pending={pending}
                        onCancel={cancelOrVoid}
                        onDelete={moveToTrash}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 lg:hidden">
            {data.rows.map((row) => (
              <article
                key={row.id}
                className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                      Folio {row.folio}
                    </p>
                    <h2 className="mt-1 font-semibold text-white">
                      {row.employeeName}
                    </h2>
                    <p className="mt-1 text-xs text-zinc-500">
                      {formatDateTime(row.date)} · {row.place}
                    </p>
                  </div>
                  <Status value={row.status} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                  <Datum label="Duración" value={`${row.durationHours} h`} />
                  <Datum
                    label="Método"
                    value={row.paymentMethod.toUpperCase()}
                  />
                  <Datum
                    label="Servicio base"
                    value={formatCurrency(row.financials.serviceBaseAmount)}
                  />
                  <Datum
                    label="Extensiones"
                    value={formatCurrency(row.financials.extensionsAmount)}
                  />
                  <Datum
                    label="Ganancia 60%"
                    value={formatCurrency(
                      row.financials.employeeServiceExpected,
                    )}
                    accent
                  />
                  <Datum
                    label="Extra tarjeta"
                    value={formatCurrency(row.financials.cardExtrasTotal)}
                  />
                  <Datum
                    label="Comisión extra"
                    value={formatCurrency(
                      row.financials.cardExtraCompanyCommission,
                    )}
                  />
                  <Datum
                    label="Neto extra"
                    value={formatCurrency(row.financials.cardExtrasEmployeeNet)}
                    accent
                  />
                  <Datum
                    label="Transporte"
                    value={formatCurrency(
                      row.financials.customerTransportCharge,
                    )}
                  />
                  <Datum label="Rating" value={row.rating?.toString() ?? "—"} />
                </dl>
                <div className="mt-4 flex items-center justify-between border-t border-zinc-900 pt-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                      Total estimado empleada
                    </p>
                    <p className="mt-1 text-lg font-semibold text-[#E8D5A3]">
                      {formatCurrency(row.financials.employeeExpectedTotal)}
                    </p>
                  </div>
                  <RowActions
                    row={row}
                    role={role}
                    pending={pending}
                    onCancel={cancelOrVoid}
                    onDelete={moveToTrash}
                  />
                </div>
                {row.hasLegacyExtraSnapshots ? (
                  <p className="mt-3 text-[10px] leading-relaxed text-amber-300">
                    Este servicio contiene extras históricos sin política
                    verificable; se conservaron sin inventar comisión.
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function WeeklySummary({ data }: { data: WeeklyHistoryData }) {
  const s = data.summary;
  const values = [
    ["Servicios", String(s.services)],
    ["Horas", String(s.hours)],
    ["Servicio base", formatCurrency(s.serviceBase)],
    ["Extensiones", formatCurrency(s.extensions)],
    ["Base comisionable", formatCurrency(s.commissionableBase)],
    ["Ganancia servicio 60%", formatCurrency(s.employeeServiceExpected)],
    ["Extras tarjeta", formatCurrency(s.cardExtras)],
    ["Comisión empresa extras", formatCurrency(s.cardExtraCompanyCommission)],
    ["Neto extras empleada", formatCurrency(s.cardExtrasEmployeeNet)],
    ["Transporte cliente", formatCurrency(s.customerTransport)],
    ["Total estimado empleada", formatCurrency(s.employeeExpectedTotal)],
    ["Efectivo del servicio", formatCurrency(s.cashService)],
    ["Tarjeta del servicio", formatCurrency(s.cardService)],
    ["Transferencia del servicio", formatCurrency(s.transferService)],
    ["Mixto", formatCurrency(s.mixedService)],
    ["Cancelados", String(s.cancelled)],
    ["Rating promedio", s.averageRating?.toFixed(2) ?? "—"],
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      {values.map(([label, value]) => (
        <div
          key={label}
          className="rounded-xl border border-zinc-800 bg-zinc-950 p-3"
        >
          <p className="text-[9px] uppercase tracking-wider text-zinc-500">
            {label}
          </p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-white">
            {value}
          </p>
        </div>
      ))}
    </div>
  );
}

function RowActions({
  row,
  role,
  pending,
  onCancel,
  onDelete,
}: {
  row: WeeklyHistoryRow;
  role: Role;
  pending: boolean;
  onCancel: (row: WeeklyHistoryRow) => void;
  onDelete: (row: WeeklyHistoryRow) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {role === "admin" ? (
        <>
          {!["cancelado", "anulado", "revision_administrativa"].includes(
            row.status,
          ) ? (
            <button
              disabled={pending}
              onClick={() => onCancel(row)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-amber-500/40 px-2.5 text-[10px] font-semibold uppercase text-amber-300 disabled:opacity-40"
            >
              <ShieldAlert size={13} />{" "}
              {row.status === "finalizado" ? "Anular" : "Cancelar"}
            </button>
          ) : null}
          <button
            disabled={pending}
            onClick={() => onDelete(row)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-red-500/40 px-2.5 text-[10px] font-semibold uppercase text-red-300 disabled:opacity-40"
          >
            <Trash2 size={13} /> Eliminar
          </button>
        </>
      ) : null}
      {role === "admin" ? (
        <Link
          href={`/admin/services/${row.id}`}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 text-[10px] font-semibold uppercase text-zinc-300"
        >
          <Eye size={13} /> Ver detalle
        </Link>
      ) : (
        <details className="text-zinc-300">
          <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 text-[10px] font-semibold uppercase">
            <Eye size={13} /> Ver detalle
          </summary>
          <div className="mt-2 min-w-56 rounded-lg border border-zinc-800 bg-black p-3 text-[11px] normal-case leading-relaxed text-zinc-400">
            <p>
              Inicio:{" "}
              {row.startAt ? formatDateTime(row.startAt) : "Sin registrar"}
            </p>
            <p>Observaciones: {row.observations ?? "Sin observaciones"}</p>
            <p>Snapshot: {row.snapshotStatus.replaceAll("_", " ")}</p>
          </div>
        </details>
      )}
    </div>
  );
}

function MoneyCell({
  value,
  accent = false,
}: {
  value: number;
  accent?: boolean;
}) {
  return (
    <td
      className={`whitespace-nowrap px-3 py-3 tabular-nums ${accent ? "font-semibold text-[#E8D5A3]" : ""}`}
    >
      {formatCurrency(value)}
    </td>
  );
}

function Datum({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <dt className="text-[9px] uppercase tracking-wider text-zinc-500">
        {label}
      </dt>
      <dd
        className={`mt-1 tabular-nums ${accent ? "font-semibold text-[#E8D5A3]" : "text-zinc-200"}`}
      >
        {value}
      </dd>
    </div>
  );
}

function Status({ value }: { value: string }) {
  return (
    <span className="inline-flex rounded-full border border-zinc-700 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-zinc-300">
      {value.replaceAll("_", " ")}
    </span>
  );
}

function chipClass(active: boolean) {
  return `inline-flex min-h-10 shrink-0 items-center rounded-full border px-4 text-xs font-semibold ${active ? "border-[#C5A55A] bg-[#C5A55A] text-black" : "border-zinc-800 bg-zinc-950 text-zinc-400"}`;
}

function formatDateOnly(value: string) {
  return new Intl.DateTimeFormat(APP_LOCALE, {
    timeZone: APP_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00Z`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(APP_LOCALE, {
    timeZone: APP_TIME_ZONE,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
