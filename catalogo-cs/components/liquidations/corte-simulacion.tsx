"use client";

import { useState, useTransition, useEffect } from "react";
import { formatCurrency } from "@/lib/calculations";
import { setCompanyPercentageForRecords } from "@/app/admin/liquidations/actions";
import type { LiquidationReport } from "./types";
import { toast } from "sonner";

export default function CorteSimulacion({
  report,
  isAdmin,
}: {
  report: LiquidationReport;
  isAdmin: boolean;
}) {
  const [commissionPercentage, setCommissionPercentage] = useState(40);
  const [isSaving, startTransition] = useTransition();

  // Initialize from the first office record if available
  useEffect(() => {
    if (report.officeRecords.length > 0) {
      const pct = report.officeRecords[0].companyPercentage;
      if (pct != null) setCommissionPercentage(pct);
    }
  }, [report.officeRecords]);

  // Client-side recalculation function for the simulated cut
  const recalculateCut = (cut: LiquidationReport["officeCut"], records: LiquidationReport["officeRecords"]) => {
    let newCompanyCommission = 0;
    records.forEach(r => {
      if (r.cancelled || r.isFine) return;
      const serviceTotal = Number(r.serviceTotal || 0);
      const promotion = r.promotion ? 300 : 0;
      newCompanyCommission += Math.round((serviceTotal + promotion) * (commissionPercentage / 100));
    });

    const netTransportBalance = (cut.customerTransportCharges || 0) - (cut.transportTotal || 0);
    const result = newCompanyCommission + netTransportBalance;
    
    return {
      ...cut,
      companyCommission: newCompanyCommission,
      result: result,
      isPositive: result >= 0
    };
  };

  const simulatedOfficeCut = recalculateCut(report.officeCut, report.officeRecords);
  const simulatedEmployeeCut = recalculateCut(report.employeeCut, report.employeeRecords);

  const handleSave = () => {
    if (!isAdmin) return;
    if (!confirm(`¿Aplicar y guardar el porcentaje de empresa al ${commissionPercentage}% para los registros de esta semana?`)) return;

    startTransition(async () => {
      try {
        const recordIds = report.officeRecords.map(r => r.id);
        await setCompanyPercentageForRecords(recordIds, commissionPercentage);
        toast.success("Porcentaje guardado y aplicado a esta semana.");
      } catch (error) {
        toast.error("Error al aplicar porcentaje");
      }
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
      {/* PORCENTAJE DE CORTE */}
      <div className="bg-zinc-950 p-6 rounded-xl border border-zinc-800 shadow-md flex flex-col justify-center items-center h-full">
        <h3 className="text-zinc-400 uppercase tracking-widest text-xs mb-4">Porcentaje Empresa</h3>
        <div className="flex items-center gap-4 mb-4">
          <span className="text-4xl font-bold text-[#d4af37]">{commissionPercentage}%</span>
        </div>
        <input
          type="range"
          min="10"
          max="100"
          step="5"
          value={commissionPercentage}
          onChange={(e) => setCommissionPercentage(Number(e.target.value))}
          className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-[#d4af37]"
        />
        <div className="flex justify-between w-full mt-2 text-xs text-zinc-500">
          <span>10%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
        <div className="flex flex-wrap justify-center gap-2 mt-4 mb-4">
          {[25, 30, 35, 40, 45, 50].map(pct => (
            <button
              key={pct}
              onClick={() => setCommissionPercentage(pct)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${commissionPercentage === pct ? 'bg-[#d4af37] text-black border-[#d4af37] font-bold' : 'bg-transparent text-zinc-400 border-zinc-600 hover:border-zinc-400'}`}
            >
              {pct}%
            </button>
          ))}
        </div>

        {isAdmin && (
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full bg-[#d4af37] text-black font-bold px-4 py-2.5 rounded-xl text-xs uppercase tracking-widest hover:bg-[#b08d20] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? "Guardando..." : "Guardar Porcentaje"}
          </button>
        )}
      </div>

      {/* TARJETA DE RESUMEN (OFICINA) */}
      <div className="bg-zinc-950 p-6 rounded-xl border border-zinc-800 shadow-md flex flex-col h-full relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-[#d4af37] rounded-full mix-blend-screen filter blur-[40px] opacity-10 pointer-events-none"></div>
        <div className="flex justify-between items-center border-b border-zinc-700 pb-3 mb-4 relative z-10">
          <h3 className="text-zinc-200 font-black uppercase tracking-wider text-xs flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#d4af37]"></div>
            Liquidación Jefes
          </h3>
          <span className="bg-zinc-900 text-[#d4af37] px-2.5 py-1 rounded-md text-[10px] font-bold border border-zinc-700">
            {report.officeCut.count} SERVICIOS
          </span>
        </div>

        <div className="flex flex-col gap-1.5 text-xs relative z-10 mb-4 flex-1">
          <div className="flex justify-between py-0.5">
            <span className="text-zinc-400 font-medium">Venta Total</span>
            <span className="text-white font-bold">{formatCurrency(report.officeCut.salesTotal)}</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-zinc-400 font-medium">Comisión Empresa ({commissionPercentage}%)</span>
            <span className="text-white font-bold">{formatCurrency(simulatedOfficeCut.companyCommission)}</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-[#d4af37] italic font-medium">↳ Efectivo</span>
            <span className="text-[#d4af37] font-bold">{formatCurrency(report.officeCut.cashTotal)}</span>
          </div>

          <div className="my-1 border-t border-zinc-800"></div>

          {report.officeCut.finesTotal > 0 && (
            <div className="flex justify-between py-0.5">
              <span className="text-zinc-400 font-medium">(-) Multas</span>
              <span className="text-red-400 font-bold">-{formatCurrency(report.officeCut.finesTotal)}</span>
            </div>
          )}
          <div className="flex justify-between py-0.5">
            <span className="text-zinc-400 font-medium">(-) Transporte</span>
            <div className="flex flex-col items-end">
              <span className="text-red-400 font-bold">-{formatCurrency(report.officeCut.transportTotal)}</span>
            </div>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-zinc-400 font-medium">(-) Tarjeta</span>
            <span className="text-red-400 font-bold">-{formatCurrency(report.officeCut.cardTotal)}</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-zinc-400 font-medium">(-) Extras</span>
            <span className="text-red-400 font-bold">-{formatCurrency(report.officeCut.calculatedExtras)}</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-zinc-400 font-medium">(-) Membresías</span>
            <span className="text-red-400 font-bold">-{formatCurrency(report.officeCut.membershipTotal + report.officeCut.promotionTotal)}</span>
          </div>
        </div>

        <div className={`mt-auto p-3 rounded-lg flex justify-between items-center relative z-10 border ${simulatedOfficeCut.isPositive ? 'bg-green-900/10 border-green-500/30' : 'bg-red-900/10 border-red-500/30'}`}>
          <span className={`font-bold uppercase tracking-widest text-[10px] ${simulatedOfficeCut.isPositive ? 'text-green-400' : 'text-red-400'}`}>
            {simulatedOfficeCut.isPositive ? 'A FAVOR EMPRESA' : 'A FAVOR EMPLEADA'}
          </span>
          <span className={`text-xl font-black ${simulatedOfficeCut.isPositive ? 'text-green-400' : 'text-red-400'}`}>
            {formatCurrency(Math.abs(simulatedOfficeCut.result))}
          </span>
        </div>
      </div>

      {/* TARJETA DE RESUMEN (EMPLEADA) */}
      <div className="bg-zinc-950 p-6 rounded-xl border border-zinc-800 shadow-md flex flex-col h-full relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-[#d4af37] rounded-full mix-blend-screen filter blur-[40px] opacity-10 pointer-events-none"></div>
        <div className="flex justify-between items-center border-b border-zinc-700 pb-3 mb-4 relative z-10">
          <div className="flex items-center gap-3">
            <h3 className="text-zinc-200 font-black uppercase tracking-wider text-xs flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#d4af37] opacity-50"></div>
              Liquidación Emp.
            </h3>
            <span className="bg-zinc-900 text-[#d4af37] px-2.5 py-1 rounded-md text-[10px] font-bold border border-zinc-700">
              {report.employeeCut.count} SERVICIOS
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 text-xs relative z-10 mb-4 flex-1">
          <div className="flex justify-between py-0.5">
            <span className="text-zinc-400 font-medium">Venta Total</span>
            <span className="text-white font-bold">{formatCurrency(report.employeeCut.salesTotal)}</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-zinc-400 font-medium">Comisión Empresa ({commissionPercentage}%)</span>
            <span className="text-white font-bold">{formatCurrency(simulatedEmployeeCut.companyCommission)}</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-[#d4af37] italic font-medium">↳ Efectivo</span>
            <span className="text-[#d4af37] font-bold">{formatCurrency(report.employeeCut.cashTotal)}</span>
          </div>

          <div className="my-1 border-t border-zinc-800"></div>

          {report.employeeCut.finesTotal > 0 && (
            <div className="flex justify-between py-0.5">
              <span className="text-zinc-400 font-medium">(-) Multas</span>
              <span className="text-red-400 font-bold">-{formatCurrency(report.employeeCut.finesTotal)}</span>
            </div>
          )}
          <div className="flex justify-between py-0.5">
            <span className="text-zinc-400 font-medium">(-) Transporte</span>
            <div className="flex flex-col items-end">
              <span className="text-red-400 font-bold">-{formatCurrency(report.employeeCut.transportTotal)}</span>
            </div>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-zinc-400 font-medium">(-) Tarjeta</span>
            <span className="text-red-400 font-bold">-{formatCurrency(report.employeeCut.cardTotal)}</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-zinc-400 font-medium">(-) Extras</span>
            <span className="text-red-400 font-bold">-{formatCurrency(report.employeeCut.calculatedExtras)}</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-zinc-400 font-medium">(-) Membresías</span>
            <span className="text-red-400 font-bold">-{formatCurrency(report.employeeCut.membershipTotal + report.employeeCut.promotionTotal)}</span>
          </div>
        </div>

        <div className={`mt-auto p-3 rounded-lg flex justify-between items-center relative z-10 border ${simulatedEmployeeCut.isPositive ? 'bg-green-900/10 border-green-500/30' : 'bg-red-900/10 border-red-500/30'}`}>
          <span className={`font-bold uppercase tracking-widest text-[10px] ${simulatedEmployeeCut.isPositive ? 'text-green-400' : 'text-red-400'}`}>
            {simulatedEmployeeCut.isPositive ? 'A FAVOR EMPRESA' : 'A FAVOR EMPLEADA'}
          </span>
          <span className={`text-xl font-black ${simulatedEmployeeCut.isPositive ? 'text-green-400' : 'text-red-400'}`}>
            {formatCurrency(Math.abs(simulatedEmployeeCut.result))}
          </span>
        </div>
      </div>
    </div>
  );
}
