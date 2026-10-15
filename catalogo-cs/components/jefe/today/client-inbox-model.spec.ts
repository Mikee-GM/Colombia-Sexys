import {
  buildClientConversationGroups,
  conversationForClient,
  reconcileConversationDrafts,
} from "./client-inbox-model";
import { mergeRealtimeMessage, type JefeConversation } from "./today-model";

function thread(overrides: Partial<JefeConversation> = {}): JefeConversation {
  return {
    id: "session:thread-1",
    clientId: "client-1",
    clientName: "Cliente de prueba",
    telegramId: "123",
    employeeId: "context-1",
    employeeName: "Contexto A",
    service: null,
    bookingSessionId: "thread-1",
    bookingData: null,
    bookingDraft: null,
    relatedServices: [],
    messages: [],
    lastMessage: "Primer mensaje",
    lastAt: "2026-10-14T12:00:00.000Z",
    mode: "HUMAN_ACTIVE",
    needsReply: false,
    unreadCount: 0,
    chatState: "ACTIVE",
    ...overrides,
  };
}

it("muestra una fila por cliente y conserva referencias a sus historiales separados", () => {
  const first = thread({ unreadCount: 2 });
  const second = thread({
    id: "session:thread-2",
    bookingSessionId: "thread-2",
    employeeId: "context-2",
    employeeName: "Contexto B",
    unreadCount: 1,
    needsReply: true,
    lastAt: "2026-10-14T13:00:00.000Z",
  });
  const groups = buildClientConversationGroups([first, second]);
  expect(groups).toHaveLength(1);
  expect(groups[0].id).toBe("client:client-1");
  expect(groups[0].conversations).toEqual([second, first]);
  expect(groups[0].conversations[0]).toBe(second);
  expect(groups[0].conversations[1]).toBe(first);
  expect(groups[0].unreadCount).toBe(3);
  expect(groups[0].needsReply).toBe(true);
});

it("no mezcla clientes distintos que tienen el mismo nombre o identificadores incompletos", () => {
  expect(
    buildClientConversationGroups([
      thread(),
      thread({ id: "other-client", clientId: "client-2" }),
      thread({ id: "missing-1", clientId: "" }),
      thread({ id: "missing-2", clientId: "" }),
    ]),
  ).toHaveLength(4);
});

it("incluye conversaciones sin pendientes y ordena clientes por actividad reciente", () => {
  const groups = buildClientConversationGroups([
    thread(),
    thread({
      id: "second",
      clientId: "client-2",
      lastAt: "2026-10-14T14:00:00.000Z",
    }),
  ]);
  expect(groups.map((group) => group.id)).toEqual([
    "client:client-2",
    "client:client-1",
  ]);
});

it("la busqueda por contexto o mensaje conserva todos los hilos y prioriza la coincidencia", () => {
  const first = thread();
  const latest = thread({
    id: "session:thread-2",
    employeeName: "Contexto B",
    lastAt: "2026-10-14T13:00:00.000Z",
    lastMessage: "Otro mensaje",
  });
  for (const search of ["Contexto A", "Primer mensaje"]) {
    const groups = buildClientConversationGroups([first, latest], search);
    expect(groups).toHaveLength(1);
    expect(groups[0].conversations).toHaveLength(2);
    expect(conversationForClient(groups[0], latest.id)).toBe(first.id);
  }
  expect(
    buildClientConversationGroups([first, latest], "Sin coincidencias"),
  ).toEqual([]);
});

it("recuerda el hilo exacto del cliente y descarta una seleccion que ya no esta autorizada", () => {
  const first = thread();
  const latest = thread({ id: "second", lastAt: "2026-10-14T13:00:00.000Z" });
  const [group] = buildClientConversationGroups([first, latest]);
  expect(conversationForClient(group, first.id)).toBe(first.id);
  expect(conversationForClient(group, "removed-thread")).toBe(latest.id);
});

it("no mezcla un mensaje SSE con otro hilo del mismo cliente ni cambia su identidad", () => {
  const first = thread();
  const second = thread({
    id: "session:thread-2",
    bookingSessionId: "thread-2",
  });
  const updated = mergeRealtimeMessage(
    [first, second],
    {
      id: "new-message",
      clienteId: "client-1",
      servicioId: null,
      bookingSessionId: "thread-2",
      emisor: "cliente",
      mensaje: "Mensaje solo para el segundo hilo",
      enviadoAt: "2026-10-14T14:00:00.000Z",
    },
    first.id,
  );
  const [group] = buildClientConversationGroups(updated);
  expect(
    group.conversations.find((item) => item.id === first.id)?.messages,
  ).toEqual([]);
  expect(
    group.conversations.find((item) => item.id === second.id)?.messages,
  ).toHaveLength(1);
  expect(group.latest.id).toBe(second.id);
  expect(group.unreadCount).toBe(1);
});

it("traslada el borrador al único servicio que reemplaza la misma sesión", () => {
  const before = thread();
  const after = thread({
    id: "service-1",
    service: { id: "service-1" } as JefeConversation["service"],
  });
  expect(
    reconcileConversationDrafts(
      { [before.id]: "Texto pendiente" },
      [before],
      [after],
    ),
  ).toEqual({ "service-1": "Texto pendiente" });
});

it("no mezcla borradores cuando el reemplazo es ambiguo o ya tiene texto", () => {
  const before = thread();
  const first = thread({ id: "service-1" });
  const second = thread({ id: "service-2" });
  expect(
    reconcileConversationDrafts(
      { [before.id]: "Origen" },
      [before],
      [first, second],
    ),
  ).toEqual({ [before.id]: "Origen" });
  expect(
    reconcileConversationDrafts(
      { [before.id]: "Origen", [first.id]: "Destino" },
      [before],
      [first],
    ),
  ).toEqual({ [before.id]: "Origen", [first.id]: "Destino" });
});
