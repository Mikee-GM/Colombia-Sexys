import ServicesPage from "./page";
import ServicioDetallePage from "./[id]/page";
import { ApiError, apiFetch } from "@/lib/api-server";
import { getEmployees } from "@/lib/data/employees";
import { notFound } from "next/navigation";

jest.mock("@/lib/api-server", () => ({
  ...jest.requireActual("@/lib/api-server"),
  apiFetch: jest.fn(),
}));
jest.mock("@/lib/auth", () => ({
  getCurrentUser: jest.fn().mockResolvedValue({ id: "admin-test" }),
  isRedirectError: (error: unknown) =>
    error instanceof Error && "digest" in error,
}));
jest.mock("next/navigation", () => ({
  redirect: jest.fn(() => {
    throw new Error("redirect");
  }),
  notFound: jest.fn(() => {
    throw new Error("not-found");
  }),
}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/data/employees", () => ({ getEmployees: jest.fn() }));
jest.mock("@/lib/actions/jefes", () => ({
  getJefesAction: jest.fn().mockResolvedValue([]),
}));
jest.mock("@/lib/actions/choferes", () => ({
  getChoferesAction: jest.fn().mockResolvedValue([]),
}));
jest.mock("@/components/erp/operacion-client", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("@/components/erp/servicio-detalle", () => ({
  __esModule: true,
  default: () => null,
}));

const detail = () => ServicioDetallePage({ params: Promise.resolve({ id: "test" }) });

describe("administrative record reads", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getEmployees).mockResolvedValue([]);
  });

  it("shows a genuinely empty list", async () => {
    jest.mocked(apiFetch).mockResolvedValue([]);

    expect((await ServicesPage()).props.services).toEqual([]);
  });

  it("does not report a backend outage as an empty list", async () => {
    const error = new ApiError("Servidor temporalmente no disponible", 500);
    jest.mocked(apiFetch).mockRejectedValue(error);

    await expect(ServicesPage()).rejects.toBe(error);
  });

  it("rejects a malformed successful response instead of displaying zero records", async () => {
    jest.mocked(apiFetch).mockResolvedValue(undefined);

    await expect(ServicesPage()).rejects.toThrow("lista de servicios válida");
  });

  it("preserves the record list when an auxiliary source is unavailable", async () => {
    const records = [{ id: "test", clienteId: null }];
    jest.mocked(apiFetch).mockResolvedValue(records);
    jest.mocked(getEmployees).mockRejectedValue(new Error("Auxiliar no disponible"));
    const log = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const page = await ServicesPage();
      expect(page.props.services).toEqual(records);
      expect(page.props.employees).toEqual([]);
    } finally {
      log.mockRestore();
    }
  });

  it("uses the missing-record page only for an actual 404", async () => {
    jest.mocked(apiFetch).mockRejectedValue(new ApiError("Registro no encontrado", 404));

    await expect(detail()).rejects.toThrow("not-found");
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it.each([
    new ApiError("Sin permisos", 403),
    new ApiError("Error del servidor", 500),
    new Error("No se pudo conectar"),
  ])("does not disguise %s as a missing record", async (error) => {
    jest.mocked(apiFetch).mockRejectedValue(error);

    await expect(detail()).rejects.toThrow(error.message);
    expect(notFound).not.toHaveBeenCalled();
  });

  it("does not swallow session redirects in detail reads", async () => {
    const redirect = Object.assign(new Error("Sesión expirada"), {
      digest: "NEXT_REDIRECT;replace;/admin;307;",
    });
    jest.mocked(apiFetch).mockRejectedValue(redirect);

    await expect(detail()).rejects.toBe(redirect);
    expect(notFound).not.toHaveBeenCalled();
  });

  it("renders a manual record without requiring a client relation", async () => {
    const record = { id: "test", clienteId: null };
    jest.mocked(apiFetch).mockResolvedValue(record);

    expect((await detail()).props.service).toEqual(record);
  });

  it("does not classify an empty successful detail response as 404", async () => {
    jest.mocked(apiFetch).mockResolvedValue(undefined);

    await expect(detail()).rejects.toThrow("no devolvió el detalle");
    expect(notFound).not.toHaveBeenCalled();
  });
});
