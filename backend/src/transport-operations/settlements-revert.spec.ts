import { ConflictException, NotFoundException } from '@nestjs/common';
import type { DataSource } from 'typeorm';

import { LiquidationAudit } from '../liquidations/entities/liquidation-audit.entity';
import { EmployeeCashObligation } from './entities/employee-cash-obligation.entity';
import {
  EmployeeCashPayment,
  EmployeeCashPaymentAllocation,
} from './entities/employee-cash-payment.entity';
import { SettlementsService } from './settlements.service';
import type { Usuarios } from '../users/entities/user.entity';

/**
 * El servicio tiene media docena de repositorios inyectados y toda la logica
 * que importa aqui corre sobre el `EntityManager` que recibe por parametro. Se
 * invoca el metodo sobre un objeto vacio con un manager de mentira, en vez de
 * levantar el modulo y una base de datos, porque lo que hay que comprobar es la
 * aritmetica de las asignaciones.
 */
type ManagerFalso = DataSource['manager'];

const admin = { id: 'admin-1', rol: 'admin' } as Usuarios;

function nuevoManager(datos: {
  payment?: Partial<EmployeeCashPayment> | null;
  allocations?: Partial<EmployeeCashPaymentAllocation>[];
  obligations?: Partial<EmployeeCashObligation>[];
}) {
  const guardados: unknown[] = [];
  const auditoria: Partial<LiquidationAudit>[] = [];
  const obligations = (datos.obligations ?? []).map((fila) => ({ ...fila }));

  const manager = {
    getRepository(entidad: unknown) {
      if (entidad === EmployeeCashPayment) {
        return {
          findOne: () => Promise.resolve(datos.payment ?? null),
          save: (fila: unknown) => {
            guardados.push(fila);
            return Promise.resolve(fila);
          },
        };
      }
      if (entidad === EmployeeCashPaymentAllocation) {
        return { findBy: () => Promise.resolve(datos.allocations ?? []) };
      }
      if (entidad === EmployeeCashObligation) {
        return {
          findOne: ({ where }: { where: { id: string } }) =>
            Promise.resolve(
              obligations.find((fila) => fila.id === where.id) ?? null,
            ),
        };
      }
      if (entidad === LiquidationAudit) {
        return {
          create: (fila: Partial<LiquidationAudit>) => fila,
          save: (fila: Partial<LiquidationAudit>) => {
            auditoria.push(fila);
            return Promise.resolve(fila);
          },
        };
      }
      throw new Error(`Repositorio inesperado: ${String(entidad)}`);
    },
    save: (fila: unknown) => {
      guardados.push(fila);
      return Promise.resolve(fila);
    },
  } as unknown as ManagerFalso;

  return { manager, obligations, auditoria, guardados };
}

function nuevoServicio() {
  const servicio = Object.create(
    SettlementsService.prototype,
  ) as SettlementsService;
  // El acceso por rol se prueba aparte; aqui siempre pasa.
  (
    servicio as unknown as { assertEmployeeAccess: unknown }
  ).assertEmployeeAccess = jest.fn().mockResolvedValue(undefined);
  return servicio;
}

describe('Deshacer un abono de efectivo', () => {
  /**
   * El fallo que cubre esta prueba: registrar el efectivo que entrega una
   * empleada no tenia vuelta atras. Si el administrador se equivocaba de
   * empleada o de monto, el saldo quedaba mal para siempre.
   */
  it('devuelve a la obligacion lo que el abono le habia aplicado', async () => {
    const { manager, obligations, guardados } = nuevoManager({
      payment: {
        id: 'pago-1',
        employeeId: 'emp-1',
        amount: 300,
        origin: 'physical',
        revertedAt: null,
      },
      allocations: [{ paymentId: 'pago-1', obligationId: 'ob-1', amount: 300 }],
      obligations: [
        {
          id: 'ob-1',
          amount: 500,
          paidAmount: 300,
          status: 'pending',
          calculationStatus: 'ready',
        },
      ],
    });

    await nuevoServicio().revertCashPaymentWith(manager, 'pago-1', admin);

    expect(obligations[0].paidAmount).toBe(0);
    expect(obligations[0].status).toBe('pending');
    expect(obligations[0].calculationStatus).toBe('ready');
    const pago = guardados.find(
      (fila) => (fila as EmployeeCashPayment).id === 'pago-1',
    ) as EmployeeCashPayment;
    expect(pago.revertedAt).toBeInstanceOf(Date);
    expect(pago.revertedByUserId).toBe('admin-1');
  });

  /**
   * Una obligacion saldada vuelve a `ready`, no a `provisional`: el abono solo
   * pudo aplicarse sobre algo ya calculado, asi que ese es su estado previo.
   * Devolverla a provisional la sacaria del corte semanal sin motivo.
   */
  it('reabre una obligacion que habia quedado saldada', async () => {
    const { manager, obligations } = nuevoManager({
      payment: {
        id: 'pago-2',
        employeeId: 'emp-1',
        amount: 500,
        origin: 'physical',
        revertedAt: null,
      },
      allocations: [{ paymentId: 'pago-2', obligationId: 'ob-2', amount: 500 }],
      obligations: [
        {
          id: 'ob-2',
          amount: 500,
          paidAmount: 500,
          status: 'paid',
          calculationStatus: 'paid',
        },
      ],
    });

    await nuevoServicio().revertCashPaymentWith(manager, 'pago-2', admin);

    expect(obligations[0].paidAmount).toBe(0);
    expect(obligations[0].status).toBe('pending');
    expect(obligations[0].calculationStatus).toBe('ready');
  });

  it('reparte la devolucion entre todas las obligaciones que toco', async () => {
    const { manager, obligations } = nuevoManager({
      payment: {
        id: 'pago-3',
        employeeId: 'emp-1',
        amount: 700,
        origin: 'physical',
        revertedAt: null,
      },
      allocations: [
        { paymentId: 'pago-3', obligationId: 'ob-a', amount: 500 },
        { paymentId: 'pago-3', obligationId: 'ob-b', amount: 200 },
      ],
      obligations: [
        {
          id: 'ob-a',
          amount: 500,
          paidAmount: 500,
          status: 'paid',
          calculationStatus: 'paid',
        },
        {
          id: 'ob-b',
          amount: 900,
          paidAmount: 200,
          status: 'pending',
          calculationStatus: 'ready',
        },
      ],
    });

    await nuevoServicio().revertCashPaymentWith(manager, 'pago-3', admin);

    expect(obligations[0].paidAmount).toBe(0);
    expect(obligations[1].paidAmount).toBe(0);
  });

  /**
   * Solo se revierte la parte que este abono aplico. Si otro abono anterior ya
   * habia pagado una parte de la misma obligacion, esa parte tiene que quedarse
   * donde esta: deshacer un movimiento no puede deshacer los de al lado.
   */
  it('no toca lo que habian pagado otros abonos', async () => {
    const { manager, obligations } = nuevoManager({
      payment: {
        id: 'pago-4',
        employeeId: 'emp-1',
        amount: 200,
        origin: 'physical',
        revertedAt: null,
      },
      allocations: [{ paymentId: 'pago-4', obligationId: 'ob-c', amount: 200 }],
      obligations: [
        {
          id: 'ob-c',
          amount: 1000,
          paidAmount: 850,
          status: 'pending',
          calculationStatus: 'ready',
        },
      ],
    });

    await nuevoServicio().revertCashPaymentWith(manager, 'pago-4', admin);

    expect(obligations[0].paidAmount).toBe(650);
  });

  it('deja el asiento de auditoria del deshacer', async () => {
    const { manager, auditoria } = nuevoManager({
      payment: {
        id: 'pago-5',
        employeeId: 'emp-1',
        amount: 100,
        origin: 'physical',
        revertedAt: null,
      },
      allocations: [],
      obligations: [],
    });

    await nuevoServicio().revertCashPaymentWith(
      manager,
      'pago-5',
      admin,
      'me equivoqué de empleada',
    );

    expect(auditoria).toHaveLength(1);
    expect(auditoria[0].entityType).toBe('cash_payment');
    expect(auditoria[0].action).toBe('reverted');
    expect(auditoria[0].actorUserId).toBe('admin-1');
  });

  it('no deja revertir dos veces el mismo abono', async () => {
    const { manager } = nuevoManager({
      payment: {
        id: 'pago-6',
        employeeId: 'emp-1',
        amount: 100,
        origin: 'physical',
        revertedAt: new Date(),
      },
      allocations: [],
      obligations: [],
    });

    await expect(
      nuevoServicio().revertCashPaymentWith(manager, 'pago-6', admin),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  /**
   * El abono de compensacion lo crea la confirmacion del corte semanal.
   * Revertirlo por su cuenta dejaria la fila de la liquidacion afirmando que se
   * pago algo que ya no esta pagado, asi que su unica entrada es deshacer la
   * liquidacion entera.
   */
  it('rechaza revertir a solas el abono que genero el corte semanal', async () => {
    const { manager } = nuevoManager({
      payment: {
        id: 'pago-7',
        employeeId: 'emp-1',
        amount: 400,
        origin: 'weekly_offset',
        revertedAt: null,
      },
      allocations: [],
      obligations: [],
    });

    await expect(
      nuevoServicio().revertCashPaymentWith(manager, 'pago-7', admin),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('deja revertirlo cuando lo pide el deshacer de la liquidacion', async () => {
    const { manager, obligations } = nuevoManager({
      payment: {
        id: 'pago-8',
        employeeId: 'emp-1',
        amount: 400,
        origin: 'weekly_offset',
        revertedAt: null,
      },
      allocations: [{ paymentId: 'pago-8', obligationId: 'ob-d', amount: 400 }],
      obligations: [
        {
          id: 'ob-d',
          amount: 400,
          paidAmount: 400,
          status: 'paid',
          calculationStatus: 'paid',
        },
      ],
    });

    await nuevoServicio().revertCashPaymentWith(
      manager,
      'pago-8',
      admin,
      undefined,
      true,
    );

    expect(obligations[0].paidAmount).toBe(0);
    expect(obligations[0].status).toBe('pending');
  });

  it('avisa si el abono no existe', async () => {
    const { manager } = nuevoManager({ payment: null });

    await expect(
      nuevoServicio().revertCashPaymentWith(manager, 'no-existe', admin),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
