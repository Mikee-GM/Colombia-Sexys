export function getStartAndEndOfWeek(date: Date) {
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

export function getStartAndEndOfMonth(date: Date) {
  const d = new Date(date);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function getCorrectWeekNumber(d: Date) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function getWeekStringFromDate(date: Date) {
  const weekNum = getCorrectWeekNumber(date);
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const year = d.getUTCFullYear();
  return `${year}-W${weekNum}`;
}

export const formatCurrency = (value: number | string | null | undefined) =>
  `$${(Number(value) || 0).toLocaleString("es-CO")}`;

export const formatDate = (dateString: string | Date) =>
  new Date(dateString).toLocaleDateString("es-CO", { dateStyle: "short" });

export const formatDateTime = (dateString: string | Date) =>
  new Date(dateString).toLocaleString("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
  });

export function sortRecordsByServiceNumber(records: any[]) {
  return [...records].sort((a, b) => {
    const countA = a.contador_servicio || Infinity;
    const countB = b.contador_servicio || Infinity;
    if (countA !== countB) return countA - countB;
    return new Date(b.fecha).getTime() - new Date(a.fecha).getTime();
  });
}

export function calculateCutReport(
  records: any[],
  employeeName: string,
  tarifaBase = 2500,
) {
  // Filtramos todos los de la empleada
  const empRecords = records
    .filter((r) => r.nombre_empleada === employeeName)
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  // Separamos: Los capturados por jefe/admin VS los capturados por empleada
  const officeRecords = empRecords
    .filter(
      (r) =>
        r.rol_registrador === "jefe" ||
        r.rol_registrador === "admin" ||
        r.rol_registrador === "valeria" ||
        r.es_multa,
    )
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  const employeeRecords = empRecords
    .filter((r) => r.rol_registrador === "empleada" || r.es_multa)
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  const validRecords = officeRecords;

  const calculate = (recs: any[]) => {
    let ventaTotal = 0;
    let descuentoTransporteTotal = 0;
    let ventaTarjetaTotal = 0;
    let extrasCalculados = 0;
    let membresiaTotal = 0;
    let promocionTotal = 0;
    let efectivoTotal = 0;
    let multasTotal = 0;
    let viajesCercanosCount = 0;
    let viajesCercanosCosto = 0;

    recs.forEach((r) => {
      if (r.es_multa) {
        multasTotal += Number(r.monto_multa) || 0;
        return;
      }

      // --- Transporte Empresa ---
      let gastoEmpresa = Number(r.gasto_transporte_empresa) || 0;
      const excedente = Number(r.excedente_transporte) || 0;

      // Detección automática de "Viaje Cercano" (Majestic/Montecarlo)
      if (!r.cancelado) {
        const destino = (r.lugar || "").trim().toLowerCase();
        if (
          destino === "montecarlo" ||
          destino === "magestic" ||
          destino === "majestic"
        ) {
          let costoCalculado = 0;
          if (r.chofer_ida || r.chofer_ida_nombre) costoCalculado += 60;
          if (r.chofer_regreso || r.chofer_regreso_nombre) costoCalculado += 60;

          if (costoCalculado > 0) {
            viajesCercanosCount += 1;
            viajesCercanosCosto += costoCalculado;
            // Si no se puso manualmente el gasto, lo asignamos automáticamente
            if (gastoEmpresa === 0) {
              gastoEmpresa = costoCalculado;
            }
          }
        }
      }

      descuentoTransporteTotal += gastoEmpresa + excedente;

      if (r.cancelado) return;

      let valorServicio = Number(r.total_servicio) || 0;
      let tarjetaEnEsteRegistro = 0;
      for (let i = 1; i <= 5; i++) {
        const field = i === 1 ? "monto_tarjeta" : `monto_tarjeta_${i}`;
        tarjetaEnEsteRegistro += Number(r[field]) || 0;
      }
      ventaTarjetaTotal += tarjetaEnEsteRegistro;

      // --- LÓGICA DE MEMBRESÍAS ---
      let costoMembresiaRegistro = 0;

      if (r.metodo_pago === "membresia") {
        costoMembresiaRegistro = valorServicio;
      } else if (r.metodo_pago === "mixto") {
        const horas = Number(r.horas_membresia) || 0;
        if (horas > 0 || r.membresia_id) {
          const efectivoIngresado = Number(r.monto_efectivo) || 0;
          costoMembresiaRegistro =
            valorServicio - (efectivoIngresado + tarjetaEnEsteRegistro);
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
      extrasCalculados += extra >= 1000 ? extra * 0.85 : extra;

      // --- ACUMULACIÓN DE EFECTIVO ---
      if (r.metodo_pago === "efectivo") {
        efectivoTotal += Number(r.total_servicio) || 0;
      } else if (r.metodo_pago === "mixto") {
        efectivoTotal += Number(r.monto_efectivo) || 0;
      }
    });

    let comisionEmpresaAcumulada = 0;
    recs.forEach((r) => {
      if (r.cancelado || r.es_multa) return;
      const pct =
        r.porcentaje_empresa_aplicado !== undefined
          ? Number(r.porcentaje_empresa_aplicado)
          : 40;
      const valorServicio = Number(r.total_servicio) || 0;
      let promo = r.promocion ? 300 : 0;
      comisionEmpresaAcumulada += (valorServicio + promo) * (pct / 100);
    });

    const result =
      comisionEmpresaAcumulada -
      descuentoTransporteTotal -
      ventaTarjetaTotal -
      extrasCalculados -
      membresiaTotal -
      promocionTotal +
      multasTotal;

    return {
      ventaTotal,
      multasTotal,
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
      count: recs.length,
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
    validRecords,
  };
}
