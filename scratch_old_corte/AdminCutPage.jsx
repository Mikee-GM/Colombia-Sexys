import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { getRecords, getAllCatalogs, updateRecord, addServiceRecord, deleteRecord, sendAlerts } from "../api/api-service";
import { getStartAndEndOfWeek, calculateCutReport, formatCurrency } from "../utils/calculations";
import WeekSelector from "../components/ui/WeekSelector";
import EditServiceModal from "../components/ui/EditServiceModal";
import CutComparisonTable from "../components/admin/CutComparisonTable";
import DebtManager from "../components/admin/DebtManager";
import RecordAlertModal from "../components/admin/RecordAlertModal";

export default function AdminCutPage() {
    const { authToken, user } = useAuth();

    // Estados
    const [currentDate, setCurrentDate] = useState(new Date());
    const [records, setRecords] = useState([]);
    const [catalogs, setCatalogs] = useState({ empleadas: [], oficinas: [] });
    const [selectedEmployee, setSelectedEmployee] = useState("");
    const [report, setReport] = useState(null);
    const [commissionPercentage, setCommissionPercentage] = useState(40);
    const [isSavingPercentage, setIsSavingPercentage] = useState(false);

    // Estados de UI
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editingRecord, setEditingRecord] = useState(null);
    const [galleryState, setGalleryState] = useState({ isOpen: false, images: [], currentIndex: 0 });

    // Estado para modal de multas
    const [showMultaModal, setShowMultaModal] = useState(false);
    const [multaData, setMultaData] = useState({ concepto: "", monto: "" });

    // Estado para modal de cargos a empresa
    const [showCargoModal, setShowCargoModal] = useState(false);
    const [cargoData, setCargoData] = useState({ limpieza: false, renta: false });
    const [cargoModo, setCargoModo] = useState('individual'); // 'individual' | 'todas'
    const [isApplyingCargos, setIsApplyingCargos] = useState(false);
    const [cargoEmpleadasSeleccionadas, setCargoEmpleadasSeleccionadas] = useState([]); // nombres de empleadas para modo masivo

    // Estado para alertas de registro
    const [alertModalConfig, setAlertModalConfig] = useState({ isOpen: false, record: null, targetUser: null });

    // Estado para forzar recarga de reporte si algo cambia (como deudas)
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const isSupervisor = user?.customRole === 'supervisor';

    // 1. CARGA INICIAL
    useEffect(() => {
        const loadCatalogsOnly = async () => {
            if (!authToken) return;
            try {
                const cats = await getAllCatalogs(authToken);
                setCatalogs(cats);
            } catch (error) { console.error("Error catálogos:", error); }
        };
        loadCatalogsOnly();
    }, [authToken]);

    // 2. CARGA DE REGISTROS
    const fetchWeekRecords = useCallback(async (silent = false) => {
        if (!authToken) return;
        try {
            if (!silent) setLoading(true);
            else setIsRefreshing(true);
            const { start, end } = getStartAndEndOfWeek(currentDate);
            const recs = await getRecords(authToken, start, end);
            setRecords(recs);
        } catch (error) { console.error("Error registros:", error); }
        finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    }, [authToken, currentDate]);

    useEffect(() => { fetchWeekRecords(); }, [fetchWeekRecords]);

    // 3. AGRUPACIÓN DINÁMICA DE EMPLEADAS (NUEVO: POR JEFE en lugar de por oficina)
    const employeeGroups = useMemo(() => {
        if (!catalogs.users || !records) return null;

        const activeNames = new Set();
        records.forEach(r => {
            if (r.nombre_empleada) {
                activeNames.add(r.nombre_empleada);
            }
        });

        const allEmps = catalogs.users.filter(u => u.rol === 'empleada');

        // Obtener lista de jefes activos del catálogo de users
        const jefes = (catalogs.users || []).filter(u => u.rol === 'jefe' && u.estado !== 'inactivo');
        const groups = {};

        // Crear grupo por cada jefe
        jefes.forEach(jefe => {
            groups[jefe.id] = { id: jefe.id, name: `👤 ${jefe.nombre}`, employees: [], isJefe: true };
        });

        // Grupo para empleadas sin jefe asignado
        groups['sin_asignar'] = { id: 'sin_asignar', name: '📋 Sin Asignar', employees: [] };

        // Asignar empleadas a sus jefes
        allEmps.forEach(emp => {
            const hasActivity = activeNames.has(emp.nombre);
            const isActive = emp.estado !== 'inactivo';

            // NUEVA REGLA: Solo mostrar si tiene actividad esta semana (limpieza visual)
            if (!hasActivity) return;

            const jefesDeEsta = emp.jefes_asignados || [];
            const isShared = jefesDeEsta.length > 1;
            const empData = { name: emp.nombre, hasActivity, isShared, isActive };

            if (jefesDeEsta.length > 0) {
                jefesDeEsta.forEach(j => {
                    if (groups[j.jefe_id]) {
                        groups[j.jefe_id].employees.push(empData);
                    }
                });
            }

            // Fallback: si no tiene jefes_asignados pero tiene oficina_id, buscar jefes en esa oficina
            if (jefesDeEsta.length === 0) {
                // Intentar agrupar por oficina legacy: buscar jefes que comparten oficina
                let asignadaPorOficina = false;
                if (emp.oficina_id) {
                    jefes.forEach(jefe => {
                        if (jefe.oficina_id === emp.oficina_id && groups[jefe.id]) {
                            groups[jefe.id].employees.push({ ...empData, isLegacy: true });
                            asignadaPorOficina = true;
                        }
                    });
                }
                if (!asignadaPorOficina) {
                    groups['sin_asignar'].employees.push(empData);
                }
            }
        });

        return Object.values(groups).filter(g => g.employees.length > 0);
    }, [catalogs, records]);

    // 4. CAMBIO DE EMPLEADA O SEMANA: CARGAR EL PORCENTAJE REAL DE ESA SEMANA
    useEffect(() => {
        if (selectedEmployee && catalogs.users) {
            const emp = catalogs.users.find(u => u.nombre === selectedEmployee && u.rol === 'empleada');
            const defaultPct = emp && emp.porcentaje_comision_default !== undefined ? emp.porcentaje_comision_default : 40;
            
            // Buscar si hay registros de esta empleada en la semana actual
            const employeeRecords = records.filter(r => r.nombre_empleada === selectedEmployee || (emp && r.uid_empleada === emp.id));
            
            if (employeeRecords.length > 0) {
                // Tomar el porcentaje aplicado en el primer registro de esta semana
                const appliedPct = employeeRecords[0].porcentaje_empresa_aplicado;
                if (appliedPct !== undefined && appliedPct !== null && appliedPct !== "") {
                    setCommissionPercentage(Number(appliedPct));
                } else {
                    setCommissionPercentage(defaultPct);
                }
            } else {
                setCommissionPercentage(defaultPct);
            }
        }
    }, [selectedEmployee, catalogs.users, records]);

    // 5. REPORTE
    useEffect(() => {
        if (selectedEmployee && records.length > 0) {
            const data = calculateCutReport(records, selectedEmployee);
            setReport(data);
        } else {
            setReport(null);
        }
    }, [selectedEmployee, records, refreshTrigger]);

    // --- MANEJADORES ---
    const handleEditClick = (record) => {
        if (isSupervisor) return;
        setEditingRecord(record);
        setShowForm(true);
    };

    const handleDeleteRecord = async (recordId) => {
        if (isSupervisor) return;
        if (!confirm("⚠️ ¿Estás seguro de eliminar este registro permanentemente?")) return;
        try {
            await deleteRecord(recordId, authToken);
            await fetchWeekRecords(true);
            // alert("Registro eliminado.");
        } catch (error) { alert("Error: " + error.message); }
    };

    const closeForm = () => { setShowForm(false); setEditingRecord(null); };

    const handleFormSubmit = async (formData) => {
        if (isSupervisor) return;
        try {
            if (editingRecord) await updateRecord(editingRecord._id, formData, authToken);
            else await addServiceRecord(formData, authToken);
            closeForm();
            await fetchWeekRecords(true);
            // alert("Guardado correctamente");
        } catch (error) { alert("Error: " + error.message); }
    };

    const handleDuplicateToEmployee = async (record) => {
        if (isSupervisor) return;
        if (!confirm("¿Duplicar este registro hacia la empleada? Aparecerá en su historial como si ella lo hubiera capturado.")) return;
        try {
            const emp = catalogs.empleadas.find(e => e.nombre === record.nombre_empleada);
            const payload = {
                ...record,
                _id: undefined,
                rol_registrador: 'empleada',
                uid_registrador: emp ? emp.id : record.uid_empleada,
                nombre_registrador: record.nombre_empleada,
                fecha_creacion: new Date(),
                is_exact_duplicate: true,
            };
            delete payload.contador_servicio; // Para que genere un folio nuevo
            await addServiceRecord(payload, authToken);
            await fetchWeekRecords(true);
        } catch (error) { alert("Error al duplicar: " + error.message); }
    };

    const handleDuplicateToOffice = async (record) => {
        if (isSupervisor) return;
        if (!confirm("¿Duplicar este registro hacia la oficina? Se convertirá en un registro oficial validado por ti.")) return;
        try {
            const payload = {
                ...record,
                _id: undefined,
                rol_registrador: user.customRole, // 'jefe' o 'admin'
                uid_registrador: user.uid,
                nombre_registrador: user.nombre,
                fecha_creacion: new Date(),
                is_exact_duplicate: true,
            };
            delete payload.contador_servicio;
            await addServiceRecord(payload, authToken);
            await fetchWeekRecords(true);
        } catch (error) { alert("Error al duplicar: " + error.message); }
    };

    const handleAlertRecord = () => {
        if (!selectedEmployee) return alert("Selecciona una empleada primero.");
        const employeeObj = catalogs.empleadas.find(e => e.nombre === selectedEmployee) || { id: null, nombre: selectedEmployee };
        
        setAlertModalConfig({
            isOpen: true,
            targetUser: employeeObj
        });
    };

    const handleSendAlertRecord = async (message, selectedRecords, targetUser) => {
        const registros_data = selectedRecords.map(record => ({
            id: record._id,
            folio: record._id ? record._id.toString().slice(-4).toUpperCase() : '----',
            fecha: record.fecha,
            lugar: record.lugar,
            total_servicio: record.total_servicio,
            metodo_pago: record.metodo_pago
        }));

        const payload = {
            message,
            targetUsers: [targetUser],
            registros_data
        };

        await sendAlerts(payload, authToken);
    };

    const handleAddMulta = async () => {
        if (!selectedEmployee || !multaData.concepto || !multaData.monto) return alert("Completa todos los campos");

        try {
            const emp = catalogs.empleadas.find(e => e.nombre === selectedEmployee);
            if (!emp) return alert("Empleada no encontrada en catálogo");

            const fechaRegistro = new Date(currentDate);
            fechaRegistro.setHours(12, 0, 0, 0);

            const payload = {
                es_multa: true,
                monto_multa: Number(multaData.monto),
                concepto_multa: multaData.concepto,
                nombre_empleada: emp.nombre,
                uid_empleada: emp.id,
                oficina_id: emp.oficina_id || null,
                rol_registrador: 'admin',
                uid_registrador: user.uid,
                nombre_registrador: user.nombre,
                fecha: fechaRegistro,
                total_servicio: 0,
                lugar: 'MULTA',
                metodo_pago: 'efectivo' // dummy prevent errors
            };

            await addServiceRecord(payload, authToken);
            setShowMultaModal(false);
            setMultaData({ concepto: "", monto: "" });
            await fetchWeekRecords(true);
        } catch (error) {
            alert("Error al agregar multa: " + error.message);
        }
    };

    const CARGO_ITEMS = [
        { key: 'limpieza', label: 'Limpieza', monto: 650 },
        { key: 'renta', label: 'Renta del Hogar', monto: 500 },
    ];

    const buildCargoPayloads = (emp, fechaRegistro) => {
        const payloads = [];
        CARGO_ITEMS.forEach(item => {
            if (!cargoData[item.key]) return;
            payloads.push({
                es_cargo: true,
                monto_cargo: item.monto,
                concepto_cargo: item.label,
                nombre_empleada: emp.nombre,
                uid_empleada: emp.id,
                oficina_id: emp.oficina_id || null,
                rol_registrador: 'admin',
                uid_registrador: user.uid,
                nombre_registrador: user.nombre,
                fecha: fechaRegistro,
                total_servicio: 0,
                lugar: 'CARGO',
                metodo_pago: 'efectivo'
            });
        });
        return payloads;
    };

    const handleAddCargo = async () => {
        if (!cargoData.limpieza && !cargoData.renta) return alert("Selecciona al menos un cargo.");

        if (cargoModo === 'individual') {
            if (!selectedEmployee) return alert("Selecciona una empleada primero.");
            const emp = catalogs.empleadas.find(e => e.nombre === selectedEmployee);
            if (!emp) return alert("Empleada no encontrada en catálogo.");

            setIsApplyingCargos(true);
            try {
                const fechaRegistro = new Date(currentDate);
                fechaRegistro.setHours(12, 0, 0, 0);
                const payloads = buildCargoPayloads(emp, fechaRegistro);
                for (const payload of payloads) {
                    await addServiceRecord(payload, authToken);
                }
                setShowCargoModal(false);
                setCargoData({ limpieza: false, renta: false });
                await fetchWeekRecords(true);
            } catch (error) {
                alert("Error al agregar cargo: " + error.message);
            } finally {
                setIsApplyingCargos(false);
            }
        } else {
            // Modo todas - usar solo las empleadas seleccionadas en el modal
            if (cargoEmpleadasSeleccionadas.length === 0) return alert("Selecciona al menos una empleada.");

            setIsApplyingCargos(true);
            try {
                const fechaRegistro = new Date(currentDate);
                fechaRegistro.setHours(12, 0, 0, 0);
                for (const nombre of cargoEmpleadasSeleccionadas) {
                    const emp = catalogs.empleadas.find(e => e.nombre === nombre)
                        || (catalogs.users || []).find(u => u.nombre === nombre);
                    if (!emp) continue;
                    const payloads = buildCargoPayloads(emp, fechaRegistro);
                    for (const payload of payloads) {
                        await addServiceRecord(payload, authToken);
                    }
                }
                setShowCargoModal(false);
                setCargoData({ limpieza: false, renta: false });
                setCargoEmpleadasSeleccionadas([]);
                await fetchWeekRecords(true);
            } catch (error) {
                alert("Error al aplicar cargos masivos: " + error.message);
            } finally {
                setIsApplyingCargos(false);
            }
        }
    };

    const changeWeek = (days) => {
        const d = new Date(currentDate);
        d.setDate(d.getDate() + days);
        setCurrentDate(d);
    };

    const formatDateTimeLocal = (dateString) => {
        if (!dateString) return '-';
        const d = new Date(dateString);
        return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    };

    const getBanksList = (r) => {
        return [r.banco, r.banco_2, r.banco_3, r.banco_4, r.banco_5].filter(b => b && b.trim() !== "");
    };

    return (
        <div className="admin-page" style={{ fontFamily: "'Montserrat', sans-serif" }}>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white tracking-wide">Hoja de Corte Unificada</h2>
                {isRefreshing && <span className="text-xs text-[#d4af37] animate-pulse">Actualizando...</span>}
            </div>

            {!isSupervisor && (
                <RecordAlertModal 
                isOpen={alertModalConfig.isOpen}
                onClose={() => setAlertModalConfig({ isOpen: false, targetUser: null })}
                records={report?.employeeRecords || []}
                targetUser={alertModalConfig.targetUser}
                onSend={handleSendAlertRecord}
            />
            )}

            {!isSupervisor && (
                <EditServiceModal
                    isOpen={showForm}
                    onClose={closeForm}
                    editingRecord={editingRecord}
                    catalogs={catalogs}
                    onSubmit={handleFormSubmit}
                />
            )}

            <div className="mb-6 flex justify-center w-full">
                <WeekSelector currentDate={currentDate} onPrev={() => changeWeek(-7)} onNext={() => changeWeek(7)} />
            </div>

            {loading ? (
                <div className="text-center p-8 text-gray-400">Cargando registros de la semana...</div>
            ) : (
                <div className="space-y-6">
                    {/* SELECTOR DE EMPLEADAS (CHIPS) */}
                    <div className="bg-[#1e1e1e] p-5 rounded-xl border border-gray-800 shadow-md">
                        <div className="flex items-center justify-between border-b border-gray-700 pb-2 mb-4">
                            <h3 className="text-sm text-gray-400 uppercase tracking-widest">
                                Seleccionar Empleada
                            </h3>
                            {!isSupervisor && (
                                <button
                                    onClick={() => {
                                        const activas = (catalogs.users || []).filter(u => u.rol === 'empleada' && u.estado !== 'inactivo');
                                        setCargoModo('todas');
                                        setCargoData({ limpieza: false, renta: false });
                                        setCargoEmpleadasSeleccionadas(activas.map(u => u.nombre));
                                        setShowCargoModal(true);
                                    }}
                                    className="bg-amber-900/20 text-amber-400 border border-amber-800/60 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-amber-900/40 transition-colors"
                                >
                                    Cargos a Todas
                                </button>
                            )}
                        </div>
                        {employeeGroups && employeeGroups.length > 0 ? (
                            <div className="space-y-4">
                                {employeeGroups.map(group => (
                                    <div key={group.id}>
                                        <h5 className="text-xs text-[#d4af37] uppercase tracking-wider mb-2 opacity-80">
                                            {group.name}
                                        </h5>
                                        <div className="flex flex-wrap gap-2">
                                            {group.employees.map(emp => {
                                                const isSelected = selectedEmployee === emp.name;
                                                return (
                                                    <button
                                                        key={emp.name}
                                                        onClick={() => setSelectedEmployee(emp.name)}
                                                        className={`px-4 py-2 rounded-full text-sm transition-all duration-200 ${isSelected
                                                            ? 'bg-[#d4af37] text-black font-bold shadow-[0_0_10px_rgba(212,175,55,0.4)] border border-[#d4af37]'
                                                            : `${emp.isActive ? 'bg-[#2a2a2a] text-gray-300' : 'bg-red-900/10 text-red-400'} border border-gray-600 hover:border-gray-400`
                                                            }`}
                                                    >
                                                        {emp.name} {!emp.isActive && '(Inactiva)'}
                                                        {emp.isShared && <span className="ml-1 text-[10px] opacity-70">🔗</span>}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-center text-gray-500 py-4">No hay actividad registrada en esta semana.</p>
                        )}
                    </div>


                    {report && (
                        <div className="animate-fade-in space-y-6">

                            {/* CONTROLES DE CORTE Y RESUMEN */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-6">

                                {/* CONTROL DE DEUDAS (NUEVO) */}
                                <div className="xl:order-last">
                                    <DebtManager
                                        authToken={authToken}
                                        employeeName={selectedEmployee}
                                        employeeUid={catalogs.empleadas.find(e => e.nombre === selectedEmployee)?.id || catalogs.users?.find(u => u.nombre === selectedEmployee)?.id}
                                        onUpdate={() => setRefreshTrigger(prev => prev + 1)}
                                        dateRange={getStartAndEndOfWeek(currentDate)}
                                    />
                                </div>

                                {/* PORCENTAJE DE CORTE */}
                                <div className="bg-[#1e1e1e] p-6 rounded-xl border border-gray-800 shadow-md flex flex-col justify-center items-center h-full">
                                    <h3 className="text-gray-400 uppercase tracking-widest text-xs mb-4">Porcentaje Empresa</h3>
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
                                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#d4af37]"
                                    />
                                    <div className="flex justify-between w-full mt-2 text-xs text-gray-500">
                                        <span>10%</span>
                                        <span>50%</span>
                                        <span>100%</span>
                                    </div>
                                    <div className="flex flex-wrap justify-center gap-2 mt-4 mb-4">
                                        {[25, 30, 35, 40, 45, 50].map(pct => (
                                            <button
                                                key={pct}
                                                onClick={() => setCommissionPercentage(pct)}
                                                className={`px-3 py-1 text-xs rounded-full border ${commissionPercentage === pct ? 'bg-[#d4af37] text-black border-[#d4af37] font-bold' : 'bg-transparent text-gray-400 border-gray-600 hover:border-gray-400'}`}
                                            >
                                                {pct}%
                                            </button>
                                        ))}
                                    </div>

                                    {!isSupervisor && (
                                        <button
                                            onClick={async () => {
                                                const emp = catalogs.users?.find(u => u.nombre === selectedEmployee && u.rol === 'empleada');
                                                if (!emp) return alert("Empleada no encontrada");

                                                if (!confirm(`¿Aplicar y guardar el porcentaje de empresa al ${commissionPercentage}% para los registros de esta semana y como valor por defecto?`)) return;

                                                setIsSavingPercentage(true);
                                                try {
                                                    const { start, end } = getStartAndEndOfWeek(currentDate);
                                                    const res = await fetch(`/api/empleadas/${emp.id}/porcentaje-corte`, {
                                                        method: 'PUT',
                                                        headers: {
                                                            'Content-Type': 'application/json',
                                                            'Authorization': `Bearer ${authToken}`
                                                        },
                                                        body: JSON.stringify({
                                                            porcentaje: commissionPercentage,
                                                            startDate: start.toISOString(),
                                                            endDate: end.toISOString()
                                                        })
                                                    });

                                                    if (!res.ok) throw new Error("Error al guardar porcentaje");

                                                    // Refrescar registros para que se recalcule el reporte
                                                    await fetchWeekRecords(true);
                                                    alert("Porcentaje guardado y aplicado a esta semana.");
                                                } catch (error) {
                                                    console.error(error);
                                                    alert("Error al aplicar porcentaje");
                                                } finally {
                                                    setIsSavingPercentage(false);
                                                }
                                            }}
                                            disabled={isSavingPercentage}
                                            className="w-full bg-[#d4af37] text-black font-bold px-4 py-2.5 rounded-xl text-xs uppercase tracking-widest hover:bg-[#b08d20] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isSavingPercentage ? "Guardando..." : "Guardar Porcentaje"}
                                        </button>
                                    )}

                                    {!isSupervisor && (
                                        <button
                                            onClick={() => setShowMultaModal(true)}
                                            className="mt-6 w-full bg-red-900/30 text-red-500 border border-red-800 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-red-900/60 transition-colors"
                                        >
                                            + Aplicar Multa Extra
                                        </button>
                                    )}

                                    {!isSupervisor && (
                                        <button
                                            onClick={() => {
                                                setCargoModo('individual');
                                                setCargoData({ limpieza: false, renta: false });
                                                setShowCargoModal(true);
                                            }}
                                            className="mt-2 w-full bg-amber-900/20 text-amber-400 border border-amber-800/60 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-amber-900/40 transition-colors"
                                        >
                                            + Aplicar Cargo a Empresa
                                        </button>
                                    )}
                                </div>

                                {/* TARJETA DE RESUMEN (OFICINA) */}
                                <div className="bg-[#1e1e1e] p-6 rounded-xl border border-[#333] shadow-md flex flex-col h-full relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-[var(--accent-gold)] rounded-full mix-blend-screen filter blur-[40px] opacity-10 pointer-events-none"></div>
                                    <div className="flex justify-between items-center border-b border-gray-700 pb-3 mb-4 relative z-10">
                                        <h3 className="text-gray-200 font-black uppercase tracking-wider text-xs flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-[var(--accent-gold)]"></div>
                                            Liquidación Jefes
                                        </h3>
                                        <span className="bg-[#2a2a2a] text-[var(--accent-gold)] px-2.5 py-1 rounded-md text-[10px] font-bold border border-gray-700">
                                            {report.officeCut.count} SERVICIOS
                                        </span>
                                    </div>

                                    <div className="flex flex-col gap-1.5 text-xs relative z-10 mb-4 flex-1">
                                        <div className="flex justify-between py-0.5">
                                            <span className="text-gray-400 font-medium">Venta Total</span>
                                            <span className="text-white font-bold">{formatCurrency(report.officeCut.ventaTotal)}</span>
                                        </div>
                                        <div className="flex justify-between py-0.5">
                                            <span className="text-gray-400 font-medium">Comisión Empresa ({commissionPercentage}%)</span>
                                            <span className="text-white font-bold">{formatCurrency(report.officeCut.baseComision)}</span>
                                        </div>
                                        <div className="flex justify-between py-0.5">
                                            <span className="text-[var(--accent-gold)] italic font-medium">↳ Efectivo</span>
                                            <span className="text-[var(--accent-gold)] font-bold">{formatCurrency(report.officeCut.efectivoTotal)}</span>
                                        </div>

                                        <div className="my-1 border-t border-gray-800"></div>

                                        {report.officeCut.multasTotal > 0 && (
                                            <div className="flex justify-between py-0.5">
                                                <span className="text-gray-400 font-medium">(-) Multas</span>
                                                <span className="text-[#ff453a] font-bold">-{formatCurrency(report.officeCut.multasTotal)}</span>
                                            </div>
                                        )}
                                        {report.officeCut.cargosTotal > 0 && (
                                            <>
                                                {report.officeRecords.filter(r => r.es_cargo && r.concepto_cargo === 'Limpieza').length > 0 && (
                                                    <div className="flex justify-between py-0.5">
                                                        <span className="text-amber-400/80 font-medium">(+) Limpieza</span>
                                                        <span className="text-amber-400 font-bold">+{formatCurrency(report.officeRecords.filter(r => r.es_cargo && r.concepto_cargo === 'Limpieza').reduce((s, r) => s + (Number(r.monto_cargo) || 0), 0))}</span>
                                                    </div>
                                                )}
                                                {report.officeRecords.filter(r => r.es_cargo && r.concepto_cargo === 'Renta del Hogar').length > 0 && (
                                                    <div className="flex justify-between py-0.5">
                                                        <span className="text-amber-400/80 font-medium">(+) Renta del Hogar</span>
                                                        <span className="text-amber-400 font-bold">+{formatCurrency(report.officeRecords.filter(r => r.es_cargo && r.concepto_cargo === 'Renta del Hogar').reduce((s, r) => s + (Number(r.monto_cargo) || 0), 0))}</span>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                        <div className="flex justify-between py-0.5">
                                            <span className="text-gray-400 font-medium">(-) Transporte</span>
                                            <div className="flex flex-col items-end">
                                                <span className="text-[#ff453a] font-bold">-{formatCurrency(report.officeCut.descuentoTransporteTotal)}</span>
                                            </div>
                                        </div>
                                        <div className="flex justify-between py-0.5">
                                            <span className="text-gray-400 font-medium">(-) Tarjeta</span>
                                            <span className="text-[#ff453a] font-bold">-{formatCurrency(report.officeCut.ventaTarjetaTotal)}</span>
                                        </div>
                                        <div className="flex justify-between py-0.5">
                                            <span className="text-gray-400 font-medium">(-) Extras</span>
                                            <span className="text-[#ff453a] font-bold">-{formatCurrency(report.officeCut.extrasCalculados)}</span>
                                        </div>
                                        <div className="flex justify-between py-0.5">
                                            <span className="text-gray-400 font-medium">(-) Membresías</span>
                                            <span className="text-[#ff453a] font-bold">-{formatCurrency(report.officeCut.membresiaTotal + report.officeCut.promocionTotal)}</span>
                                        </div>
                                    </div>

                                    <div className={`mt-auto p-3 rounded-lg flex justify-between items-center relative z-10 border ${report.officeCut.isPositive ? 'bg-green-900/10 border-green-500/30' : 'bg-red-900/10 border-red-500/30'}`}>
                                        <span className={`font-bold uppercase tracking-widest text-[10px] ${report.officeCut.isPositive ? 'text-[#30d158]' : 'text-[#ff453a]'}`}>
                                            {report.officeCut.isPositive ? 'A FAVOR EMPRESA' : 'A FAVOR EMPLEADA'}
                                        </span>
                                        <span className={`text-xl font-black ${report.officeCut.isPositive ? 'text-[#30d158]' : 'text-[#ff453a]'}`}>
                                            {formatCurrency(Math.abs(report.officeCut.result))}
                                        </span>
                                    </div>
                                </div>

                                {/* TARJETA DE RESUMEN (EMPLEADA) */}
                                <div className="bg-[#1e1e1e] p-6 rounded-xl border border-[#333] shadow-md flex flex-col h-full relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-[var(--accent-gold)] rounded-full mix-blend-screen filter blur-[40px] opacity-10 pointer-events-none"></div>
                                    <div className="flex justify-between items-center border-b border-gray-700 pb-3 mb-4 relative z-10">
                                        <div className="flex items-center gap-3">
                                            <h3 className="text-gray-200 font-black uppercase tracking-wider text-xs flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-[var(--accent-gold)] opacity-50"></div>
                                                Liquidación Emp.
                                            </h3>
                                            <span className="bg-[#2a2a2a] text-[var(--accent-gold)] px-2.5 py-1 rounded-md text-[10px] font-bold border border-gray-700">
                                                {report.employeeCut.count} SERVICIOS
                                            </span>
                                        </div>
                                        <button 
                                            onClick={handleAlertRecord}
                                            className="bg-[var(--accent-gold)] text-black hover:bg-white px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shadow-[0_0_10px_rgba(212,175,55,0.3)] hover:shadow-[0_0_15px_rgba(255,255,255,0.4)]"
                                        >
                                            CREAR ALERTA
                                        </button>
                                    </div>

                                    <div className="flex flex-col gap-1.5 text-xs relative z-10 mb-4 flex-1">
                                        <div className="flex justify-between py-0.5">
                                            <span className="text-gray-400 font-medium">Venta Total</span>
                                            <span className="text-white font-bold">{formatCurrency(report.employeeCut.ventaTotal)}</span>
                                        </div>
                                        <div className="flex justify-between py-0.5">
                                            <span className="text-gray-400 font-medium">Comisión Empresa ({commissionPercentage}%)</span>
                                            <span className="text-white font-bold">{formatCurrency(report.employeeCut.baseComision)}</span>
                                        </div>
                                        <div className="flex justify-between py-0.5">
                                            <span className="text-[var(--accent-gold)] italic font-medium">↳ Efectivo</span>
                                            <span className="text-[var(--accent-gold)] font-bold">{formatCurrency(report.employeeCut.efectivoTotal)}</span>
                                        </div>

                                        <div className="my-1 border-t border-gray-800"></div>

                                        {report.employeeCut.multasTotal > 0 && (
                                            <div className="flex justify-between py-0.5">
                                                <span className="text-gray-400 font-medium">(-) Multas</span>
                                                <span className="text-[#ff453a] font-bold">-{formatCurrency(report.employeeCut.multasTotal)}</span>
                                            </div>
                                        )}
                                        {report.employeeCut.cargosTotal > 0 && (
                                            <>
                                                {report.employeeRecords.filter(r => r.es_cargo && r.concepto_cargo === 'Limpieza').length > 0 && (
                                                    <div className="flex justify-between py-0.5">
                                                        <span className="text-amber-400/80 font-medium">(+) Limpieza</span>
                                                        <span className="text-amber-400 font-bold">+{formatCurrency(report.employeeRecords.filter(r => r.es_cargo && r.concepto_cargo === 'Limpieza').reduce((s, r) => s + (Number(r.monto_cargo) || 0), 0))}</span>
                                                    </div>
                                                )}
                                                {report.employeeRecords.filter(r => r.es_cargo && r.concepto_cargo === 'Renta del Hogar').length > 0 && (
                                                    <div className="flex justify-between py-0.5">
                                                        <span className="text-amber-400/80 font-medium">(+) Renta del Hogar</span>
                                                        <span className="text-amber-400 font-bold">+{formatCurrency(report.employeeRecords.filter(r => r.es_cargo && r.concepto_cargo === 'Renta del Hogar').reduce((s, r) => s + (Number(r.monto_cargo) || 0), 0))}</span>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                        <div className="flex justify-between py-0.5">
                                            <span className="text-gray-400 font-medium">(-) Transporte</span>
                                            <div className="flex flex-col items-end">
                                                <span className="text-[#ff453a] font-bold">-{formatCurrency(report.employeeCut.descuentoTransporteTotal)}</span>
                                            </div>
                                        </div>
                                        <div className="flex justify-between py-0.5">
                                            <span className="text-gray-400 font-medium">(-) Tarjeta</span>
                                            <span className="text-[#ff453a] font-bold">-{formatCurrency(report.employeeCut.ventaTarjetaTotal)}</span>
                                        </div>
                                        <div className="flex justify-between py-0.5">
                                            <span className="text-gray-400 font-medium">(-) Extras</span>
                                            <span className="text-[#ff453a] font-bold">-{formatCurrency(report.employeeCut.extrasCalculados)}</span>
                                        </div>
                                        <div className="flex justify-between py-0.5">
                                            <span className="text-gray-400 font-medium">(-) Membresías</span>
                                            <span className="text-[#ff453a] font-bold">-{formatCurrency(report.employeeCut.membresiaTotal + report.employeeCut.promocionTotal)}</span>
                                        </div>
                                    </div>

                                    <div className={`mt-auto p-3 rounded-lg flex justify-between items-center relative z-10 border ${report.employeeCut.isPositive ? 'bg-green-900/10 border-green-500/30' : 'bg-red-900/10 border-red-500/30'}`}>
                                        <span className={`font-bold uppercase tracking-widest text-[10px] ${report.employeeCut.isPositive ? 'text-[#30d158]' : 'text-[#ff453a]'}`}>
                                            {report.employeeCut.isPositive ? 'A FAVOR EMPRESA' : 'A FAVOR EMPLEADA'}
                                        </span>
                                        <span className={`text-xl font-black ${report.employeeCut.isPositive ? 'text-[#30d158]' : 'text-[#ff453a]'}`}>
                                            {formatCurrency(Math.abs(report.employeeCut.result))}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* TABLA COMPARATIVA DE CORTE */}
                            <div className="mt-8">
                                <CutComparisonTable
                                    officeRecords={report.officeRecords}
                                    employeeRecords={report.employeeRecords}
                                    onEdit={handleEditClick}
                                    onDelete={handleDeleteRecord}
                                    onDuplicateToEmployee={handleDuplicateToEmployee}
                                    onDuplicateToOffice={handleDuplicateToOffice}
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* MODAL MULTAS */}
            {showMultaModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-[#121212] border border-[#333] rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
                        <button onClick={() => setShowMultaModal(false)} className="absolute top-4 right-4 text-gray-500 hover:text-white">✕</button>
                        <h3 className="text-lg font-bold text-red-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <span className="w-2 h-5 bg-red-500 rounded-full inline-block"></span>
                            Agregar Multa a {selectedEmployee}
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Concepto / Motivo</label>
                                <input
                                    type="text"
                                    value={multaData.concepto}
                                    onChange={(e) => setMultaData({ ...multaData, concepto: e.target.value })}
                                    placeholder="Ej: Llegada tarde"
                                    className="w-full bg-[#0a0a0a] border border-[#333] rounded-lg px-4 py-3 text-white text-sm focus:border-red-500 outline-none transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Monto de la Multa ($)</label>
                                <input
                                    type="number"
                                    value={multaData.monto}
                                    onChange={(e) => setMultaData({ ...multaData, monto: e.target.value })}
                                    placeholder="0.00"
                                    min="0"
                                    className="w-full bg-[#0a0a0a] border border-[#333] rounded-lg px-4 py-3 text-white text-sm focus:border-red-500 outline-none transition-colors"
                                />
                            </div>

                            <button
                                onClick={handleAddMulta}
                                className="w-full mt-4 bg-red-600 hover:bg-red-500 text-white font-bold uppercase tracking-widest py-3 rounded-lg transition-colors text-sm"
                            >
                                Guardar Multa
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL CARGOS EMPRESA */}
            {showCargoModal && (() => {
                const empleadasActivas = (catalogs.users || []).filter(u => u.rol === 'empleada' && u.estado !== 'inactivo');
                return (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-[#121212] border border-amber-900/40 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative max-h-[90vh] flex flex-col">
                        <button
                            onClick={() => { setShowCargoModal(false); setCargoData({ limpieza: false, renta: false }); setCargoEmpleadasSeleccionadas([]); }}
                            className="absolute top-4 right-4 text-gray-500 hover:text-white"
                        >✕</button>

                        <h3 className="text-lg font-bold text-amber-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                            <span className="w-2 h-5 bg-amber-400 rounded-full inline-block"></span>
                            Cargo a Favor de Empresa
                        </h3>
                        <p className="text-[11px] text-gray-500 mb-5 ml-4">Este cargo suma al corte de empresa y aparece en el corte de la empleada.</p>

                        <div className="overflow-y-auto flex-1 space-y-5 pr-1">
                            {/* SELECTOR DE MODO */}
                            <div>
                                <label className="block text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-2">Aplicar a</label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setCargoModo('individual')}
                                        className={`flex-1 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest border transition-colors ${cargoModo === 'individual' ? 'bg-amber-500/20 border-amber-500 text-amber-400' : 'bg-[#1a1a1a] border-[#333] text-gray-500 hover:border-gray-500'}`}
                                    >
                                        Empleada Actual
                                    </button>
                                    <button
                                        onClick={() => {
                                            setCargoModo('todas');
                                            if (cargoEmpleadasSeleccionadas.length === 0) {
                                                setCargoEmpleadasSeleccionadas(empleadasActivas.map(u => u.nombre));
                                            }
                                        }}
                                        className={`flex-1 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest border transition-colors ${cargoModo === 'todas' ? 'bg-amber-500/20 border-amber-500 text-amber-400' : 'bg-[#1a1a1a] border-[#333] text-gray-500 hover:border-gray-500'}`}
                                    >
                                        Multiples Empleadas
                                    </button>
                                </div>
                                {cargoModo === 'individual' && selectedEmployee && (
                                    <p className="text-[11px] text-amber-400/70 mt-2 ml-1">Empleada: <span className="font-bold">{selectedEmployee}</span></p>
                                )}
                                {cargoModo === 'individual' && !selectedEmployee && (
                                    <p className="text-[11px] text-red-400/70 mt-2 ml-1">Selecciona una empleada en la lista antes de continuar.</p>
                                )}
                            </div>

                            {/* LISTA DE EMPLEADAS (modo todas) */}
                            {cargoModo === 'todas' && (
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="block text-[10px] text-gray-500 font-bold uppercase tracking-widest">Empleadas ({cargoEmpleadasSeleccionadas.length} / {empleadasActivas.length})</label>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setCargoEmpleadasSeleccionadas(empleadasActivas.map(u => u.nombre))}
                                                className="text-[10px] text-amber-400 hover:text-amber-300 font-bold uppercase tracking-widest"
                                            >Todas</button>
                                            <span className="text-gray-600 text-[10px]">|</span>
                                            <button
                                                onClick={() => setCargoEmpleadasSeleccionadas([])}
                                                className="text-[10px] text-gray-500 hover:text-gray-300 font-bold uppercase tracking-widest"
                                            >Ninguna</button>
                                        </div>
                                    </div>
                                    <div className="max-h-40 overflow-y-auto space-y-1 bg-[#0a0a0a] rounded-xl p-2 border border-[#2a2a2a]">
                                        {empleadasActivas.map(emp => {
                                            const selected = cargoEmpleadasSeleccionadas.includes(emp.nombre);
                                            return (
                                                <label
                                                    key={emp.id || emp.nombre}
                                                    className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${selected ? 'bg-amber-900/20' : 'hover:bg-[#1a1a1a]'}`}
                                                >
                                                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${selected ? 'bg-amber-500 border-amber-500' : 'border-gray-600'}`}>
                                                        {selected && (
                                                            <svg className="w-2.5 h-2.5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        )}
                                                    </div>
                                                    <span className={`text-sm font-medium ${selected ? 'text-amber-300' : 'text-gray-400'}`}>{emp.nombre}</span>
                                                    <input
                                                        type="checkbox"
                                                        className="sr-only"
                                                        checked={selected}
                                                        onChange={() => setCargoEmpleadasSeleccionadas(prev =>
                                                            selected ? prev.filter(n => n !== emp.nombre) : [...prev, emp.nombre]
                                                        )}
                                                    />
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* SELECCION DE CARGOS */}
                            <div>
                                <label className="block text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-3">Tipo de Cargo</label>
                                <div className="space-y-3">
                                    {[
                                        { key: 'limpieza', label: 'Limpieza', monto: 650 },
                                        { key: 'renta', label: 'Renta del Hogar', monto: 500 },
                                    ].map(item => (
                                        <label
                                            key={item.key}
                                            className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${cargoData[item.key] ? 'bg-amber-900/20 border-amber-700/60' : 'bg-[#1a1a1a] border-[#2a2a2a] hover:border-gray-600'}`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${cargoData[item.key] ? 'bg-amber-500 border-amber-500' : 'border-gray-600'}`}>
                                                    {cargoData[item.key] && (
                                                        <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    )}
                                                </div>
                                                <span className={`text-sm font-bold uppercase tracking-wide ${cargoData[item.key] ? 'text-amber-300' : 'text-gray-400'}`}>{item.label}</span>
                                            </div>
                                            <span className={`text-sm font-black ${cargoData[item.key] ? 'text-amber-400' : 'text-gray-500'}`}>
                                                ${item.monto.toLocaleString('es-CO')}
                                            </span>
                                            <input
                                                type="checkbox"
                                                className="sr-only"
                                                checked={cargoData[item.key]}
                                                onChange={() => setCargoData(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                                            />
                                        </label>
                                    ))}
                                </div>

                                {(cargoData.limpieza || cargoData.renta) && (
                                    <div className="mt-3 p-3 bg-amber-900/10 border border-amber-800/30 rounded-lg flex justify-between items-center">
                                        <span className="text-[11px] text-gray-400 uppercase tracking-widest font-bold">
                                            {cargoModo === 'todas' ? `Total c/empleada` : 'Total a aplicar'}
                                        </span>
                                        <span className="text-amber-400 font-black text-base">
                                            ${((cargoData.limpieza ? 650 : 0) + (cargoData.renta ? 500 : 0)).toLocaleString('es-CO')}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <button
                            onClick={handleAddCargo}
                            disabled={isApplyingCargos || (!cargoData.limpieza && !cargoData.renta) || (cargoModo === 'todas' && cargoEmpleadasSeleccionadas.length === 0)}
                            className="mt-5 w-full bg-amber-600 hover:bg-amber-500 disabled:bg-amber-900/30 disabled:text-amber-700 disabled:cursor-not-allowed text-black font-black uppercase tracking-widest py-3 rounded-lg transition-colors text-sm flex-shrink-0"
                        >
                            {isApplyingCargos
                                ? 'Aplicando...'
                                : cargoModo === 'todas'
                                    ? `Aplicar a ${cargoEmpleadasSeleccionadas.length} Empleada${cargoEmpleadasSeleccionadas.length !== 1 ? 's' : ''}`
                                    : 'Aplicar Cargo'}
                        </button>
                    </div>
                </div>
                );
            })()}


            {/* MODAL GALERÍA */}
            {galleryState.isOpen && (
                <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center animate-fade-in p-4" onClick={() => setGalleryState(prev => ({ ...prev, isOpen: false }))}>
                    <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
                        <img
                            src={galleryState.images[galleryState.currentIndex]}
                            alt={`Comprobante ${galleryState.currentIndex + 1}`}
                            className="max-w-full max-h-[80vh] object-contain border-2 border-gray-800 rounded-lg shadow-2xl"
                        />
                        {galleryState.images.length > 1 && (
                            <div className="flex items-center gap-6 mt-6 bg-[#1a1a1a] px-6 py-3 rounded-full border border-gray-800">
                                <button className="text-white hover:text-[#d4af37] text-xl font-bold p-2 transition-colors" onClick={(e) => { e.stopPropagation(); setGalleryState(prev => ({ ...prev, currentIndex: (prev.currentIndex - 1 + prev.images.length) % prev.images.length })); }}>❮</button>
                                <span className="text-gray-300 font-medium tracking-widest text-sm">{galleryState.currentIndex + 1} / {galleryState.images.length}</span>
                                <button className="text-white hover:text-[#d4af37] text-xl font-bold p-2 transition-colors" onClick={(e) => { e.stopPropagation(); setGalleryState(prev => ({ ...prev, currentIndex: (prev.currentIndex + 1) % prev.images.length })); }}>❯</button>
                            </div>
                        )}
                        <button className="absolute -top-12 right-0 text-white hover:text-red-500 font-bold tracking-widest text-sm uppercase transition-colors" onClick={() => setGalleryState(prev => ({ ...prev, isOpen: false }))}>
                            Cerrar ✕
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
