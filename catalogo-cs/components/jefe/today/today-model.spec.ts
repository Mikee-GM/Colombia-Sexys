import type {
  ConversationMessage,
  PreServiceConversation,
  Service,
} from "@/lib/types";
import {
  buildEmployeeNavigation,
  buildJefeConversations,
  buildOperationSections,
  conversationsForEmployee,
  filterConversations,
  groupConversationsByEmployee,
  canAssignTransport,
  canBossAuthorizeService,
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

function preService(
  overrides: Partial<PreServiceConversation> = {},
): PreServiceConversation {
  return {
    conversationId: "booking-1",
    bookingSessionId: "booking-1",
    client: { id: "client-1", name: "Carlos", telegramId: "123" },
    intendedEmployee: { id: "employee-1", name: "Andrea" },
    service: null,
    messages: [
      {
        ...message("draft-1", "cliente", "2026-10-06T10:00:00.000Z"),
        servicioId: null,
        bookingSessionId: "booking-1",
        intendedEmployeeId: "employee-1",
      },
    ],
    mode: "AI_ACTIVE",
    lastMessage: "Hola, quiero información",
    lastAt: "2026-10-06T10:00:00.000Z",
    needsReply: true,
    createdAt: "2026-10-06T10:00:00.000Z",
    bookingData: {
      durationHours: 2,
      openEndedDuration: false,
      paymentMethod: "efectivo",
      locationName: null,
      locationAddress: null,
      locationNotes: null,
    },
    ...overrides,
  };
}

describe("modelo puro de Hoy", () => {
  it("archiva en Hoy un servicio finalizado hace más de dos horas", () => {
    const older = service({ id: "service-older", estado: "finalizado" });
    const current = service({ id: "service-current", estado: "en_curso" });
    const conversations = buildJefeConversations([older, current], {
      "service-older": [
        {
          ...message("old", "cliente", "2026-10-05T09:00:00.000Z"),
          servicioId: "service-older",
        },
      ],
      "service-current": [
        {
          ...message("new", "ia", "2026-10-05T11:00:00.000Z"),
          servicioId: "service-current",
        },
      ],
    });

    expect(conversations).toHaveLength(1);
    expect(conversations[0].service?.id).toBe("service-current");
    expect(conversations[0].messages.map((item) => item.id)).toEqual(["new"]);
    expect(conversations[0].relatedServices.map((item) => item.id)).toContain(
      "service-older",
    );
  });

  it("mantiene un servicio finalizado en Hoy durante dos horas", () => {
    const finishedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const recent = service({
      id: "service-recent",
      estado: "finalizado",
      horaFinServicio: finishedAt,
      updatedAt: finishedAt,
    });
    const conversations = buildJefeConversations(
      [recent],
      {
        "service-recent": [
          {
            ...message("recent", "sistema", finishedAt),
            servicioId: "service-recent",
          },
        ],
      },
      [],
    );

    expect(conversations).toHaveLength(1);
    expect(conversations[0].chatState).toBe("FINALIZED_RECENT");
  });

  it("filtra por atencion y agrupa por empleada", () => {
    const conversations = buildJefeConversations([service()], {
      "service-1": [message("m1", "cliente", "2026-10-05T11:00:00.000Z")],
    });

    expect(
      filterConversations(conversations, "unanswered", "carlos"),
    ).toHaveLength(1);
    expect(filterConversations(conversations, "in_progress", "")).toHaveLength(
      0,
    );
    expect(groupConversationsByEmployee(conversations)[0].employeeName).toBe(
      "Andrea",
    );
  });

  it("suma no leidos solo para mensajes entrantes fuera de la conversacion activa", () => {
    const initial = buildJefeConversations([service()], {
      "service-1": [message("m1", "ia", "2026-10-05T11:00:00.000Z")],
    });
    const next = mergeRealtimeMessage(
      initial,
      message("m2", "cliente", "2026-10-05T11:01:00.000Z"),
      null,
    );

    expect(next[0].unreadCount).toBe(1);
    expect(next[0].needsReply).toBe(true);
    expect(markConversationRead(next, "service-1")[0].unreadCount).toBe(0);
  });

  it("aplica un evento SSE solo a la operacion indicada", () => {
    const first = service({ id: "service-1", estado: "en_curso" });
    const recentlyFinished = new Date(
      Date.now() - 30 * 60 * 1000,
    ).toISOString();
    const second = service({
      id: "service-2",
      estado: "finalizado",
      horaFinServicio: recentlyFinished,
      updatedAt: recentlyFinished,
    });
    const initial = buildJefeConversations([first, second], {
      "service-1": [message("m1", "ia", "2026-10-05T11:00:00.000Z")],
      "service-2": [
        {
          ...message("m2", "ia", "2026-10-05T10:00:00.000Z"),
          servicioId: "service-2",
        },
      ],
    });
    const next = mergeRealtimeMessage(
      initial,
      {
        ...message("incoming", "cliente", "2026-10-05T11:02:00.000Z"),
        servicioId: "service-1",
      },
      null,
    );

    expect(next.find((item) => item.id === "service-1")?.lastMessage).toBe(
      "Mensaje incoming",
    );
    expect(next.find((item) => item.id === "service-2")?.messages).toHaveLength(
      1,
    );
  });

  it("construye tabs y secciones sin mezclar empleadas", () => {
    const andreaService = service({
      id: "service-andrea",
      estado: "en_curso",
      horaInicioServicio: "2026-10-05T10:00:00.000Z",
    });
    const yaelinService = service({
      id: "service-yaelin",
      clienteId: "client-2",
      empleadaId: "employee-2",
      empleada: {
        ...service().empleada!,
        id: "employee-2",
        nombreArtistico: "Yaelin",
      },
      cliente: {
        id: "client-2",
        telegramChatId: "456",
        nombreTelegram: "Luis",
      },
    });
    const conversations = buildJefeConversations(
      [andreaService, yaelinService],
      {
        "service-andrea": [
          {
            ...message("andrea", "ia", "2026-10-05T11:00:00.000Z"),
            servicioId: "service-andrea",
          },
        ],
        "service-yaelin": [
          {
            ...message("yaelin", "cliente", "2026-10-05T11:01:00.000Z"),
            clienteId: "client-2",
            servicioId: "service-yaelin",
          },
        ],
      },
    );
    const employees = [andreaService.empleada!, yaelinService.empleada!];
    const navigation = buildEmployeeNavigation(employees, conversations);
    const andrea = conversationsForEmployee(conversations, "employee-1");
    const radar = buildOperationSections(conversations, "radar");

    expect(navigation.map((item) => item.name)).toEqual([
      "Todas",
      "Andrea",
      "Yaelin",
      "Sin asignar",
    ]);
    expect(
      navigation.find((item) => item.id === "employee-1")?.hasActiveService,
    ).toBe(true);
    expect(
      navigation.find((item) => item.id === "employee-2")?.attentionCount,
    ).toBe(1);
    expect(andrea.map((item) => item.id)).toEqual(["service-andrea"]);
    expect(radar.map((section) => section.id)).toEqual([
      "unanswered",
      "active",
    ]);
  });

  it("mantiene Sin asignar limitado a operaciones autorizadas sin empleada", () => {
    const unassignedService = service({
      id: "service-unassigned",
      clienteId: "client-unassigned",
      empleadaId: "",
      empleada: undefined,
      cliente: {
        id: "client-unassigned",
        telegramChatId: "789",
        nombreTelegram: "Roberto",
      },
      estado: "agendado",
    });
    const conversations = buildJefeConversations([unassignedService], {});
    const navigation = buildEmployeeNavigation([], conversations);

    expect(conversationsForEmployee(conversations, "unassigned")).toHaveLength(
      1,
    );
    expect(
      navigation.find((item) => item.id === "unassigned")?.conversationCount,
    ).toBe(1);
  });

  it("respeta el estado operacional entregado por el backend", () => {
    expect(
      presentServiceState(
        service({ operationalState: "esperando_aceptacion_empleada" }),
      ).label,
    ).toBe("Esperando respuesta");
  });

  it("el takeover mantiene un unico control entre IA y humano", () => {
    const initial = buildJefeConversations([service()], {
      "service-1": [message("m1", "ia", "2026-10-05T11:00:00.000Z")],
    });
    const human = updateConversationMode(initial, "client-1", "HUMAN_ACTIVE");
    const ai = updateConversationMode(human, "client-1", "AI_ACTIVE");

    expect(human[0].mode).toBe("HUMAN_ACTIVE");
    expect(human[0].service?.iaActiva).toBe(false);
    expect(ai[0].mode).toBe("AI_ACTIVE");
    expect(ai[0].service?.iaActiva).toBe(true);
  });

  it("muestra el primer mensaje pre-servicio bajo la empleada elegida", () => {
    const conversations = buildJefeConversations([], {}, [preService()]);

    expect(conversations).toEqual([
      expect.objectContaining({
        id: "session:booking-1",
        employeeId: "employee-1",
        employeeName: "Andrea",
        service: null,
        needsReply: true,
        bookingData: expect.objectContaining({ durationHours: 2 }),
      }),
    ]);
    expect(conversationsForEmployee(conversations, "employee-1")).toHaveLength(
      1,
    );
  });

  it("incorpora por SSE mensajes sin serviceId usando bookingSessionId", () => {
    const initial = buildJefeConversations([], {}, [preService()]);
    const next = mergeRealtimeMessage(
      initial,
      {
        ...message("draft-2", "cliente", "2026-10-06T10:01:00.000Z"),
        servicioId: null,
        bookingSessionId: "booking-1",
        mensaje: "¿Cuánto cuesta?",
      },
      null,
    );

    expect(next[0].messages).toHaveLength(2);
    expect(next[0].lastMessage).toBe("¿Cuánto cuesta?");
    expect(next[0].unreadCount).toBe(1);
  });

  it("reemplaza el borrador por el servicio enlazado sin duplicar la fila", () => {
    const linkedMessage = {
      ...message("draft-1", "cliente", "2026-10-06T10:00:00.000Z"),
      bookingSessionId: "booking-1",
    };
    const conversations = buildJefeConversations(
      [service()],
      { "service-1": [linkedMessage] },
      [preService()],
    );

    expect(conversations).toHaveLength(1);
    expect(conversations[0].id).toBe("service-1");
    expect(conversations[0].bookingSessionId).toBe("booking-1");
    expect(conversations[0].messages.map((item) => item.id)).toEqual([
      "draft-1",
    ]);
  });

  it("mantiene el takeover pre-servicio sin intentar mutar un servicio nulo", () => {
    const initial = buildJefeConversations([], {}, [preService()]);
    const human = updateConversationMode(
      initial,
      "session:booking-1",
      "HUMAN_ACTIVE",
    );

    expect(human[0].mode).toBe("HUMAN_ACTIVE");
    expect(human[0].service).toBeNull();
  });

  it("no muestra autorización para un servicio que espera a la empleada", () => {
    const waiting = service({
      estado: "pendiente",
      operationalState: "esperando_aceptacion_empleada",
    });

    expect(canBossAuthorizeService(waiting)).toBe(false);
    expect(canAssignTransport(waiting)).toBe(false);
  });

  it("expone asignar transporte cuando la empleada ya aceptó", () => {
    const waiting = service({
      estado: "pendiente",
      operationalState: "esperando_transporte_ida",
    });

    expect(canBossAuthorizeService(waiting)).toBe(false);
    expect(canAssignTransport(waiting)).toBe(true);
  });

  it("mantiene autorización para estados previos al envío", () => {
    expect(
      canBossAuthorizeService(
        service({ operationalState: "preparado", estado: "pendiente" }),
      ),
    ).toBe(true);
  });
});
