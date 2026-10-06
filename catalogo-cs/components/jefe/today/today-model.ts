import type {
  ConversationMessage,
  Employee,
  PreServiceConversation,
  Service,
  ServiceOperationState,
} from "@/lib/types";

export type TodayFilter = "all" | "unanswered" | "service" | "in_progress";

export type JefeConversation = {
  id: string;
  clientId: string;
  clientName: string;
  telegramId: string | null;
  employeeId: string;
  employeeName: string;
  service: Service | null;
  bookingSessionId: string | null;
  bookingData: PreServiceConversation["bookingData"] | null;
  relatedServices: Service[];
  messages: ConversationMessage[];
  lastMessage: string;
  lastAt: string;
  mode: "AI_ACTIVE" | "HUMAN_ACTIVE";
  needsReply: boolean;
  unreadCount: number;
};

export type EmployeeTabId = string;

export type EmployeeNavigationItem = {
  id: EmployeeTabId;
  name: string;
  available: boolean | null;
  hasActiveService: boolean;
  attentionCount: number;
  conversationCount: number;
};

export type OperationSectionKind =
  | "attention"
  | "unanswered"
  | "active"
  | "scheduled"
  | "conversations"
  | "results";

export type OperationSection = {
  id: OperationSectionKind;
  label: string;
  conversations: JefeConversation[];
};

export type EmployeeConversationGroup = {
  employeeId: string;
  employeeName: string;
  conversations: JefeConversation[];
};

const ACTIVE_STATES = new Set(["pendiente", "agendado", "en_curso"]);
const ATTENTION_OPERATION_STATES = new Set<ServiceOperationState>([
  "preparado",
  "esperando_aceptacion_empleada",
  "esperando_transporte_ida",
  "preparando_regreso",
]);

function servicePriority(service: Service): number {
  return ACTIVE_STATES.has(service.estado) ? 1 : 0;
}

function compareServices(left: Service, right: Service): number {
  const priority = servicePriority(right) - servicePriority(left);
  if (priority !== 0) return priority;
  return (
    new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  );
}

function uniqueMessages(messages: ConversationMessage[]) {
  return Array.from(
    new Map(messages.map((message) => [message.id, message])).values(),
  ).sort(
    (left, right) =>
      new Date(left.enviadoAt).getTime() - new Date(right.enviadoAt).getTime(),
  );
}

/**
 * Construye la bandeja solo con servicios que el backend ya autorizo para el
 * jefe. Cada fila representa una operacion concreta: un mismo cliente puede
 * aparecer varias veces si tuvo servicios distintos.
 */
export function buildJefeConversations(
  services: Service[],
  messagesByService: Record<string, ConversationMessage[]>,
  preServiceConversations: PreServiceConversation[] = [],
): JefeConversation[] {
  const byClient = new Map<string, Service[]>();

  for (const service of services) {
    if (!service.clienteId) continue;
    const current = byClient.get(service.clienteId) ?? [];
    current.push(service);
    byClient.set(service.clienteId, current);
  }

  const serviceConversations = services
    .filter((service) => {
      if (!service.clienteId) return false;
      return (
        (messagesByService[service.id] ?? []).length > 0 ||
        ACTIVE_STATES.has(service.estado)
      );
    })
    .map((service) => {
      const clientId = service.clienteId;
      const relatedServices = [...(byClient.get(clientId) ?? [service])].sort(
        compareServices,
      );
      const messages = uniqueMessages(messagesByService[service.id] ?? []);
      const latest = messages[messages.length - 1];
      const bookingSessionId =
        messages.find((message) => message.bookingSessionId)
          ?.bookingSessionId ?? null;

      return {
        id: service.id,
        clientId,
        clientName: service.cliente?.nombreTelegram?.trim() || "Cliente",
        telegramId: service.cliente?.telegramChatId ?? null,
        employeeId: service.empleadaId,
        employeeName:
          service.empleada?.nombreArtistico?.trim() || "Sin asignar",
        service,
        bookingSessionId,
        bookingData: null,
        relatedServices,
        messages,
        lastMessage: latest?.mensaje ?? "Sin mensajes",
        lastAt: latest?.enviadoAt ?? service.updatedAt,
        mode: service.iaActiva ? "AI_ACTIVE" : "HUMAN_ACTIVE",
        needsReply: latest?.emisor === "cliente",
        unreadCount: 0,
      } satisfies JefeConversation;
    });

  const linkedBookingSessionIds = new Set(
    serviceConversations
      .map((conversation) => conversation.bookingSessionId)
      .filter((id): id is string => Boolean(id)),
  );
  const draftConversations = preServiceConversations
    .filter(
      (conversation) =>
        !linkedBookingSessionIds.has(conversation.bookingSessionId),
    )
    .map(
      (conversation) =>
        ({
          id: `session:${conversation.bookingSessionId}`,
          clientId: conversation.client.id,
          clientName: conversation.client.name?.trim() || "Cliente",
          telegramId: conversation.client.telegramId,
          employeeId: conversation.intendedEmployee?.id ?? "",
          employeeName:
            conversation.intendedEmployee?.name?.trim() || "Sin asignar",
          service: null,
          bookingSessionId: conversation.bookingSessionId,
          bookingData: conversation.bookingData,
          relatedServices: [
            ...(byClient.get(conversation.client.id) ?? []),
          ].sort(compareServices),
          messages: uniqueMessages(conversation.messages),
          lastMessage: conversation.lastMessage,
          lastAt: conversation.lastAt,
          mode: conversation.mode,
          needsReply: conversation.needsReply,
          unreadCount: 0,
        }) satisfies JefeConversation,
    );

  return [...serviceConversations, ...draftConversations].sort(
    (left, right) =>
      new Date(right.lastAt).getTime() - new Date(left.lastAt).getTime(),
  );
}

export function filterConversations(
  conversations: JefeConversation[],
  filter: TodayFilter,
  search: string,
): JefeConversation[] {
  const term = search.trim().toLocaleLowerCase("es-MX");
  return conversations.filter((conversation) => {
    const matchesSearch =
      !term ||
      conversation.clientName.toLocaleLowerCase("es-MX").includes(term) ||
      conversation.employeeName.toLocaleLowerCase("es-MX").includes(term) ||
      conversation.lastMessage.toLocaleLowerCase("es-MX").includes(term) ||
      conversation.telegramId?.includes(term);

    if (!matchesSearch) return false;
    if (filter === "unanswered") return conversation.needsReply;
    if (filter === "service")
      return conversation.service
        ? ACTIVE_STATES.has(conversation.service.estado)
        : false;
    if (filter === "in_progress")
      return conversation.service?.estado === "en_curso";
    return true;
  });
}

export function conversationNeedsAttention(
  conversation: JefeConversation,
): boolean {
  if (!conversation.service) {
    return conversation.needsReply || conversation.unreadCount > 0;
  }
  const state =
    conversation.service.operationalState ??
    legacyOperationState(conversation.service);
  return (
    conversation.needsReply ||
    conversation.unreadCount > 0 ||
    ATTENTION_OPERATION_STATES.has(state)
  );
}

export function buildEmployeeNavigation(
  employees: Employee[],
  conversations: JefeConversation[],
): EmployeeNavigationItem[] {
  const byEmployee = new Map<string, JefeConversation[]>();
  for (const conversation of conversations) {
    const key = conversation.employeeId || "unassigned";
    const scoped = byEmployee.get(key) ?? [];
    scoped.push(conversation);
    byEmployee.set(key, scoped);
  }

  const itemFor = (
    id: EmployeeTabId,
    name: string,
    available: boolean | null,
    scoped: JefeConversation[],
  ): EmployeeNavigationItem => ({
    id,
    name,
    available,
    hasActiveService: scoped.some(
      (conversation) => conversation.service?.estado === "en_curso",
    ),
    attentionCount: scoped.filter(conversationNeedsAttention).length,
    conversationCount: scoped.length,
  });

  const employeeItems = [...employees]
    .sort((left, right) =>
      left.nombreArtistico.localeCompare(right.nombreArtistico, "es"),
    )
    .map((employee) =>
      itemFor(
        employee.id,
        employee.nombreArtistico,
        employee.disponible,
        byEmployee.get(employee.id) ?? [],
      ),
    );
  const unassigned = byEmployee.get("unassigned") ?? [];

  return [
    itemFor("all", "Todas", null, conversations),
    ...employeeItems,
    itemFor("unassigned", "Sin asignar", null, unassigned),
  ];
}

export function conversationsForEmployee(
  conversations: JefeConversation[],
  employeeId: EmployeeTabId,
): JefeConversation[] {
  if (employeeId === "all") return conversations;
  if (employeeId === "unassigned") {
    return conversations.filter((conversation) => !conversation.employeeId);
  }
  return conversations.filter(
    (conversation) => conversation.employeeId === employeeId,
  );
}

function isScheduled(conversation: JefeConversation): boolean {
  return (
    conversation.service?.estado === "agendado" ||
    conversation.service?.tipoAgenda === "programado"
  );
}

export function buildOperationSections(
  conversations: JefeConversation[],
  scope: "radar" | "employee",
  search = "",
): OperationSection[] {
  const matches = filterConversations(conversations, "all", search);
  if (search.trim()) {
    return matches.length > 0
      ? [{ id: "results", label: "Resultados", conversations: matches }]
      : [];
  }

  const remaining = new Set(matches.map((conversation) => conversation.id));
  const take = (
    predicate: (conversation: JefeConversation) => boolean,
  ): JefeConversation[] =>
    matches.filter((conversation) => {
      if (!remaining.has(conversation.id) || !predicate(conversation)) {
        return false;
      }
      remaining.delete(conversation.id);
      return true;
    });

  const sections: OperationSection[] = [
    {
      id: "attention",
      label: "Requiere atención",
      conversations: take(
        (conversation) =>
          !conversation.needsReply && conversationNeedsAttention(conversation),
      ),
    },
    {
      id: "unanswered",
      label: "Sin responder",
      conversations: take((conversation) => conversation.needsReply),
    },
    {
      id: "active",
      label: "Servicios activos",
      conversations: take(
        (conversation) => conversation.service?.estado === "en_curso",
      ),
    },
    {
      id: "scheduled",
      label: "Próximos y agendados",
      conversations: take(isScheduled),
    },
  ];

  if (scope === "employee") {
    sections.push({
      id: "conversations",
      label: "Conversaciones",
      conversations: matches.filter((conversation) =>
        remaining.has(conversation.id),
      ),
    });
  }

  return sections.filter((section) => section.conversations.length > 0);
}

export function groupConversationsByEmployee(
  conversations: JefeConversation[],
): EmployeeConversationGroup[] {
  const groups = new Map<string, EmployeeConversationGroup>();
  for (const conversation of conversations) {
    const key = conversation.employeeId || "unassigned";
    const group = groups.get(key) ?? {
      employeeId: key,
      employeeName: conversation.employeeName || "Sin asignar",
      conversations: [],
    };
    group.conversations.push(conversation);
    groups.set(key, group);
  }
  return Array.from(groups.values()).sort((left, right) =>
    left.employeeName.localeCompare(right.employeeName, "es"),
  );
}

export function mergeRealtimeMessage(
  conversations: JefeConversation[],
  message: ConversationMessage,
  selectedConversationId: string | null,
): JefeConversation[] {
  return conversations
    .map((conversation) => {
      const belongsToService =
        Boolean(conversation.service) &&
        conversation.service?.id === message.servicioId;
      const belongsToSession =
        !conversation.service &&
        Boolean(conversation.bookingSessionId) &&
        conversation.bookingSessionId === message.bookingSessionId;
      if (!belongsToService && !belongsToSession) {
        return conversation;
      }
      if (conversation.messages.some((item) => item.id === message.id)) {
        return conversation;
      }
      const messages = uniqueMessages([...conversation.messages, message]);
      const latest = messages[messages.length - 1];
      return {
        ...conversation,
        messages,
        lastMessage: latest.mensaje,
        lastAt: latest.enviadoAt,
        needsReply: latest.emisor === "cliente",
        mode:
          latest.iaActiva === undefined
            ? conversation.mode
            : latest.iaActiva
              ? "AI_ACTIVE"
              : "HUMAN_ACTIVE",
        unreadCount:
          selectedConversationId === conversation.id ||
          message.emisor !== "cliente"
            ? conversation.unreadCount
            : conversation.unreadCount + 1,
      };
    })
    .sort(
      (left, right) =>
        new Date(right.lastAt).getTime() - new Date(left.lastAt).getTime(),
    );
}

export function markConversationRead(
  conversations: JefeConversation[],
  conversationId: string,
): JefeConversation[] {
  return conversations.map((conversation) =>
    conversation.id === conversationId
      ? { ...conversation, unreadCount: 0 }
      : conversation,
  );
}

export function updateConversationMode(
  conversations: JefeConversation[],
  conversationIdOrClientId: string,
  mode: "AI_ACTIVE" | "HUMAN_ACTIVE",
): JefeConversation[] {
  const iaActiva = mode === "AI_ACTIVE";
  return conversations.map((conversation) =>
    conversation.id === conversationIdOrClientId ||
    conversation.clientId === conversationIdOrClientId
      ? {
          ...conversation,
          mode,
          service: conversation.service
            ? { ...conversation.service, iaActiva }
            : null,
        }
      : conversation,
  );
}

export type ServiceStatePresentation = {
  label: string;
  summary: string;
  tone: "gold" | "blue" | "green" | "zinc" | "red";
};

const OPERATION_PRESENTATION: Record<
  ServiceOperationState,
  ServiceStatePresentation
> = {
  preparacion: {
    label: "Preparando solicitud",
    summary: "Revisa los datos antes de continuar.",
    tone: "gold",
  },
  preparado: {
    label: "Solicitud preparada",
    summary: "La solicitud esta lista para asignarse.",
    tone: "gold",
  },
  asignado: {
    label: "Servicio asignado",
    summary: "La solicitud ya tiene una empleada asignada.",
    tone: "gold",
  },
  esperando_aceptacion_empleada: {
    label: "Esperando respuesta",
    summary: "La empleada debe aceptar o rechazar el servicio.",
    tone: "gold",
  },
  aceptado: {
    label: "Aceptado",
    summary: "Prepara el transporte de ida.",
    tone: "blue",
  },
  esperando_transporte_ida: {
    label: "Esperando transporte",
    summary: "El transporte de ida necesita atencion.",
    tone: "blue",
  },
  transporte_ida_asignado: {
    label: "Transporte asignado",
    summary: "Espera a que la empleada inicie el trayecto.",
    tone: "blue",
  },
  empleada_en_camino: {
    label: "En camino",
    summary: "Da seguimiento al traslado de ida.",
    tone: "blue",
  },
  empleada_llego: {
    label: "Empleada en destino",
    summary: "La empleada puede iniciar desde su portal.",
    tone: "green",
  },
  en_curso: {
    label: "Servicio en curso",
    summary: "Supervisa el contexto y atiende incidencias.",
    tone: "green",
  },
  preparando_regreso: {
    label: "Preparando regreso",
    summary: "Selecciona el transporte de regreso.",
    tone: "blue",
  },
  transporte_regreso_asignado: {
    label: "Regreso asignado",
    summary: "Espera a que comience el traslado de regreso.",
    tone: "blue",
  },
  empleada_de_regreso: {
    label: "De regreso",
    summary: "Da seguimiento hasta que llegue a casa.",
    tone: "blue",
  },
  finalizado: {
    label: "Finalizado",
    summary: "No hay acciones operacionales pendientes.",
    tone: "zinc",
  },
  rechazado: {
    label: "Rechazado",
    summary: "La solicitud fue rechazada.",
    tone: "red",
  },
  cancelado: {
    label: "Cancelado",
    summary: "El servicio fue cancelado.",
    tone: "red",
  },
  expirado: {
    label: "Expirado",
    summary: "La solicitud expiro sin completarse.",
    tone: "red",
  },
};

export function legacyOperationState(service: Service): ServiceOperationState {
  if (service.estado === "agendado") return "asignado";
  if (service.estado === "en_curso") return "en_curso";
  if (service.estado === "finalizado")
    return service.horaLlegadaCasa ? "finalizado" : "preparando_regreso";
  if (service.estado === "cancelado") return "cancelado";
  return "preparacion";
}

export function presentServiceState(
  service: Service,
): ServiceStatePresentation {
  return OPERATION_PRESENTATION[
    service.operationalState ?? legacyOperationState(service)
  ];
}
