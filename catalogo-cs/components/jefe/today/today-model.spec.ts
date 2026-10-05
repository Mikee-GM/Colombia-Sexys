import type { ConversationMessage, Service } from "@/lib/types";
import {
  buildJefeConversations,
  filterConversations,
  groupConversationsByEmployee,
  markConversationRead,
  mergeRealtimeMessage,
  presentServiceState,
  updateConversationMode,
} from "./today-model";

function service(overrides: Partial<Service> = {}): Service {
  return {
    id: "service-1",
    empleadaId: "employee-1",
    clienteId: "client-1",
    jefeId: "boss-1",
    metodoPago: "efectivo",
    duracionPactadaHoras: "2",
    duracionFinalHoras: null,
    ubicacionClienteLat: "19.4",
    ubicacionClienteLng: "-99.1",
    precioBaseHoraPactado: "1000",
    totalBase: "2000",
    totalExtras: "0",
    totalFinal: "2000",
    horaInicioServicio: null,
    horaFinServicio: null,
    horaLlegadaCasa: null,
    prorrogasUsadas: 0,
    estado: "agendado",
    notas: null,
    iaActiva: true,
    calificacion: null,
    comentariosCalificacion: null,
    servicioPrevioId: null,
    horaInicioEstimada: null,
    createdAt: "2026-10-05T10:00:00.000Z",
    calculationStatus: "ready",
    pendingReason: null,
    customerTotal: 2000,
    uberDeduction: 0,
    updatedAt: "2026-10-05T10:00:00.000Z",
    cliente: {
      id: "client-1",
      telegramChatId: "123",
      nombreTelegram: "Carlos",
    },
    empleada: {
      id: "employee-1",
      usuarioId: "user-1",
      nombreReal: "Andrea",
      nombreArtistico: "Andrea",
      slugCatalogo: "andrea",
      fotoPerfilUrl: null,
      descripcion: null,
      precioBaseHora: "1000",
      disponible: true,
      catalogoActivo: true,
      totalServiciosValorados: 0,
      promedioCalificacion: null,
      ubicacionLat: null,
      ubicacionLng: null,
    },
    ...overrides,
  };
}

function message(
  id: string,
  emisor: ConversationMessage["emisor"],
  enviadoAt: string,
): ConversationMessage {
  return {
    id,
    clienteId: "client-1",
    servicioId: "service-1",
    emisor,
    mensaje: `Mensaje ${id}`,
    enviadoAt,
  };
}

describe("modelo puro de Hoy", () => {
  it("agrupa varios servicios autorizados del mismo cliente en una conversacion", () => {
    const older = service({ id: "service-older", estado: "finalizado" });
    const current = service({ id: "service-current", estado: "en_curso" });
    const conversations = buildJefeConversations(
      [older, current],
      {
        "service-older": [
          { ...message("old", "cliente", "2026-10-05T09:00:00.000Z"), servicioId: "service-older" },
        ],
        "service-current": [
          { ...message("new", "ia", "2026-10-05T11:00:00.000Z"), servicioId: "service-current" },
        ],
      },
    );

    expect(conversations).toHaveLength(1);
    expect(conversations[0].service.id).toBe("service-current");
    expect(conversations[0].messages.map((item) => item.id)).toEqual([
      "old",
      "new",
    ]);
  });

  it("filtra por atencion y agrupa por empleada", () => {
    const conversations = buildJefeConversations(
      [service()],
      { "service-1": [message("m1", "cliente", "2026-10-05T11:00:00.000Z")] },
    );

    expect(filterConversations(conversations, "unanswered", "carlos")).toHaveLength(1);
    expect(filterConversations(conversations, "in_progress", "")).toHaveLength(0);
    expect(groupConversationsByEmployee(conversations)[0].employeeName).toBe("Andrea");
  });

  it("suma no leidos solo para mensajes entrantes fuera de la conversacion activa", () => {
    const initial = buildJefeConversations(
      [service()],
      { "service-1": [message("m1", "ia", "2026-10-05T11:00:00.000Z")] },
    );
    const next = mergeRealtimeMessage(
      initial,
      message("m2", "cliente", "2026-10-05T11:01:00.000Z"),
      null,
    );

    expect(next[0].unreadCount).toBe(1);
    expect(next[0].needsReply).toBe(true);
    expect(markConversationRead(next, "client-1")[0].unreadCount).toBe(0);
  });

  it("respeta el estado operacional entregado por el backend", () => {
    expect(
      presentServiceState(
        service({ operationalState: "esperando_aceptacion_empleada" }),
      ).label,
    ).toBe("Esperando respuesta");
  });

  it("el takeover mantiene un unico control entre IA y humano", () => {
    const initial = buildJefeConversations(
      [service()],
      {
        "service-1": [
          message("m1", "ia", "2026-10-05T11:00:00.000Z"),
        ],
      },
    );
    const human = updateConversationMode(
      initial,
      "client-1",
      "HUMAN_ACTIVE",
    );
    const ai = updateConversationMode(human, "client-1", "AI_ACTIVE");

    expect(human[0].mode).toBe("HUMAN_ACTIVE");
    expect(human[0].service.iaActiva).toBe(false);
    expect(ai[0].mode).toBe("AI_ACTIVE");
    expect(ai[0].service.iaActiva).toBe(true);
  });
});
