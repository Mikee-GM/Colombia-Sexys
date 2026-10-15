/** @jest-environment jsdom */

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import {
  getJefeTodaySnapshot,
  sendJefeConversationMessage,
  type JefeTodaySnapshot,
} from "@/lib/actions/jefe-panel";
import { useJefeRealtime } from "@/hooks/useJefeRealtime";
import type { PreServiceConversation } from "@/lib/types";
import TodayWorkspace from "./TodayWorkspace";

jest.mock("@/lib/actions/jefe-panel", () => ({
  getJefeTodaySnapshot: jest.fn(),
  sendJefeConversationMessage: jest.fn(),
  setJefeConversationMode: jest.fn(),
}));
jest.mock("@/hooks/useJefeRealtime", () => ({ useJefeRealtime: jest.fn() }));
jest.mock("next/dynamic", () => () => () => null);
jest.mock("@/components/services/create-service-dialog", () => () => null);
jest.mock("./TodayHeader", () => () => null);

function conversation(
  id: string,
  context: string,
  clientId = "client-1",
): PreServiceConversation {
  return {
    conversationId: id,
    bookingSessionId: id,
    client: {
      id: clientId,
      name: clientId === "client-1" ? "Cliente Uno" : "Cliente Dos",
      telegramId: null,
    },
    intendedEmployee: { id: `context-${id}`, name: context },
    service: null,
    messages: [
      {
        id: `message-${id}`,
        clienteId: clientId,
        servicioId: null,
        bookingSessionId: id,
        emisor: "cliente",
        mensaje: `Historial ${id}`,
        enviadoAt: "2026-10-14T12:00:00.000Z",
      },
    ],
    mode: "HUMAN_ACTIVE",
    lastMessage: `Historial ${id}`,
    lastAt: "2026-10-14T12:00:00.000Z",
    needsReply: false,
    createdAt: "2026-10-14T12:00:00.000Z",
    bookingData: {
      durationHours: null,
      openEndedDuration: false,
      paymentMethod: null,
      locationName: null,
      locationAddress: null,
      locationNotes: null,
    },
  };
}

function snapshot(): JefeTodaySnapshot {
  return {
    employees: [],
    services: [],
    messagesByService: {},
    preServiceConversations: [
      conversation("thread-1", "Contexto A"),
      conversation("thread-2", "Contexto B"),
      conversation("thread-3", "Contexto C", "client-2"),
    ],
  };
}

function chat() {
  return screen
    .getByRole("heading", { name: "Cliente Uno", level: 2 })
    .closest("section")!;
}

function selectThread(id: string) {
  fireEvent.change(
    screen.getByRole("combobox", { name: "Conversación de este cliente" }),
    {
      target: { value: `session:${id}` },
    },
  );
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: jest.fn(),
  });
});

afterEach(() => {
  cleanup();
  jest.useRealTimers();
});

it("muestra una sola fila por cliente y permite navegar ida y vuelta desde la bandeja movil", () => {
  render(<TodayWorkspace initialSnapshot={snapshot()} workShift={null} />);
  const inbox = screen.getByRole("complementary", { name: "Conversaciones" });
  expect(within(inbox).getAllByRole("button")).toHaveLength(2);
  expect(within(inbox).getByText("2 conversaciones")).toBeDefined();
  expect(within(inbox).getByText("Con Contexto A · Contexto B")).toBeDefined();
  expect(within(inbox).getByText("Con Contexto C")).toBeDefined();
  expect(screen.queryByRole("tablist")).toBeNull();
  fireEvent.click(
    within(inbox).getByRole("button", {
      name: "Abrir conversaciones de Cliente Uno",
    }),
  );
  expect(inbox.parentElement?.classList.contains("hidden")).toBe(true);
  expect(chat().parentElement?.classList.contains("block")).toBe(true);
  fireEvent.click(
    screen.getByRole("button", { name: "Volver a conversaciones" }),
  );
  expect(inbox.parentElement?.classList.contains("block")).toBe(true);
  expect(chat().parentElement?.classList.contains("hidden")).toBe(true);
});

it("cambia el historial y el contexto sin fusionar mensajes de una misma persona", () => {
  render(<TodayWorkspace initialSnapshot={snapshot()} workShift={null} />);
  expect(within(chat()).getByText("Historial thread-1")).toBeDefined();
  expect(within(chat()).queryByText("Historial thread-2")).toBeNull();
  selectThread("thread-2");
  expect(within(chat()).getByText("Historial thread-2")).toBeDefined();
  expect(within(chat()).queryByText("Historial thread-1")).toBeNull();
  expect(within(chat()).getByText(/Contexto B ·/, { selector: "p" })).toBeDefined();
});

it("recuerda el hilo elegido y conserva borradores locales por destino al cambiar de cliente", () => {
  render(<TodayWorkspace initialSnapshot={snapshot()} workShift={null} />);
  fireEvent.change(screen.getByRole("textbox", { name: "Mensaje" }), {
    target: { value: "Borrador A" },
  });
  selectThread("thread-2");
  expect(
    (screen.getByRole("textbox", { name: "Mensaje" }) as HTMLTextAreaElement)
      .value,
  ).toBe("");
  fireEvent.change(screen.getByRole("textbox", { name: "Mensaje" }), {
    target: { value: "Borrador B" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Abrir conversaciones de Cliente Dos" }),
  );
  expect(screen.queryByRole("combobox")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Abrir conversaciones de Cliente Uno" }),
  );
  expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(
    "session:thread-2",
  );
  expect(
    (screen.getByRole("textbox", { name: "Mensaje" }) as HTMLTextAreaElement)
      .value,
  ).toBe("Borrador B");
  selectThread("thread-1");
  expect(
    (screen.getByRole("textbox", { name: "Mensaje" }) as HTMLTextAreaElement)
      .value,
  ).toBe("Borrador A");
  expect(sendJefeConversationMessage).not.toHaveBeenCalled();
});

it("la busqueda abre el hilo coincidente sin ocultar los otros hilos del mismo cliente", () => {
  render(<TodayWorkspace initialSnapshot={snapshot()} workShift={null} />);
  fireEvent.change(
    screen.getByRole("textbox", { name: "Buscar conversaciones" }),
    { target: { value: "Contexto B" } },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Abrir conversaciones de Cliente Uno" }),
  );
  expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(
    "session:thread-2",
  );
  expect(screen.getAllByRole("option")).toHaveLength(2);
  selectThread("thread-1");
  expect(within(chat()).getByText("Historial thread-1")).toBeDefined();
});

it("un mensaje SSE de otro hilo no cambia el historial que se esta leyendo", () => {
  render(<TodayWorkspace initialSnapshot={snapshot()} workShift={null} />);
  act(() =>
    jest
      .mocked(useJefeRealtime)
      .mock.calls.at(-1)![0]
      .onEvent({
        type: "chat_message",
        data: {
          id: "new-message",
          clienteId: "client-1",
          servicioId: null,
          bookingSessionId: "thread-2",
          emisor: "cliente",
          mensaje: "Nuevo mensaje aislado",
          enviadoAt: "2026-10-14T13:00:00.000Z",
        },
      }),
  );
  expect(within(chat()).queryByText("Nuevo mensaje aislado")).toBeNull();
  expect(screen.getByLabelText("1 mensajes sin leer")).toBeDefined();
  selectThread("thread-2");
  expect(within(chat()).getByText("Nuevo mensaje aislado")).toBeDefined();
  expect(screen.queryByLabelText("1 mensajes sin leer")).toBeNull();
});

it("mantiene el destino exacto del envio existente y solo limpia el borrador enviado", async () => {
  const initial = snapshot();
  jest.mocked(sendJefeConversationMessage).mockResolvedValueOnce({
    success: true,
    data: {
      ...initial.preServiceConversations[1].messages[0],
      id: "local",
      emisor: "jefe",
      mensaje: "Respuesta B",
    },
  });
  render(<TodayWorkspace initialSnapshot={initial} workShift={null} />);
  fireEvent.change(screen.getByRole("textbox", { name: "Mensaje" }), {
    target: { value: "Borrador A" },
  });
  selectThread("thread-2");
  fireEvent.change(screen.getByRole("textbox", { name: "Mensaje" }), {
    target: { value: "Respuesta B" },
  });
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Enviar mensaje" })),
  );
  expect(sendJefeConversationMessage).toHaveBeenCalledWith({
    serviceId: null,
    bookingSessionId: "thread-2",
    clientId: "client-1",
    mode: "HUMAN_ACTIVE",
    message: "Respuesta B",
  });
  expect(
    (screen.getByRole("textbox", { name: "Mensaje" }) as HTMLTextAreaElement)
      .value,
  ).toBe("");
  selectThread("thread-1");
  expect(
    (screen.getByRole("textbox", { name: "Mensaje" }) as HTMLTextAreaElement)
      .value,
  ).toBe("Borrador A");
});

it("no borra un texto nuevo si el envío anterior termina después", async () => {
  let resolveSend: ((value: Awaited<ReturnType<typeof sendJefeConversationMessage>>) => void) | undefined;
  jest.mocked(sendJefeConversationMessage).mockImplementationOnce(
    () => new Promise((resolve) => { resolveSend = resolve; }),
  );
  const initial = snapshot();
  render(<TodayWorkspace initialSnapshot={initial} workShift={null} />);
  fireEvent.change(screen.getByRole("textbox", { name: "Mensaje" }), {
    target: { value: "Primer texto" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enviar mensaje" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Mensaje" }), {
    target: { value: "Texto nuevo mientras se envía" },
  });
  await act(async () => {
    resolveSend?.({
      success: true,
      data: {
        ...initial.preServiceConversations[0].messages[0],
        id: "sent-late",
        emisor: "jefe",
        mensaje: "Primer texto",
      },
    });
  });
  expect(
    (screen.getByRole("textbox", { name: "Mensaje" }) as HTMLTextAreaElement)
      .value,
  ).toBe("Texto nuevo mientras se envía");
});

it("retira un hilo eliminado del snapshot y no mantiene un destino fuera del alcance actual", async () => {
  render(<TodayWorkspace initialSnapshot={snapshot()} workShift={null} />);
  selectThread("thread-2");
  const next = snapshot();
  next.preServiceConversations = [next.preServiceConversations[0]];
  jest.mocked(getJefeTodaySnapshot).mockResolvedValueOnce(next);
  await act(async () => {
    jest.mocked(useJefeRealtime).mock.calls.at(-1)![0].onConnected?.();
    jest.advanceTimersByTime(500);
  });
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(within(chat()).getByText("Historial thread-1")).toBeDefined();
  expect(within(chat()).queryByText("Historial thread-2")).toBeNull();
});
