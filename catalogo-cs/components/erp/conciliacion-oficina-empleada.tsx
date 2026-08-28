import {
  ErpTable,
  Th,
  Td,
  Panel,
  Empty,
  StatusBadge,
  codigoServicio,
  RecordLink,
} from "@/components/erp/primitives";
import { formatCurrency } from "@/lib/calculations";
import type { LiquidationReport } from "@/components/liquidations/types";

/**
 * Tabla de conciliacion: por cada servicio que registro la oficina o la
 * empleada, muestra ambos montos lado a lado. Solo entran los que NO cuadran
 * -- si las dos partes coinciden en todo, no hay nada que revisar.
 *
 * Antes de esto, `report.discrepancy` avisaba de una diferencia agregada
 * ("hay $X de diferencia en algun lado") sin decir en cual servicio, asi que
 * revisarla a mano era releer registro por registro.
 */
export default function ConciliacionOficinaEmpleada({
  report,
}: {
  report: LiquidationReport;
}) {
  const filas = report.serviceDiscrepancies ?? [];
  if (filas.length === 0) return null;

  return (
    <Panel
      title="Conciliación oficina y empleada"
      subtitle={`${filas.length} servicio${filas.length === 1 ? "" : "s"} con diferencias por revisar`}
    >
      <ErpTable>
        <thead>
          <tr>
            <Th>Servicio</Th>
            <Th numeric>Registró la oficina</Th>
            <Th numeric>Registró la empleada</Th>
            <Th numeric>Diferencia</Th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={fila.serviceId}>
              <Td>
                <RecordLink href={`/admin/services?serviceId=${fila.serviceId}`}>
                  {codigoServicio(fila.serviceId)}
                </RecordLink>
              </Td>
              <Td numeric>
                {fila.officeTotal === null ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Empty />
                    <StatusBadge tone="red">sin registrar</StatusBadge>
                  </span>
                ) : (
                  formatCurrency(fila.officeTotal)
                )}
              </Td>
              <Td numeric>
                {fila.employeeTotal === null ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Empty />
                    <StatusBadge tone="red">sin registrar</StatusBadge>
                  </span>
                ) : (
                  formatCurrency(fila.employeeTotal)
                )}
              </Td>
              <Td numeric className="font-semibold text-amber-400">
                {formatCurrency(Math.abs(fila.difference))}
              </Td>
            </tr>
          ))}
        </tbody>
      </ErpTable>
      <p className="mt-4 text-[13px] leading-relaxed text-zinc-500">
        Diferencia total de {formatCurrency(Math.abs(report.discrepancy.difference))}{" "}
        entre lo que registró la oficina y lo que registró la empleada.
        Conviene resolver estos servicios antes de confirmar la semana.
      </p>
    </Panel>
  );
}
