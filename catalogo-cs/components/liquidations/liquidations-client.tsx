"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { formatCurrency, getStartAndEndOfWeek, getWeekStringFromDate } from "@/lib/calculations";
import { getOperationalWeekPeriod, shiftOperationalWeek } from "@/lib/week-range";
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
  initialReference,
}: {
  isAdmin?: boolean;
  initialReference: string;
}) {
  const [mode, setMode] = useState<Mode>("empleada");
  const [currentDate, setCurrentDate] = useState(() => new Date(initialReference));
  const [driverDate, setDriverDate] = useState(() => new Date(initialReference));
  const [employees, setEmployees] = useState<LiquidationEmployee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [report, setReport] = useState<LiquidationReport | null>(null);
  const [drivers, setDrivers] = useState<DriverLiquidationDriver[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [driverReport, setDriverReport] = useState<DriverLiquidationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingEmployeeReport, setLoadingEmployeeReport] = useState(false);
  const [loadingDriverReport, setLoadingDriverReport] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [employeeRanking, setEmployeeRanking] = useState<{ position: number; total: number } | null>(null);
  const [driverRanking, setDriverRanking] = useState<{ position: number; total: number } | null>(null);
  const listRequest = useRef(0);
  const employeeReportRequest = useRef(0);
  const driverReportRequest = useRef(0);
  const loadingReport = mode === "empleada" ? loadingEmployeeReport : loadingDriverReport;

  const period = useMemo(() => getOperationalWeekPeriod(currentDate), [currentDate]);
  // Los cortes de choferes conservan su criterio anterior hasta conciliar el historico.
  const driverPeriod = useMemo(() => getStartAndEndOfWeek(driverDate), [driverDate]);

  const loadEmployees = useCallback(async () => {
    const request = ++listRequest.current;
    setLoading(true);
    setReport(null);
    try {
      const data = await getLiquidationEmployees(
        period.start.toISOString(),
        period.end.toISOString(),
      );
      if (request !== listRequest.current) return;
      setEmployees(data ?? []);
      setSelectedEmployeeId((current) =>
        data?.some((employee) => employee.id === current) ? current : "",
      );
    } catch (error) {
      if (request !== listRequest.current) return;
      setEmployees([]);
      toast.error(error instanceof Error ? error.message : "No fue posible cargar las liquidaciones");
    } finally {
      if (request === listRequest.current) setLoading(false);
    }
  }, [period]);

  const loadDrivers = useCallback(async () => {
    const request = ++listRequest.current;
    setLoading(true);
    setDriverReport(null);
    try {
      const data = await getActiveDrivers(
        driverPeriod.start.toISOString().slice(0, 10),
        driverPeriod.end.toISOString().slice(0, 10),
      );
      if (request !== listRequest.current) return;
      setDrivers(data ?? []);
      setSelectedDriverId((current) =>
        data?.some((driver) => driver.id === current) ? current : "",
      );
    } catch (error) {
      if (request !== listRequest.current) return;
      setDrivers([]);
      toast.error(error instanceof Error ? error.message : "No fue posible cargar los choferes");
    } finally {
      if (request === listRequest.current) setLoading(false);
    }
  }, [driverPeriod]);

  useEffect(() => {
    if (mode === "empleada") void loadEmployees();
    else void loadDrivers();
    return () => { listRequest.current += 1; };
  }, [mode, loadEmployees, loadDrivers]);

  const refetchReport = useCallback(async () => {
    if (mode !== "empleada" || !selectedEmployeeId) return;
    const request = ++employeeReportRequest.current;
    setReport(null);
    setLoadingEmployeeReport(true);
    try {
      const data = await getLiquidationReport(
        period.start.toISOString(),
        period.end.toISOString(),
        selectedEmployeeId,
      );
      if (request !== employeeReportRequest.current) return;
      setReport(data);
    } catch (error) {
      if (request !== employeeReportRequest.current) return;
      setReport(null);
      toast.error(error instanceof Error ? error.message : "No fue posible calcular el corte");
    } finally {
      if (request === employeeReportRequest.current) setLoadingEmployeeReport(false);
    }
  }, [mode, period, selectedEmployeeId]);

  useEffect(() => {
    if (mode !== "empleada" || !selectedEmployeeId) {
      setReport(null);
      setLoadingEmployeeReport(false);
      return;
    }
    void refetchReport();
    return () => { employeeReportRequest.current += 1; };
  }, [mode, selectedEmployeeId, refetchReport]);

  const loadDriverReport = useCallback(() => {
    if (!selectedDriverId) {
      setDriverReport(null);
      return;
    }
    const request = ++driverReportRequest.current;
    setDriverReport(null);
    setLoadingDriverReport(true);
    getDriverReport(
      driverPeriod.start.toISOString().slice(0, 10),
      driverPeriod.end.toISOString().slice(0, 10),
      selectedDriverId,
    )
      .then((data) => { if (request === driverReportRequest.current) setDriverReport(data); })
      .catch((error) => {
        if (request !== driverReportRequest.current) return;
        setDriverReport(null);
        toast.error(error instanceof Error ? error.message : "No fue posible calcular la liquidación");
      })
      .finally(() => { if (request === driverReportRequest.current) setLoadingDriverReport(false); });
  }, [driverPeriod, selectedDriverId]);

  useEffect(() => {
    if (mode !== "chofer" || !selectedDriverId) {
      setDriverReport(null);
      setLoadingDriverReport(false);
      return;
    }
    loadDriverReport();
    return () => { driverReportRequest.current += 1; };
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
      .catch(() => { if (!cancelled) setEmployeeRanking(null); });
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
      .catch(() => { if (!cancelled) setDriverRanking(null); });
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

  const confirmSelectedSettlement = async () => {
    if (!selectedEmployee) return;
    const request = employeeReportRequest.current;
    setConfirming(true);
    try {
      await confirmWeeklySettlement(period.start.toISOString(), period.end.toISOString(), selectedEmployee.id);
      const updated = await getLiquidationReport(period.start.toISOString(), period.end.toISOString(), selectedEmployee.id);
      if (request === employeeReportRequest.current) setReport(updated);
      toast.success("Liquidación semanal confirmada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible confirmar la liquidación");
    } finally {
      setConfirming(false);
    }
  };

  const changeWeek = (weeks: number) => {
    if (mode === "chofer") {
      setDriverDate((current) => {
        const next = new Date(current);
        next.setDate(next.getDate() + weeks * 7);
        return next;
      });
      return;
    }
    setCurrentDate((current) => shiftOperationalWeek(current, weeks));
  };

  return (
    <div className="min-w-0 space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader title="Hoja de corte" description="Elige una semana y una persona para revisar sus registros y saldos." />
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
          period={mode === "empleada" ? period : { ...driverPeriod, weekLabel: getWeekStringFromDate(driverDate) }}
          onPrev={() => changeWeek(-1)}
          onNext={() => changeWeek(1)}
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
              <h2 className="font-serif text-2xl text-brand-gold">Corte de {selectedEmployee.name}</h2>
              <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <SettlementMetric label="Pago bruto semanal" value={report.weeklySettlement.grossEmployeePay} />
                  <SettlementMetric label="Efectivo compensado" value={report.weeklySettlement.cashOffset} />
                  <SettlementMetric label="Pago neto" value={report.weeklySettlement.netEmployeePay} />
                  <SettlementMetric label="Efectivo pendiente posterior" value={report.weeklySettlement.remainingCashDebt} />
                </div>
                <button type="button" disabled={confirming || report.weeklySettlement.status === "confirmed"} onClick={confirmSelectedSettlement} className="mt-5 w-full rounded-xl border border-brand-gold py-3 text-xs font-semibold uppercase tracking-wider text-brand-gold disabled:border-zinc-800 disabled:text-zinc-600">
                  {report.weeklySettlement.status === "confirmed" ? "Liquidación confirmada" : confirming ? "Confirmando" : "Confirmar liquidación semanal"}
                </button>
              </section>
              <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="min-w-0 space-y-6 xl:col-span-2">
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
              period={driverPeriod}
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
  return <div className="rounded-2xl border border-zinc-800 bg-black/40 p-4"><p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p><p className="mt-2 font-serif text-2xl text-zinc-100">{formatCurrency(value)}</p></div>;
}
