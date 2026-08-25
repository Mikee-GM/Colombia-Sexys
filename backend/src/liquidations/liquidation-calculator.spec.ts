import { LiquidationRecord } from './entities/liquidation-record.entity';
import { buildCutReport, calculateCut } from './liquidation-calculator';

function record(overrides: Partial<LiquidationRecord> = {}) {
  return {
    sourceRole: 'admin',
    serviceTotal: 2500,
    paymentMethod: 'efectivo',
    cashAmount: 0,
    cardAmounts: [],
    companyPercentage: 40,
    extraAmount: 0,
    electronicExtraAmount: 0,
    promotion: false,
    membershipAmount: 0,
    companyTransportExpense: 0,
    transportExcess: 0,
    place: null,
    hasOutboundDriver: false,
    hasReturnDriver: false,
    cancelled: false,
    isFine: false,
    fineAmount: 0,
    ...overrides,
  } as LiquidationRecord;
}

describe('liquidation calculator', () => {
  it('calcula la participación semanal sin aplicar la entrega de efectivo', () => {
    const result = calculateCut([record()]);

    expect(result.result).toBe(-1500);
    expect(result.employeeGrossPay).toBe(1500);
    expect(result.direction).toBe('company_owes_employee');
    expect(result.cashTotal).toBe(2500);
  });

  it('no acumula error de flotante al sumar muchos importes con decimales', () => {
    // 0.1 + 0.2 !== 0.3 en flotante binario. Con 300 registros de 0.10 el
    // acumulador anterior se desviaba del total exacto; en centavos no.
    const records = Array.from({ length: 300 }, () =>
      record({ serviceTotal: 0.1, companyPercentage: 0 }),
    );

    const result = calculateCut(records);

    expect(result.salesTotal).toBe(30);
    expect(result.cashTotal).toBe(30);
  });

  it('redondea la comision al centavo en vez de arrastrar decimales', () => {
    const result = calculateCut([
      record({ serviceTotal: 33.33, companyPercentage: 33 }),
    ]);

    // 33.33 * 0.33 = 10.9989 -> 11.00
    expect(result.companyCommission).toBe(11);
    // La parte de la empleada es el resto: 33.33 * 0.67 = 22.3311 -> 22.33
    expect(result.result).toBe(-22.33);
  });

  it('identifica tarjeta que la empresa debe pagar a la empleada', () => {
    const result = calculateCut([
      record({ paymentMethod: 'tarjeta', cardAmounts: [2500] }),
    ]);

    expect(result.result).toBe(-1500);
    expect(result.direction).toBe('company_owes_employee');
  });

  it('ignora venta y comisión de cancelados pero conserva transporte', () => {
    const result = calculateCut([
      record({ cancelled: true, companyTransportExpense: 120 }),
    ]);

    expect(result.salesTotal).toBe(0);
    expect(result.companyCommission).toBe(0);
    expect(result.transportTotal).toBe(120);
    expect(result.result).toBe(0);
  });

  it('calcula transporte cercano cuando no existe gasto manual', () => {
    const result = calculateCut([
      record({
        place: 'Majestic',
        hasOutboundDriver: true,
        hasReturnDriver: true,
      }),
    ]);

    expect(result.nearbyTripsCount).toBe(1);
    expect(result.nearbyTripsCost).toBe(120);
    expect(result.transportTotal).toBe(120);
  });

  /**
   * El fallo que cubre esta prueba: los extras son integros de la empleada,
   * pero a partir de mil se le retenia un 15 %. La casa se quedaba parte de
   * algo que es suyo por completo y, como la hoja mostraba el numero ya
   * recortado, la retencion no aparecia por ningun lado.
   */
  it('paga los extras completos a la empleada, sin importar el monto', () => {
    const grande = calculateCut([
      record({ extraAmount: 1000, electronicExtraAmount: 1000 }),
    ]);
    expect(grande.calculatedExtras).toBe(1000);
    expect(grande.rawExtrasTotal).toBe(1000);
    expect(grande.result).toBe(-2500);

    const pequeno = calculateCut([
      record({ extraAmount: 400, electronicExtraAmount: 400 }),
    ]);
    expect(pequeno.calculatedExtras).toBe(400);
  });

  it('no deja diferencia entre el extra cobrado y el que se le paga', () => {
    const result = calculateCut([
      record({ extraAmount: 5000, electronicExtraAmount: 5000 }),
    ]);

    expect(result.calculatedExtras).toBe(result.rawExtrasTotal);
  });

  it('usa únicamente el corte de oficina sin generar discrepancia', () => {
    const report = buildCutReport([
      record({ sourceRole: 'admin', isFine: true, fineAmount: 200 }),
      record({ sourceRole: 'empleada' }),
    ]);

    expect(report.officeCut.finesTotal).toBe(200);
    expect(report.employeeCut.finesTotal).toBe(0);
    expect(report.discrepancy).toEqual({ exists: false, difference: 0 });
  });

  it('calcula correctamente los nuevos campos detallados de liquidación', () => {
    const result = calculateCut([
      record({
        serviceTotal: 2000,
        paymentMethod: 'transferencia',
        customerTransportCharge: 150,
        companyTransportExpense: 100,
        employeeUberReimbursement: 40,
        electronicExtraAmount: 200,
      }),
    ]);

    expect(result.totalCollected).toBe(2350);
    expect(result.transferTotal).toBe(2000);
    expect(result.companyCommission).toBe(800);
    expect(result.companyTransportExpenses).toBe(60);
    expect(result.employeeUberReimbursements).toBe(40);
    expect(result.netTransportBalance).toBe(50);
    expect(result.netCompanyShare).toBe(850);
  });
});
