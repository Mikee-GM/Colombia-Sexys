"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  getLiquidationEmployees,
  getLiquidationReport,
  confirmWeeklySettlement,
  getActiveDrivers,
  getDriverReport,
  getEmployeeRankingPositions,
  getDriverRankingPositions,
} from "@/app/admin/liquidations/actions";
import { getStartAndEndOfWeek } from "@/lib/calculations";
import PageHeader from "@/components/ui/page-header";
import CutComparison from "./cut-comparison";
import DebtManager from "./debt-manager";
import DriverSettlementPanel from "./driver-settlement-panel";
import LiquidationBreakdown from "./liquidation-breakdown";
import LiquidationSummary from "./liquidation-summary";
import type {
  DriverLiquidationDriver,
  DriverLiquidationReport,
  LiquidationEmployee,
  LiquidationReport,
} from "./types";
import WeekSelector from "./week-selector";

type Mode = "empleada" | "chofer";

export default function LiquidationsClient({
  isAdmin = false,
}: {
  isAdmin?: boolean;
}) {
  const [mode, setMode] = useState<Mode>("empleada");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [employees, setEmployees] = useState<LiquidationEmployee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [report, setReport] = useState<LiquidationReport | null>(null);
  const [drivers, setDrivers] = useState<DriverLiquidationDriver[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [driverReport, setDriverReport] = useState<DriverLiquidationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [employeeRanking, setEmployeeRanking] = useState<{ position: number; total: number } | null>(null);
  const [driverRanking, setDriverRanking] = useState<{ position: number; total: number } | null>(null);

  const period = useMemo(() => getStartAndEndOfWeek(currentDate), [currentDate]);

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setReport(null);
    try {
      const data = await getLiquidationEmployees(
        period.start.toISOString(),
        period.end.toISOString(),
      );
      setEmployees(data ?? []);
      setSelectedEmployeeId((current) =>
        data?.some((employee) => employee.id === current) ? current : "",
      );
    } catch (error) {
      setEmployees([]);
      toast.error(error instanceof Error ? error.message : "No fue posible cargar las liquidaciones");
    } finally {
      setLoading(false);
    }
  }, [period]);

  const loadDrivers = useCallback(async () => {
    setLoading(true);
    setDriverReport(null);
    try {
      const data = await getActiveDrivers(
        period.start.toISOString().slice(0, 10),
        period.end.toISOString().slice(0, 10),
      );
      setDrivers(data ?? []);
      setSelectedDriverId((current) =>
        data?.some((driver) => driver.id === current) ? current : "",
      );
    } catch (error) {
      setDrivers([]);
      toast.error(error instanceof Error ? error.message : "No fue posible cargar los choferes");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    if (mode === "empleada") void loadEmployees();
    else void loadDrivers();
  }, [mode, loadEmployees, loadDrivers]);

  const refetchReport = useCallback(async () => {
    if (mode !== "empleada" || !selectedEmployeeId) return;
    setLoadingReport(true);
    try {
      const data = await getLiquidationReport(
        period.start.toISOString(),
        period.end.toISOString(),
        selectedEmployeeId,
      );
      setReport(data);
    } catch (error) {
      setReport(null);
      toast.error(error instanceof Error ? error.message : "No fue posible calcular el corte");
    } finally {
      setLoadingReport(false);
    }
  }, [mode, period, selectedEmployeeId]);

  useEffect(() => {
    if (mode !== "empleada" || !selectedEmployeeId) {
      setReport(null);
      return;
    }
    void refetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, period, selectedEmployeeId]);

  const loadDriverReport = useCallback(() => {
    if (!selectedDriverId) {
      setDriverReport(null);
      return;
    }
    setLoadingReport(true);
    getDriverReport(
      period.start.toISOString().slice(0, 10),
      period.end.toISOString().slice(0, 10),
      selectedDriverId,
    )
      .then((data) => setDriverReport(data))
      .catch((error) => {
        setDriverReport(null);
        toast.error(error instanceof Error ? error.message : "No fue posible calcular la liquidación");
      })
      .finally(() => setLoadingReport(false));
  }, [period, selectedDriverId]);

  useEffect(() => {
    if (mode !== "chofer" || !selectedDriverId) {
      setDriverReport(null);
      return;
    }
    loadDriverReport();
  }, [mode, selectedDriverId, loadDriverReport]);

  useEffect(() => {
    if (!isAdmin || mode !== "empleada" || !selectedEmployeeId) {
      setEmployeeRanking(null);
      return;
    }
    let cancelled = false;
    getEmployeeRankingPositions()
      .then((positions) => {
        if (cancelled) return;
        const match = positions.find((entry) => entry.id === selectedEmployeeId);
        setEmployeeRanking(
          match?.position != null ? { position: match.position, total: match.total } : null,
        );
      })
      .catch(() => setEmployeeRanking(null));
    return () => {
      cancelled = true;
    };
  }, [isAdmin, mode, selectedEmployeeId]);

  useEffect(() => {
    if (!isAdmin || mode !== "chofer" || !selectedDriverId) {
      setDriverRanking(null);
      return;
    }
    let cancelled = false;
    getDriverRankingPositions()
      .then((positions) => {
        if (cancelled) return;
        const match = positions.find((entry) => entry.id === selectedDriverId);
        setDriverRanking(
          match?.position != null ? { position: match.position, total: match.total } : null,
        );
      })
      .catch(() => setDriverRanking(null));
    return () => {
      cancelled = true;
    };
  }, [isAdmin, mode, selectedDriverId]);

  const employeeGroups = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; employees: LiquidationEmployee[] }>();
    for (const employee of employees) {
      if (employee.bosses.length === 0) {
        const group = groups.get("unassigned") ?? {
          id: "unassigned",
          name: "Sin asignar",
          employees: [],
        };
        group.employees.push(employee);
        groups.set(group.id, group);
        continue;
      }
      for (const boss of employee.bosses) {
        const group = groups.get(boss.id) ?? {
          id: boss.id,
          name: boss.name,
          employees: [],
        };
        group.employees.push(employee);
        groups.set(group.id, group);
      }
    }
    return [...groups.values()];
  }, [employees]);

  const selectedEmployee = employees.find(
    (employee) => employee.id === selectedEmployeeId,
  );
  const selectedDriver = drivers.find((driver) => driver.id === selectedDriverId);

  const changeWeek = (days: number) => {
    setCurrentDate((current) => {
      const next = new Date(current);
      next.setDate(next.getDate() + days);
      return next;
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader title="Liquidaciones (Cortes)" description="Gestión financiera unificada" />
        {(loading || loadingReport) && (
          <span className="text-sm text-brand-gold animate-pulse">Actualizando...</span>
        )}
      </div>

      <div className="flex w-full justify-center gap-2">
        {(["empleada", "chofer"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setMode(option)}
            className={`rounded-full border px-5 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
              mode === option
                ? "border-brand-gold bg-brand-gold text-black"
                : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-brand-gold/50"
            }`}
          >
            {option === "empleada" ? "Empleadas" : "Choferes"}
          </button>
        ))}
      </div>

      <div className="flex w-full justify-center">
        <WeekSelector
          currentDate={currentDate}
          onPrev={() => changeWeek(-7)}
          onNext={() => changeWeek(7)}
        />
      </div>

      {!loading && mode === "empleada" && (
        <div className="space-y-6">
          <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5 shadow-md sm:p-6">
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-400">
              Empleadas activas esta semana
            </h2>
            <div className="space-y-4">
              {employeeGroups.map((group) => (
                <div key={group.id} className="space-y-2">
                  <p className="text-xs font-semibold uppercase text-brand-gold">{group.name}</p>
                  <div className="flex flex-wrap gap-2">
                    {group.employees.map((employee) => (
                      <button
                        key={`${group.id}-${employee.id}`}
                        type="button"
                        onClick={() => setSelectedEmployeeId(employee.id)}
                        className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                          selectedEmployeeId === employee.id
                            ? "border-brand-gold bg-brand-gold text-black"
                            : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-brand-gold/50"
                        }`}
                      >
                        {employee.name}
                        {employee.bosses.length > 1 ? " · Compartida" : ""}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {employeeGroups.length === 0 && (
                <p className="text-sm text-zinc-500">No hay actividad esta semana.</p>
              )}
            </div>
          </section>

          {report && selectedEmployee && (
            <div className="space-y-6">
              <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <SettlementMetric label="Pago bruto semanal" value={report.weeklySettlement.grossEmployeePay} />
                  <SettlementMetric label="Efectivo compensado" value={report.weeklySettlement.cashOffset} />
                  <SettlementMetric label="Pago neto" value={report.weeklySettlement.netEmployeePay} />
                  <SettlementMetric label="Efectivo pendiente posterior" value={report.weeklySettlement.remainingCashDebt} />
                </div>
                <button type="button" disabled={confirming || report.weeklySettlement.status === "confirmed"} onClick={async () => { setConfirming(true); try { await confirmWeeklySettlement(period.start.toISOString(), period.end.toISOString(), selectedEmployee.id); setReport(await getLiquidationReport(period.start.toISOString(), period.end.toISOString(), selectedEmployee.id)); toast.success("Liquidación semanal confirmada"); } catch (error) { toast.error(error instanceof Error ? error.message : "No fue posible confirmar la liquidación"); } finally { setConfirming(false); } }} className="mt-5 w-full rounded-xl border border-brand-gold py-3 text-xs font-semibold uppercase tracking-wider text-brand-gold disabled:border-zinc-800 disabled:text-zinc-600">
                  {report.weeklySettlement.status === "confirmed" ? "Liquidación confirmada" : confirming ? "Confirmando" : "Confirmar liquidación semanal"}
                </button>
              </section>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">
                  <CutComparison
                    report={report}
                    isAdmin={isAdmin}
                    locked={report.weeklySettlement.status === "confirmed"}
                    onRecordUpdated={refetchReport}
                  />
                </div>
                <div className="space-y-6">
                  <LiquidationSummary
                    cut={report.finalCut}
                    employeeName={selectedEmployee.name}
                    ranking={employeeRanking}
                  />
                  <LiquidationBreakdown cut={report.finalCut} />
                </div>
              </div>
              <DebtManager employeeId={selectedEmployee.id} employeeName={selectedEmployee.name} />
            </div>
          )}
        </div>
      )}

      {!loading && mode === "chofer" && (
        <div className="space-y-6">
          <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5 shadow-md sm:p-6">
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-400">
              Choferes activos esta semana
            </h2>
            <div className="flex flex-wrap gap-2">
              {drivers.map((driver) => (
                <button
                  key={driver.id}
                  type="button"
                  onClick={() => setSelectedDriverId(driver.id)}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                    selectedDriverId === driver.id
                      ? "border-brand-gold bg-brand-gold text-black"
                      : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-brand-gold/50"
                  }`}
                >
                  {driver.name}
                </button>
              ))}
              {drivers.length === 0 && (
                <p className="text-sm text-zinc-500">No hay actividad esta semana.</p>
              )}
            </div>
          </section>

          {driverReport && selectedDriver && (
            <DriverSettlementPanel
              report={driverReport}
              period={period}
              onConfirmed={loadDriverReport}
              ranking={driverRanking}
            />
          )}
        </div>
      )}
    </div>
  );
}

function SettlementMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-zinc-800 bg-black/40 p-4"><p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p><p className="mt-2 font-serif text-2xl text-zinc-100">{new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value)}</p></div>;
}
