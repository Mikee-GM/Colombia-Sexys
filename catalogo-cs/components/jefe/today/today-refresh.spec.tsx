/** @jest-environment jsdom */

import { StrictMode, useEffect } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import {
  getJefeTodaySnapshot,
  sendJefeConversationMessage,
  type JefeTodaySnapshot,
} from "@/lib/actions/jefe-panel";
import { useJefeRealtime } from "@/hooks/useJefeRealtime";
import type { ConversationMessage } from "@/lib/types";
import type { JefeConversation } from "./today-model";
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
jest.mock("./EmployeeTabStrip", () => () => null);
jest.mock("./ConversationInbox", () => () => null);
jest.mock("./ConversationWorkspace", () => ({
  __esModule: true,
  default: ({
    conversation,
    onTextChange,
    onSend,
  }: {
    conversation: JefeConversation | null;
    onTextChange: (value: string) => void;
    onSend: () => void;
  }) => (
    <div>
      {conversation?.messages.map((message) => (
        <p key={message.id}>{message.mensaje}</p>
      ))}
      <button onClick={() => onTextChange("Mensaje local")}>
        Escribir prueba
      </button>
      <button onClick={onSend}>Enviar prueba</button>
    </div>
  ),
}));

function message(
  id: string,
  emisor: ConversationMessage["emisor"] = "cliente",
): ConversationMessage {
  return {
    id,
    clienteId: "client-1",
    servicioId: null,
    bookingSessionId: "session-1",
    emisor,
    mensaje: `Texto ${id}`,
    enviadoAt: `2026-10-14T12:00:0${id === "old" ? 0 : 1}.000Z`,
  };
}

function snapshot(messages: ConversationMessage[]): JefeTodaySnapshot {
  return {
    employees: [],
    services: [],
    messagesByService: {},
    preServiceConversations: [
      {
        conversationId: "session-1",
        bookingSessionId: "session-1",
        client: { id: "client-1", name: "Cuenta QA", telegramId: null },
        intendedEmployee: null,
        service: null,
        messages,
        mode: "HUMAN_ACTIVE",
        lastMessage: messages.at(-1)?.mensaje ?? "Sin mensajes",
        lastAt: messages.at(-1)?.enviadoAt ?? "2026-10-14T12:00:00.000Z",
        needsReply: true,
        createdAt: "2026-10-14T12:00:00.000Z",
        bookingData: {
          durationHours: null,
          openEndedDuration: false,
          paymentMethod: null,
          locationName: null,
          locationAddress: null,
          locationNotes: null,
        },
      },
    ],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function reconnect() {
  await act(async () => {
    jest.mocked(useJefeRealtime).mock.calls.at(-1)![0].onConnected?.();
    jest.advanceTimersByTime(500);
  });
}

function receive(data: ConversationMessage) {
  act(() => {
    jest
      .mocked(useJefeRealtime)
      .mock.calls.at(-1)![0]
      .onEvent({ type: "chat_message", data });
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  cleanup();
  jest.useRealTimers();
});

it("no borra un mensaje recibido mientras estaba leyendo un snapshot anterior", async () => {
  const stale = deferred<JefeTodaySnapshot>();
  const fresh = deferred<JefeTodaySnapshot>();
  jest
    .mocked(getJefeTodaySnapshot)
    .mockReturnValueOnce(stale.promise)
    .mockReturnValueOnce(fresh.promise);
  render(
    <TodayWorkspace
      initialSnapshot={snapshot([message("old")])}
      workShift={null}
    />,
  );
  await reconnect();
  receive(message("new"));
  expect(screen.getByText("Texto new")).toBeDefined();

  await act(async () => stale.resolve(snapshot([message("old")])));
  expect(screen.getByText("Texto new")).toBeDefined();
  expect(getJefeTodaySnapshot).toHaveBeenCalledTimes(1);
  await act(async () => jest.advanceTimersByTime(500));
  expect(getJefeTodaySnapshot).toHaveBeenCalledTimes(2);

  await act(async () =>
    fresh.resolve(snapshot([message("old"), message("new")])),
  );
  expect(screen.getAllByText("Texto new")).toHaveLength(1);
});

it("serializa lecturas simultaneas para que ninguna respuesta llegue fuera de orden", async () => {
  const first = deferred<JefeTodaySnapshot>();
  const second = deferred<JefeTodaySnapshot>();
  jest
    .mocked(getJefeTodaySnapshot)
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  render(
    <TodayWorkspace
      initialSnapshot={snapshot([message("old")])}
      workShift={null}
    />,
  );
  await reconnect();
  await reconnect();
  expect(getJefeTodaySnapshot).toHaveBeenCalledTimes(1);

  await act(async () => first.resolve(snapshot([message("old")])));
  expect(getJefeTodaySnapshot).toHaveBeenCalledTimes(1);
  await act(async () => jest.advanceTimersByTime(500));
  expect(getJefeTodaySnapshot).toHaveBeenCalledTimes(2);
  await act(async () => second.resolve(snapshot([message("new")])));
  expect(screen.getByText("Texto new")).toBeDefined();
  expect(screen.queryByText("Texto old")).toBeNull();
  expect(getJefeTodaySnapshot).toHaveBeenCalledTimes(2);
});

it("avisa del fallo de lectura y permite reintentar sin vaciar el historial visible", async () => {
  jest
    .mocked(getJefeTodaySnapshot)
    .mockRejectedValueOnce(new Error("Fallo de lectura"));
  render(
    <TodayWorkspace
      initialSnapshot={snapshot([message("old")])}
      workShift={null}
    />,
  );
  await reconnect();
  expect(screen.getByRole("alert").textContent).toContain(
    "pueden estar desactualizados",
  );
  expect(screen.getByText("Texto old")).toBeDefined();

  jest
    .mocked(getJefeTodaySnapshot)
    .mockResolvedValueOnce(snapshot([message("new")]));
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" })),
  );
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByText("Texto new")).toBeDefined();
});

it("respeta mensajes y conversaciones retirados por una lectura autoritativa", async () => {
  jest
    .mocked(getJefeTodaySnapshot)
    .mockResolvedValueOnce(snapshot([message("new")]))
    .mockResolvedValueOnce({ ...snapshot([]), preServiceConversations: [] });
  render(
    <TodayWorkspace
      initialSnapshot={snapshot([message("old"), message("new")])}
      workShift={null}
    />,
  );
  await reconnect();
  expect(screen.queryByText("Texto old")).toBeNull();
  expect(screen.getByText("Texto new")).toBeDefined();
  await reconnect();
  expect(screen.queryByText("Texto new")).toBeNull();
});

it("no aplica ni repite una lectura pendiente despues de desmontar el panel", async () => {
  const pending = deferred<JefeTodaySnapshot>();
  jest.mocked(getJefeTodaySnapshot).mockReturnValueOnce(pending.promise);
  const { unmount } = render(
    <TodayWorkspace
      initialSnapshot={snapshot([message("old")])}
      workShift={null}
    />,
  );
  await reconnect();
  receive(message("new"));
  unmount();
  await act(async () => pending.resolve(snapshot([message("old")])));
  expect(getJefeTodaySnapshot).toHaveBeenCalledTimes(1);
});

it("protege tambien una respuesta local confirmada durante la lectura", async () => {
  const stale = deferred<JefeTodaySnapshot>();
  const fresh = deferred<JefeTodaySnapshot>();
  const local = message("local", "jefe");
  jest
    .mocked(getJefeTodaySnapshot)
    .mockReturnValueOnce(stale.promise)
    .mockReturnValueOnce(fresh.promise);
  jest
    .mocked(sendJefeConversationMessage)
    .mockResolvedValueOnce({ success: true, data: local });
  render(
    <TodayWorkspace
      initialSnapshot={snapshot([message("old")])}
      workShift={null}
    />,
  );
  await reconnect();
  fireEvent.click(screen.getByRole("button", { name: "Escribir prueba" }));
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Enviar prueba" })),
  );
  expect(screen.getByText("Texto local")).toBeDefined();
  await act(async () => stale.resolve(snapshot([message("old")])));
  expect(screen.getByText("Texto local")).toBeDefined();
  await act(async () => jest.advanceTimersByTime(500));
  expect(getJefeTodaySnapshot).toHaveBeenCalledTimes(2);
  await act(async () => fresh.resolve(snapshot([message("old"), local])));
  expect(screen.getAllByText("Texto local")).toHaveLength(1);
});

it("agrupa rafagas en un reintento diferido y cancela el temporizador al salir", async () => {
  const first = deferred<JefeTodaySnapshot>();
  const second = deferred<JefeTodaySnapshot>();
  jest
    .mocked(getJefeTodaySnapshot)
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const { unmount } = render(
    <TodayWorkspace
      initialSnapshot={snapshot([message("old")])}
      workShift={null}
    />,
  );
  await reconnect();
  for (let index = 0; index < 10; index += 1)
    receive(message(`burst-${index}`));
  await act(async () => first.resolve(snapshot([message("old")])));
  await act(async () => jest.advanceTimersByTime(499));
  expect(getJefeTodaySnapshot).toHaveBeenCalledTimes(1);
  await act(async () => jest.advanceTimersByTime(1));
  expect(getJefeTodaySnapshot).toHaveBeenCalledTimes(2);

  receive(message("last"));
  await act(async () => second.resolve(snapshot([message("old")])));
  expect(screen.getByText("Texto last")).toBeDefined();
  unmount();
  await act(async () => jest.advanceTimersByTime(500));
  expect(getJefeTodaySnapshot).toHaveBeenCalledTimes(2);
});

it("puede programar lecturas despues de reinstalar efectos en StrictMode", async () => {
  jest.mocked(useJefeRealtime).mockImplementation(function useMockRealtime({
    onConnected,
  }) {
    useEffect(() => {
      onConnected?.();
    }, [onConnected]);
  });
  jest
    .mocked(getJefeTodaySnapshot)
    .mockResolvedValueOnce(snapshot([message("new")]));
  render(
    <StrictMode>
      <TodayWorkspace
        initialSnapshot={snapshot([message("old")])}
        workShift={null}
      />
    </StrictMode>,
  );
  await act(async () => jest.advanceTimersByTime(500));
  expect(getJefeTodaySnapshot).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Texto new")).toBeDefined();
});
