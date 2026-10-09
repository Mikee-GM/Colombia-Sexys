import {
  calculateCardExtraSnapshot,
  calculateServiceFinancials,
} from './service-financial-calculator';

describe('calculo financiero central de servicios', () => {
  it('calcula 60 por ciento del servicio base', () => {
    const result = calculateServiceFinancials({
      serviceBaseAmount: 2000,
      employeeServicePercentage: 60,
      extensions: [],
      cardExtras: [],
      customerTransportCharge: 0,
    });
    expect(result.employeeServiceExpected).toBe(1200);
    expect(result.employeeExpectedTotal).toBe(1200);
  });

  it('incluye extensiones en el 60 por ciento y excluye transporte', () => {
    const result = calculateServiceFinancials({
      serviceBaseAmount: 2000,
      employeeServicePercentage: 60,
      extensions: [
        { amount: 500, employeeExpected: 300 },
        { amount: 300, employeeExpected: 180 },
      ],
      cardExtras: [],
      customerTransportCharge: 400,
    });
    expect(result.serviceCommissionableBase).toBe(2800);
    expect(result.employeeServiceExpected).toBe(1680);
    expect(result.customerTransportCharge).toBe(400);
    expect(result.employeeExpectedTotal).toBe(1680);
  });

  it.each([
    [800, 0, 800],
    [1000, 150, 850],
    [1500, 225, 1275],
  ])('evalua individualmente un extra de %s', (amount, commission, net) => {
    expect(calculateCardExtraSnapshot(amount)).toEqual(
      expect.objectContaining({
        amount,
        companyCommission: commission,
        employeeNet: net,
      }),
    );
  });

  it('no suma dos extras de 600 para activar el umbral', () => {
    const extras = [
      calculateCardExtraSnapshot(600),
      calculateCardExtraSnapshot(600),
    ];
    const result = calculateServiceFinancials({
      serviceBaseAmount: 0,
      employeeServicePercentage: 60,
      extensions: [],
      cardExtras: extras,
      customerTransportCharge: 0,
    });
    expect(result.cardExtrasTotal).toBe(1200);
    expect(result.cardExtraCompanyCommission).toBe(0);
    expect(result.cardExtrasEmployeeNet).toBe(1200);
  });

  it('suma servicio y netos de extras sin sumar transporte', () => {
    const result = calculateServiceFinancials({
      serviceBaseAmount: 2000,
      employeeServicePercentage: 60,
      extensions: [{ amount: 1000, employeeExpected: 600 }],
      cardExtras: [calculateCardExtraSnapshot(1500)],
      customerTransportCharge: 300,
    });
    expect(result.employeeExpectedTotal).toBe(3075);
  });

  it('respeta el snapshot de cada extension sin recalcularlo con la tasa actual', () => {
    const result = calculateServiceFinancials({
      serviceBaseAmount: 1000,
      employeeServicePercentage: 60,
      extensions: [{ amount: 500, employeeExpected: 250 }],
      cardExtras: [],
      customerTransportCharge: 0,
    });

    expect(result.serviceCommissionableBase).toBe(1500);
    expect(result.employeeServiceExpected).toBe(850);
  });
});
