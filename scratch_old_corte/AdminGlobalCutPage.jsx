import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { getRecords, getAllCatalogs } from "../api/api-service";
import { getStartAndEndOfWeek, calculateCutReport, formatCurrency } from "../utils/calculations";
import WeekSelector from "../components/ui/WeekSelector";

export default function AdminGlobalCutPage() {
    const { authToken } = useAuth();

    // Estados
    const [currentDate, setCurrentDate] = useState(new Date());
    const [records, setRecords] = useState([]);
    const [catalogs, setCatalogs] = useState({ users: [] });
    const [loading, setLoading] = useState(true);

    // 1. CARGA INICIAL (Catálogos)
    useEffect(() => {
        const loadCatalogsOnly = async () => {
            if (!authToken) return;
            try {
                const cats = await getAllCatalogs(authToken);
                setCatalogs(cats);
            } catch (error) {
                console.error("Error catálogos:", error);
            }
        };
        loadCatalogsOnly();
    }, [authToken]);

    // 2. CARGA DE REGISTROS (Por Semana)
    const fetchWeekRecords = useCallback(async () => {
        if (!authToken) return;
        try {
            setLoading(true);
            const { start, end } = getStartAndEndOfWeek(currentDate);
            const recs = await getRecords(authToken, start, end);
            setRecords(recs);
        } catch (error) {
            console.error("Error registros:", error);
        } finally {
            setLoading(false);
        }
    }, [authToken, currentDate]);

    useEffect(() => {
        fetchWeekRecords();
    }, [fetchWeekRecords]);

    const changeWeek = (days) => {
        const d = new Date(currentDate);
        d.setDate(d.getDate() + days);
        setCurrentDate(d);
    };

    // 3. PROCESAMIENTO DE DATOS GLOBALES
    const globalData = useMemo(() => {
        if (!records || records.length === 0 || !catalogs.users) {
            return { 
                empleadasData: [], 
                officeTotals: { totalEmpresa: 0, totalEmpleadas: 0, balanceNeto: 0 },
                employeeTotals: { totalEmpresa: 0, totalEmpleadas: 0, balanceNeto: 0 }
            };
        }

        // Obtener nombres únicos de empleadas con actividad en esta semana
        const activeNames = new Set();
        records.forEach(r => {
            if (r.nombre_empleada) {
                activeNames.add(r.nombre_empleada);
            }
        });

        let totalA_FavorEmpresa_Office = 0;
        let totalA_FavorEmpleadas_Office = 0;
        let totalA_FavorEmpresa_Employee = 0;
        let totalA_FavorEmpleadas_Employee = 0;

        const empleadasData = [];

        Array.from(activeNames).forEach(empName => {
            // Generar el reporte de corte para esta empleada
            const report = calculateCutReport(records, empName);
            
            // Extraemos los cortes
            const officeCut = report.officeCut;
            const employeeCut = report.employeeCut;

            empleadasData.push({
                nombre: empName,
                officeCut,
                employeeCut
            });

            // Acumular totales globales usando el corte OFICIAL (officeCut)
            if (officeCut.isPositive) {
                totalA_FavorEmpresa_Office += officeCut.result;
            } else {
                totalA_FavorEmpleadas_Office += Math.abs(officeCut.result);
            }

            // Acumular totales globales usando el corte de EMPLEADA (employeeCut)
            if (employeeCut.isPositive) {
                totalA_FavorEmpresa_Employee += employeeCut.result;
            } else {
                totalA_FavorEmpleadas_Employee += Math.abs(employeeCut.result);
            }
        });

        // Ordenar alfabéticamente
        empleadasData.sort((a, b) => a.nombre.localeCompare(b.nombre));

        return {
            empleadasData,
            officeTotals: {
                totalEmpresa: totalA_FavorEmpresa_Office,
                totalEmpleadas: totalA_FavorEmpleadas_Office,
                balanceNeto: totalA_FavorEmpresa_Office - totalA_FavorEmpleadas_Office
            },
            employeeTotals: {
                totalEmpresa: totalA_FavorEmpresa_Employee,
                totalEmpleadas: totalA_FavorEmpleadas_Employee,
                balanceNeto: totalA_FavorEmpresa_Employee - totalA_FavorEmpleadas_Employee
            }
        };
    }, [records, catalogs.users]);

    // UI Helper para las tarjetas de balance global
    const renderGlobalBalanceCard = (title, totals) => (
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] rounded-2xl border border-[#333] shadow-2xl p-6 md:p-8 relative overflow-hidden mb-6">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--accent-gold)] rounded-full mix-blend-screen filter blur-[80px] opacity-10 pointer-events-none"></div>
            
            <h2 className="text-xl font-black text-white uppercase tracking-widest mb-6 border-b border-gray-800 pb-4 text-center">
                {title}
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 relative z-10">
                <div className="flex flex-col items-center justify-center bg-green-900/10 border border-green-500/20 p-6 rounded-xl">
                    <span className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-2 text-center">Total a Favor Empresa</span>
                    <span className="text-3xl font-black text-[#30d158]">{formatCurrency(totals.totalEmpresa)}</span>
                    <span className="text-gray-500 text-[10px] uppercase tracking-widest mt-2">Lo que recibimos</span>
                </div>

                <div className="flex flex-col items-center justify-center bg-red-900/10 border border-red-500/20 p-6 rounded-xl">
                    <span className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-2 text-center">Total a Favor Empleadas</span>
                    <span className="text-3xl font-black text-[#ff453a]">{formatCurrency(totals.totalEmpleadas)}</span>
                    <span className="text-gray-500 text-[10px] uppercase tracking-widest mt-2">Lo que pagamos</span>
                </div>

                <div className={`flex flex-col items-center justify-center p-6 rounded-xl border ${totals.balanceNeto >= 0 ? 'bg-green-900/20 border-green-500/50' : 'bg-red-900/20 border-red-500/50'}`}>
                    <span className="text-white text-sm font-black uppercase tracking-widest mb-2 text-center">Balance Neto</span>
                    <span className={`text-4xl font-black ${totals.balanceNeto >= 0 ? 'text-[#30d158]' : 'text-[#ff453a]'}`}>
                        {formatCurrency(Math.abs(totals.balanceNeto))}
                    </span>
                    <span className={`font-bold uppercase tracking-widest text-[10px] mt-2 ${totals.balanceNeto >= 0 ? 'text-[#30d158]' : 'text-[#ff453a]'}`}>
                        {totals.balanceNeto >= 0 ? 'Ganancia Neta' : 'Entregamos'}
                    </span>
                </div>
            </div>
        </div>
    );

    // UI Helper para las tarjetas de corte detalladas
    const renderFullCutCard = (cutTitle, cutData, isOffice) => {
        const isPositive = cutData.isPositive;
        const bgColor = isPositive ? 'bg-green-900/10 border-green-500/30' : 'bg-red-900/10 border-red-500/30';
        const textColor = isPositive ? 'text-[#30d158]' : 'text-[#ff453a]';
        const label = isPositive ? 'A FAVOR EMPRESA' : 'A FAVOR EMPLEADA';
        const borderColor = isOffice ? 'border-[var(--accent-gold)]' : 'border-[#333]';
        const titleDot = isOffice ? 'bg-[var(--accent-gold)]' : 'bg-[var(--accent-gold)] opacity-50';

        return (
            <div className={`bg-[#111] p-4 rounded-xl border ${borderColor} shadow-inner flex flex-col h-full relative overflow-hidden`}>
                <div className="flex justify-between items-center border-b border-gray-700 pb-2 mb-3 relative z-10">
                    <h3 className="text-gray-200 font-black uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${titleDot}`}></div>
                        {cutTitle}
                    </h3>
                    <span className="bg-[#2a2a2a] text-[var(--accent-gold)] px-2 py-0.5 rounded text-[9px] font-bold border border-gray-700">
                        {cutData.count} SERV.
                    </span>
                </div>

                <div className="flex flex-col gap-1 text-[10px] relative z-10 mb-3 flex-1">
                    <div className="flex justify-between py-0.5">
                        <span className="text-gray-400 font-medium">Venta Total</span>
                        <span className="text-white font-bold">{formatCurrency(cutData.ventaTotal)}</span>
                    </div>
                    <div className="flex justify-between py-0.5">
                        <span className="text-gray-400 font-medium">Comisión Empresa</span>
                        <span className="text-white font-bold">{formatCurrency(cutData.baseComision)}</span>
                    </div>
                    <div className="flex justify-between py-0.5">
                        <span className="text-[var(--accent-gold)] italic font-medium">↳ Efectivo</span>
                        <span className="text-[var(--accent-gold)] font-bold">{formatCurrency(cutData.efectivoTotal)}</span>
                    </div>

                    <div className="my-1 border-t border-gray-800"></div>

                    {cutData.multasTotal > 0 && (
                        <div className="flex justify-between py-0.5">
                            <span className="text-gray-400 font-medium">(-) Multas</span>
                            <span className="text-[#ff453a] font-bold">-{formatCurrency(cutData.multasTotal)}</span>
                        </div>
                    )}
                    <div className="flex justify-between py-0.5">
                        <span className="text-gray-400 font-medium">(-) Transporte</span>
                        <div className="flex flex-col items-end">
                            <span className="text-[#ff453a] font-bold">-{formatCurrency(cutData.descuentoTransporteTotal)}</span>
                        </div>
                    </div>
                    <div className="flex justify-between py-0.5">
                        <span className="text-gray-400 font-medium">(-) Tarjeta</span>
                        <span className="text-[#ff453a] font-bold">-{formatCurrency(cutData.ventaTarjetaTotal)}</span>
                    </div>
                    <div className="flex justify-between py-0.5">
                        <span className="text-gray-400 font-medium">(-) Extras</span>
                        <span className="text-[#ff453a] font-bold">-{formatCurrency(cutData.extrasCalculados)}</span>
                    </div>
                    <div className="flex justify-between py-0.5">
                        <span className="text-gray-400 font-medium">(-) Membresías</span>
                        <span className="text-[#ff453a] font-bold">-{formatCurrency(cutData.membresiaTotal + cutData.promocionTotal)}</span>
                    </div>
                </div>

                <div className={`mt-auto p-2 rounded-lg flex justify-between items-center relative z-10 border ${bgColor}`}>
                    <span className={`font-bold uppercase tracking-widest text-[9px] ${textColor}`}>
                        {label}
                    </span>
                    <span className={`text-sm font-black ${textColor}`}>
                        {formatCurrency(Math.abs(cutData.result))}
                    </span>
                </div>
            </div>
        );
    };

    return (
        <div className="admin-page" style={{ fontFamily: "'Montserrat', sans-serif" }}>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white tracking-wide">Resumen Global de Cortes</h2>
            </div>

            <div className="mb-6 flex justify-center w-full">
                <WeekSelector currentDate={currentDate} onPrev={() => changeWeek(-7)} onNext={() => changeWeek(7)} />
            </div>

            {loading ? (
                <div className="text-center p-8 text-gray-400">Cargando registros de la semana...</div>
            ) : globalData.empleadasData.length === 0 ? (
                <div className="text-center p-8 text-gray-500 bg-[#1e1e1e] rounded-xl border border-gray-800">
                    No hay actividad registrada en esta semana.
                </div>
            ) : (
                <div className="space-y-8 animate-fade-in pb-20">
                    
                    {/* TOTALES GLOBALES AL INICIO */}
                    <div className="mb-10">
                        {renderGlobalBalanceCard("Balance Global Semanal (Liquidación Jefes)", globalData.officeTotals)}
                        {renderGlobalBalanceCard("Balance Global Semanal (Liquidación Empleadas)", globalData.employeeTotals)}
                    </div>

                    {/* GRID DE EMPLEADAS */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {globalData.empleadasData.map((emp) => (
                            <div key={emp.nombre} className="bg-[#1e1e1e] rounded-xl border border-gray-800 shadow-md overflow-hidden relative">
                                {/* Header Empleada */}
                                <div className="bg-[#151515] p-4 border-b border-gray-800 flex justify-between items-center">
                                    <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-[var(--accent-gold)]"></div>
                                        {emp.nombre}
                                    </h3>
                                </div>
                                
                                {/* Cajas de Corte */}
                                <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    {renderFullCutCard("Liquidación Jefes", emp.officeCut, true)}
                                    {renderFullCutCard("Liquidación Emp.", emp.employeeCut, false)}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
