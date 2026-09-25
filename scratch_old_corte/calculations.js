// src/utils/calculations.js

// --- Fechas ---
export function getStartAndEndOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    // Ajuste: si es domingo (0), lo tratamos como día 7
    const adjustedDay = day === 0 ? 7 : day;
    // Restamos los días para llegar al lunes (día 1)
    const diff = d.getDate() - adjustedDay + 1;
    const startOfWeek = new Date(d.setDate(diff));
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    return { start: startOfWeek, end: endOfWeek };
}

export function getStartAndEndOfMonth(date) {
    const d = new Date(date);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
}

export function getCorrectWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

export function getWeekStringFromDate(date) {
    const weekNum = getCorrectWeekNumber(date);
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const year = d.getUTCFullYear();
    return `${year}-W${weekNum}`;
}

// --- Formatos ---

export const formatCurrency = (value) =>
    `$${(value || 0).toLocaleString('es-CO')}`;

export const formatDate = (dateString) =>
    new Date(dateString).toLocaleDateString('es-CO', { dateStyle: 'short' });

export const formatDateTime = (dateString) =>
    new Date(dateString).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });

// --- Ordenamiento ---

export function sortRecordsByServiceNumber(records) {
    return [...records].sort((a, b) => {
        const countA = a.contador_servicio || Infinity;
        const countB = b.contador_servicio || Infinity;
        if (countA !== countB) return countA - countB;
        return new Date(b.fecha) - new Date(a.fecha);
    });
}
export function procesarDatosTransporteFrontend(data) {
    const usuarioPago = data.usuarioPago === true;
    const montoPagado = usuarioPago ? (parseFloat(data.montoPagado) || 0) : 0;

    const choferIdaNombre = data.choferIda;
    const choferRegresoNombre = data.choferRegreso;

    // Lógica Simple solicitada:
    // Si el usuario picó el botón "Pagué", el gasto es ese monto.
    // Ese gasto se mapea a 'gastoEmpresa' para que el sistema de corte lo reste automáticamente
    // (ya que la fórmula resta 'gasto_transporte_empresa').

    let gastoEmpresa = 0;
    if (usuarioPago) {
        gastoEmpresa = montoPagado;
    } else {
        // Si NO picó el botón, asumimos costo 0 para el corte
        // (La empresa paga al chofer por fuera o no se cobra a la chica).
        gastoEmpresa = 0;
    }

    // Retornamos estructura compatible con el backend
    return {
        // Campos de control visual
        usuarioPago,
        montoPagado,

        // Campos para el backend (Mapeo)
        choferIdaNombre,
        choferRegresoNombre,

        // Aquí está la clave: mapeamos el pago manual al campo de deducción
        gastoEmpresa: gastoEmpresa,

        // Campos legacy (en desuso con la nueva lógica, pero los mandamos en 0/false para limpiar)
        clientePago: false,
        montoCliente: 0,
        esServicioLejano: false,
        excedente: 0, // Ya no usamos excedente automático, todo es gasto directo si ella paga
        pagadoInmediato: false,

        // Strings visuales
        tipoIda: choferIdaNombre ? "asignado" : "ninguno",
        tipoRegreso: choferRegresoNombre ? "asignado" : "ninguno"
    };
}
// --- Resúmenes ---

export function calculateEmployeeSummaryTotals(records) {
    let ventaTotal = 0, totalEfectivo = 0, totalTarjeta = 0, extras = 0, gastoUber = 0, promociones = 0, membresias = 0;

    records.forEach(r => {
        // CORRECCIÓN: Usamos 'gasto_transporte_empresa' que es lo que realmente paga la empleada (según ServiceForm)
        // en lugar de los campos legacy 'uber_ida'/'uber_regreso' que ya no se llenan igual.
        gastoUber += (Number(r.gasto_transporte_empresa) || 0) + (Number(r.excedente_transporte) || 0);

        if (r.cancelado) return;

        const venta = Number(r.total_servicio) || 0
        ventaTotal += venta;
        extras += Number(r.extra) || 0;
        if (r.promocion) promociones++;
        if (r.metodo_pago === 'membresia') membresias++;

        let tarjetasSum = 0;
        if (r.metodo_pago === 'tarjeta' || r.metodo_pago === 'mixto') {
            const m1 = Number(r.monto_tarjeta) || (r.metodo_pago === 'tarjeta' ? venta : 0);
            tarjetasSum = m1 + (Number(r.monto_tarjeta_2) || 0) + (Number(r.monto_tarjeta_3) || 0) + (Number(r.monto_tarjeta_4) || 0) + (Number(r.monto_tarjeta_5) || 0);
            totalTarjeta += tarjetasSum;
        }

        if (r.metodo_pago === 'efectivo') {
            totalEfectivo += venta;
        } else if (r.metodo_pago === 'mixto') {
            totalEfectivo += Number(r.monto_efectivo) || 0;
        }
    });

    return { ventaTotal, totalEfectivo, totalTarjeta, extras, gastoUber, promociones, membresias };
}

// MODIFICADO: Ahora acepta driverRecords para cálculo exacto de choferes
export function calculateDashboardMetrics(records, bancos, driverRecords = []) {
    const employeeMetrics = {};
    let totalIngresos = 0, totalEfectivo = 0, totalTarjeta = 0, totalUber = 0, totalExtras = 0;
    let totalDeudaChoferes = 0;
    let totalReembolsos = 0;
    let totalMembresias = 0, totalPromociones = 0;

    const ingresosPorBanco = (bancos || []).reduce((acc, banco) => ({ ...acc, [banco.nombre]: 0 }), {});
    const weeklySummaryByEmployee = {};

    // 1. Procesar Registros Generales (Oficina y Empleadas)
    records.forEach(r => {
        if (r.nombre_empleada) {
            const employeeName = r.nombre_empleada;
            if (!weeklySummaryByEmployee[employeeName]) {
                weeklySummaryByEmployee[employeeName] = { name: employeeName, office: 0, employee: 0 };
            }
            if (r.rol_registrador === 'jefe' || r.rol_registrador === 'admin' || r.rol_registrador === 'valeria') {
                weeklySummaryByEmployee[employeeName].office++;
            } else if (r.rol_registrador === 'empleada') {
                weeklySummaryByEmployee[employeeName].employee++;
            }
        }
    });

    const officeRecords = records.filter(r => r.rol_registrador === 'jefe' || r.rol_registrador === 'admin' || r.rol_registrador === 'valeria');

    officeRecords.forEach(r => {
        if (r.cancelado || !r.nombre_empleada) return;

        const key = r.nombre_empleada;
        if (!employeeMetrics[key]) {
            employeeMetrics[key] = {
                nombre: r.nombre_empleada, servicios: 0, ventaTotal: 0,
                totalTarjeta: 0, totalEfectivo: 0, gastoUber: 0, extras: 0,
            };
        }

        const metrics = employeeMetrics[key];
        const venta = Number(r.total_servicio) || 0;
        const extra = Number(r.extra) || 0;

        // CORRECCIÓN REEMBOLSOS: Solo lo que se registró como pagado por la empresa/chica en registros de jefe
        let reembolso = Number(r.gasto_transporte_empresa) || 0;

        // Sumamos al global de reembolsos
        totalReembolsos += reembolso;

        // NOTA: Ya no calculamos deuda de choferes "imaginaria" aquí.
        // Se calcula abajo usando driverRecords reales.

        // Para la métrica individual de la empleada, seguimos mostrando reembolso como su gasto asociado
        // (Opcional: Si quisieras ser muy estricto, aquí solo sumarías reembolso, pero dejaremos reembolso por compatibilidad visual individual)
        metrics.servicios++;
        metrics.ventaTotal += venta;
        metrics.extras += extra;
        metrics.gastoUber += reembolso;

        totalIngresos += venta;
        totalExtras += extra;

        if (r.promocion) totalPromociones += 300;

        // CÁLCULO DE MÉTODOS DE PAGO
        let pagoTotalConTarjeta = 0;

        for (let i = 1; i <= 5; i++) {
            const montoField = i === 1 ? 'monto_tarjeta' : `monto_tarjeta_${i}`;
            const bancoField = i === 1 ? 'banco' : `banco_${i}`;
            const monto = Number(r[montoField]) || 0;

            if (monto > 0) {
                pagoTotalConTarjeta += monto;
                if (r[bancoField] && ingresosPorBanco.hasOwnProperty(r[bancoField])) {
                    ingresosPorBanco[r[bancoField]] += monto;
                }
            }
        }

        if (r.metodo_pago === 'tarjeta' && pagoTotalConTarjeta === 0 && venta > 0) {
            pagoTotalConTarjeta = venta;
            if (r.banco && ingresosPorBanco.hasOwnProperty(r.banco)) {
                ingresosPorBanco[r.banco] += pagoTotalConTarjeta;
            }
        }

        if (r.metodo_pago === 'tarjeta' || r.metodo_pago === 'mixto') {
            metrics.totalTarjeta += pagoTotalConTarjeta;
            totalTarjeta += pagoTotalConTarjeta;
        }

        if (r.metodo_pago === 'efectivo') {
            metrics.totalEfectivo += venta;
            totalEfectivo += venta;
        } else if (r.metodo_pago === 'mixto') {
            const efectivo = Number(r.monto_efectivo) || 0;
            metrics.totalEfectivo += efectivo;
            totalEfectivo += efectivo;
        } else if (r.metodo_pago === 'membresia') {
            // CORRECCIÓN INGRESOS: Sumamos membresías aquí para mostrarlas en el KPI
            totalMembresias += venta;
        }
    });

    // 2. CORRECCIÓN CHOFERES: Calcular deuda real con la misma lógica de validación de AdminChoferesPage
    const isSameDay = (d1, d2) => {
        if (!d1 || !d2) return false;
        const logicalD1 = new Date(new Date(d1).getTime() - 6 * 60 * 60 * 1000);
        const logicalD2 = new Date(new Date(d2).getTime() - 6 * 60 * 60 * 1000);
        return logicalD1.getFullYear() === logicalD2.getFullYear() &&
               logicalD1.getMonth() === logicalD2.getMonth() &&
               logicalD1.getDate() === logicalD2.getDate();
    };
    const normalizeStr = (str) => (str || "").trim().toLowerCase();
    const isLocal = (dest) => {
        const d = normalizeStr(dest);
        return d === 'magestic' || d === 'montecarlo' || d === 'majestic';
    };

    const jefeRecords = records.filter(r => r.rol_registrador === 'jefe' || r.rol_registrador === 'admin' || r.rol_registrador === 'valeria');
    const empleadaRecords = records.filter(r => r.rol_registrador === 'empleada');

    const availableJefeRecords = [...jefeRecords].map(r => ({ ...r, _usos: 0 }));
    const availableEmpleadaRecords = [...empleadaRecords].map(r => ({ ...r, _usos: 0 }));

    const matchAndConsume = (driverTicket, availableList) => {
        const driverLoc = isLocal(driverTicket.lugar);
        let matchIdx = availableList.findIndex(r => {
            if (!r || r._usos >= 2) return false;
            if (!isSameDay(r.fecha, driverTicket.fecha)) return false;
            if (normalizeStr(r.nombre_empleada) !== normalizeStr(driverTicket.nombre_empleada)) return false;
            if (isLocal(r.lugar) !== driverLoc) return false;
            return true;
        });
        if (matchIdx === -1) {
            matchIdx = availableList.findIndex(r => {
                if (!r || r._usos >= 2) return false;
                if (!isSameDay(r.fecha, driverTicket.fecha)) return false;
                if (normalizeStr(r.nombre_empleada) !== normalizeStr(driverTicket.nombre_empleada)) return false;
                return true;
            });
        }
        if (matchIdx !== -1) {
            const match = availableList[matchIdx];
            match._usos += 1;
            return match;
        }
        return null;
    };

    const evalDiscrepancy = (driverDest, matchTicket, driverTicket, availableList) => {
        if (!matchTicket) {
            const jefeSiLaRegistro = availableList.some(r => 
                isSameDay(r.fecha, driverTicket.fecha) && 
                normalizeStr(r.nombre_empleada) === normalizeStr(driverTicket.nombre_empleada)
            );
            return jefeSiLaRegistro ? 'Exceso de Viajes' : 'Sin Registro';
        }
        return isLocal(driverDest) === isLocal(matchTicket.lugar) ? 'Coincide' : 'Discrepancia Destino';
    };

    driverRecords.forEach(ticket => {
        const choferNombre = (ticket.chofer_nombre || "").trim();
        if (!choferNombre) return;

        const driverDest = normalizeStr(ticket.lugar);
        const jefeMatch = matchAndConsume(ticket, availableJefeRecords);
        const empleadaMatch = matchAndConsume(ticket, availableEmpleadaRecords);

        const estadoJefe = evalDiscrepancy(driverDest, jefeMatch, ticket, availableJefeRecords);
        const estadoEmpleada = evalDiscrepancy(driverDest, empleadaMatch, ticket, availableEmpleadaRecords);

        const validaJefe = estadoJefe === 'Coincide';
        const validaEmpleada = estadoEmpleada === 'Coincide';
        
        // Se cuenta si el chofer dice que es Local, sin importar si coincide con Jefe/Empleada
        if (isLocal(driverDest)) {
            totalDeudaChoferes += 60;
        }
    });

    // Actualizamos el totalUber global (Gastos Operativos) con la suma real
    totalUber = totalReembolsos + totalDeudaChoferes;

    const sortedAnalytics = Object.values(employeeMetrics).sort((a, b) => b.ventaTotal - a.ventaTotal);
    const sortedWeeklySummary = Object.values(weeklySummaryByEmployee).sort((a, b) => a.name.localeCompare(b.name));

    return {
        ranking: sortedAnalytics,
        analiticas: sortedAnalytics,
        kpis: {
            // CORRECCIÓN INGRESOS: Agregamos membresías al desglose
            ingresos: {
                total: totalIngresos,
                efectivo: totalEfectivo,
                tarjeta: totalTarjeta,
                membresias: totalMembresias
            },
            bancos: ingresosPorBanco,
            gastos: {
                uber: totalUber,
                deudaChoferes: totalDeudaChoferes, // Dato real de registros_choferes
                reembolsos: totalReembolsos,       // Dato real de registros de jefe
                extras: totalExtras,
                membresias: totalMembresias,
                promociones: totalPromociones
            }
        },
        weeklySummaryByEmployee: sortedWeeklySummary
    };
}

// ... (código anterior igual)

// Se añade tarifaBase por defecto 2500 para compatibilidad, pero ahora recibe el valor dinámico
export function calculateCutReport(records, employeeName, simulationPercentage = null, tarifaBase = 2500) {
    // REGRESO AL MODELO DE TABLA COMPARATIVA
    // Filtramos todos los de la empleada
    const empRecords = records.filter(r => r.nombre_empleada === employeeName).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    // Separamos: Los capturados por jefe/admin VS los capturados por empleada
    // Las MULTAS (es_multa) y los CARGOS (es_cargo) se incluyen en AMBOS para que afecten
    // tanto el corte de la oficina como el de la empleada (suman a favor de empresa).
    const officeRecords = empRecords.filter(r => r.rol_registrador === 'jefe' || r.rol_registrador === 'admin' || r.rol_registrador === 'valeria' || r.es_multa || r.es_cargo).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    const employeeRecords = empRecords.filter(r => r.rol_registrador === 'empleada' || r.es_multa || r.es_cargo).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    // Valid records se mantiene por compatibilidad, pero el frontend decidirá cuál usar
    const validRecords = officeRecords;

    const calculate = (recs) => {
        let ventaTotal = 0;
        let descuentoTransporteTotal = 0;
        let ventaTarjetaTotal = 0;
        let extrasCalculados = 0;
        let membresiaTotal = 0;
        let promocionTotal = 0;
        let efectivoTotal = 0;
        let multasTotal = 0;
        let cargosTotal = 0;
        let viajesCercanosCount = 0;
        let viajesCercanosCosto = 0;

        recs.forEach(r => {
            if (r.es_multa) {
                multasTotal += Number(r.monto_multa) || 0;
                return;
            }

            if (r.es_cargo) {
                cargosTotal += Number(r.monto_cargo) || 0;
                return;
            }

            // --- Transporte Empresa ---
            let gastoEmpresa = Number(r.gasto_transporte_empresa) || 0;
            const excedente = Number(r.excedente_transporte) || 0;

            // Detección automática de "Viaje Cercano" (Majestic/Montecarlo)
            if (!r.cancelado) {
                const destino = (r.lugar || '').trim().toLowerCase();
                if (destino === 'montecarlo' || destino === 'magestic' || destino === 'majestic') {
                    let costoCalculado = 0;
                    if (r.chofer_ida || r.chofer_ida_nombre) costoCalculado += 60;
                    if (r.chofer_regreso || r.chofer_regreso_nombre) costoCalculado += 60;

                    if (costoCalculado > 0) {
                        viajesCercanosCount += 1;
                        viajesCercanosCosto += costoCalculado;
                        // Eliminamos la asignación automática de gastoEmpresa
                        // para que los viajes cercanos NO afecten el corte de empleadas
                    }
                }
            }

            descuentoTransporteTotal += (gastoEmpresa + excedente);

            if (r.cancelado) return;

            let valorServicio = Number(r.total_servicio) || 0;
            let tarjetaEnEsteRegistro = 0;
            for (let i = 1; i <= 5; i++) {
                const field = i === 1 ? 'monto_tarjeta' : `monto_tarjeta_${i}`;
                tarjetaEnEsteRegistro += Number(r[field]) || 0;
            }
            ventaTarjetaTotal += tarjetaEnEsteRegistro;

            // --- LÓGICA DE MEMBRESÍAS ---
            let costoMembresiaRegistro = 0;

            if (r.metodo_pago === 'membresia') {
                costoMembresiaRegistro = valorServicio;
            }
            else if (r.metodo_pago === 'mixto') {
                const horas = Number(r.horas_membresia) || 0;
                if (horas > 0 || r.membresia_id) {
                    // El valor de la membresía en mixto es lo que falta para llegar al total
                    const efectivoIngresado = Number(r.monto_efectivo) || 0;
                    costoMembresiaRegistro = valorServicio - (efectivoIngresado + tarjetaEnEsteRegistro);
                    if (costoMembresiaRegistro < 0) costoMembresiaRegistro = 0;
                }
            }
            membresiaTotal += costoMembresiaRegistro;

            if (r.promocion) {
                valorServicio += 300;
                promocionTotal += 300;
            }

            ventaTotal += valorServicio;

            const extra = Number(r.extra) || 0;
            extrasCalculados += (extra >= 1000) ? (extra * 0.85) : extra;

            // --- ACUMULACIÓN DE EFECTIVO ---
            if (r.metodo_pago === 'efectivo') {
                efectivoTotal += Number(r.total_servicio) || 0;
            } else if (r.metodo_pago === 'mixto') {
                efectivoTotal += Number(r.monto_efectivo) || 0;
            }
        });

        // ---------------------------------------------------------
        // CORRECCIÓN: ELIMINAMOS LA RESTA QUE DESCUADRABA
        // efectivoTotal = efectivoTotal - membresiaTotal;  <-- BORRADO
        // Ahora 'efectivoTotal' es puro dinero físico.
        // ---------------------------------------------------------

        // El 'result' final (A Favor Empresa/Empleada) SÍ lleva la resta de membresía,
        // porque ahí estamos calculando utilidades, no flujo de caja.

        // CALCULO INMUTABLE DE COMISION DE EMPRESA:
        // En lugar de usar una variable global, sumamos ticket por ticket basándonos en el porcentaje histórico
        let comisionEmpresaAcumulada = 0;
        recs.forEach(r => {
            if (r.cancelado || r.es_multa || r.es_cargo) return;
            const pct = simulationPercentage !== null ? simulationPercentage : (r.porcentaje_empresa_aplicado != null ? Number(r.porcentaje_empresa_aplicado) : 40);
            const valorServicio = Number(r.total_servicio) || 0;
            let promo = r.promocion ? 300 : 0;
            comisionEmpresaAcumulada += (valorServicio + promo) * (pct / 100);
        });

        const result = comisionEmpresaAcumulada - descuentoTransporteTotal - ventaTarjetaTotal - extrasCalculados - membresiaTotal - promocionTotal + multasTotal + cargosTotal;

        return {
            ventaTotal,
            multasTotal,
            cargosTotal,
            efectivoTotal, // Se devuelve el efectivo puro
            baseComision: comisionEmpresaAcumulada,
            descuentoTransporteTotal,
            ventaTarjetaTotal,
            extrasCalculados,
            membresiaTotal,
            promocionTotal,
            viajesCercanosCount,
            viajesCercanosCosto,
            result,
            isPositive: result > 0,
            count: recs.length
        };
    };

    const officeCut = calculate(officeRecords);
    const employeeCut = calculate(employeeRecords);
    const finalCut = calculate(validRecords);

    return {
        officeCut,
        employeeCut,
        finalCut,
        officeRecords,
        employeeRecords,
        validRecords
    };
}
