import { renderToStaticMarkup } from "react-dom/server";
import OperacionClient from "./operacion-client";
import ServicioDetalle from "./servicio-detalle";
import type { Service } from "@/lib/types";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));
jest.mock("@/components/services/service-detail-dialog", () => () => null);
jest.mock("@/components/services/create-service-dialog", () => () => null);
jest.mock("@/components/erp/acciones-del-servicio", () => () => null);
jest.mock("@/components/erp/corregir-estado-viaje", () => () => null);
jest.mock("@/components/erp/reasignar-chofer", () => () => null);
jest.mock("@/components/erp/comprobantes-transferencia", () => () => null);

const record: Service = {
  id: "record-test",
  empleadaId: "employee-test",
  clienteId: null,
  jefeId: "manager-test",
  metodoPago: "efectivo",
  duracionPactadaHoras: "1",
  duracionFinalHoras: null,
  ubicacionClienteLat: null,
  ubicacionClienteLng: null,
  precioBaseHoraPactado: "0",
  totalBase: "0",
  totalExtras: "0",
  totalFinal: "0",
  horaInicioServicio: null,
  horaFinServicio: null,
  horaLlegadaCasa: null,
  prorrogasUsadas: 0,
  estado: "pendiente",
  notas: null,
  iaActiva: false,
  calificacion: null,
  comentariosCalificacion: null,
  servicioPrevioId: null,
  horaInicioEstimada: null,
  createdAt: "2026-10-14T15:00:00.000Z",
  updatedAt: "2026-10-14T15:00:00.000Z",
  calculationStatus: "provisional",
  pendingReason: null,
  customerTotal: 0,
  uberDeduction: 0,
};

describe("records without a client relationship", () => {
  it("renders the list without slicing a null client ID", () => {
    const html = renderToStaticMarkup(
      <OperacionClient services={[record]} employees={[]} jefes={[]} />,
    );

    expect(html).toContain("#manual");
    expect(html).toContain("/admin/services/record-test");
  });

  it("renders the detail without slicing a null client ID", () => {
    const html = renderToStaticMarkup(<ServicioDetalle service={record} />);

    expect(html).toContain("Cliente MANUAL");
  });
});
