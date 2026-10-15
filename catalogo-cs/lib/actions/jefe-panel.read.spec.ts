import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api-server";
import { getCurrentUser } from "@/lib/auth";
import type { AuthUser } from "@/lib/types";
import { getJefeTodaySnapshot } from "./jefe-panel";

jest.mock("@/lib/api-server", () => ({ apiFetch: jest.fn() }));
jest.mock("@/lib/auth", () => ({
  getCurrentUser: jest.fn(),
  isRedirectError: jest.fn(),
}));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

const jefe: AuthUser = {
  id: "jefe-1",
  email: "jefe@example.test",
  rol: "jefe",
};
const records = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `record-${index}`,
    clienteId: null,
    estado: "finalizado",
  }));

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getCurrentUser).mockResolvedValue(jefe);
  jest.mocked(redirect).mockImplementation(() => {
    throw new Error("NEXT_REDIRECT");
  });
});

it("lee mas de 500 registros con el paginador real y conserva el ambito del jefe", async () => {
  const all = [
    ...records(500),
    { id: "record-500", clienteId: "client-1", estado: "en_curso" },
  ];
  const employees = [
    { id: "employee-1", jefeId: jefe.id },
    { id: "employee-2", jefeSecundarioId: jefe.id },
    { id: "employee-3", jefeId: "other-jefe" },
  ];
  jest.mocked(apiFetch).mockImplementation(async (path) => {
    if (path === "/employees") return employees;
    if (path === "/services") return all.slice(0, 200);
    if (path === "/services?limit=500&offset=0") return all.slice(0, 500);
    if (path === "/services?limit=500&offset=500") return all.slice(500);
    if (path === "/telegram-conversations/pre-service?limit=100") return [];
    if (path === "/telegram-conversations/service/record-500?limit=100") {
      return { messages: [], nextCursor: null };
    }
    throw new Error(`Lectura inesperada: ${path}`);
  });

  const snapshot = await getJefeTodaySnapshot();
  expect(snapshot.services).toHaveLength(501);
  expect(snapshot.services).toEqual(all);
  expect(snapshot.employees).toEqual(employees.slice(0, 2));
  expect(snapshot.messagesByService).toEqual({ "record-500": [] });
  expect(apiFetch).toHaveBeenCalledWith("/services?limit=500&offset=0");
  expect(apiFetch).toHaveBeenCalledWith("/services?limit=500&offset=500");
  expect(apiFetch).not.toHaveBeenCalledWith("/services");
  expect(
    jest.mocked(apiFetch).mock.calls.every(([, options]) => options === undefined),
  ).toBe(true);
});

it("rechaza una pagina fallida sin devolver un snapshot parcial", async () => {
  const all = records(500);
  const failure = new Error("Pagina no disponible");
  jest.mocked(apiFetch).mockImplementation(async (path) => {
    if (path === "/services") return all.slice(0, 200);
    if (path === "/services?limit=500&offset=0") return all;
    if (path === "/services?limit=500&offset=500") throw failure;
    if (
      path === "/employees" ||
      path === "/telegram-conversations/pre-service?limit=100"
    ) return [];
    throw new Error(`Lectura inesperada: ${path}`);
  });

  await expect(getJefeTodaySnapshot()).rejects.toBe(failure);
  expect(apiFetch).toHaveBeenCalledWith("/services?limit=500&offset=500");
  expect(
    jest.mocked(apiFetch).mock.calls.some(([path]) =>
      path.startsWith("/telegram-conversations/service/"),
    ),
  ).toBe(false);
});

it.each<AuthUser | null>([null, { ...jefe, rol: "admin" }])(
  "no consulta datos sin un usuario con rol jefe: %j",
  async (user) => {
    jest.mocked(getCurrentUser).mockResolvedValue(user);
    await expect(getJefeTodaySnapshot()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/admin");
    expect(apiFetch).not.toHaveBeenCalled();
  },
);

it("espera a que termine la autenticacion antes de iniciar las lecturas", async () => {
  let authenticate!: (user: AuthUser) => void;
  jest.mocked(getCurrentUser).mockReturnValue(
    new Promise((resolve) => {
      authenticate = resolve;
    }),
  );
  jest.mocked(apiFetch).mockResolvedValue([]);
  const snapshot = getJefeTodaySnapshot();
  await Promise.resolve();
  expect(apiFetch).not.toHaveBeenCalled();

  authenticate(jefe);
  await expect(snapshot).resolves.toEqual({
    employees: [],
    services: [],
    messagesByService: {},
    preServiceConversations: [],
  });
  expect(apiFetch).toHaveBeenCalledWith("/services?limit=500&offset=0");
});
