import type {
  ConversationMessage,
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
  service: Service;
  relatedServices: Service[];
  messages: ConversationMessage[];
  lastMessage: string;
  lastAt: string;
  mode: "AI_ACTIVE" | "HUMAN_ACTIVE";
  needsReply: boolean;
  unreadCount: number;
};

export type EmployeeConversationGroup = {
  employeeId: string;
  employeeName: string;
  conversations: JefeConversation[];
};

const ACTIVE_STATES = new Set(["pendiente", "agendado", "en_curso"]);

function servicePriority(service: Service): number {
  return ACTIVE_STATES.has(service.estado) ? 1 : 0;
}

function compareServices(left: Service, right: Service): number {
  const priority = servicePriority(right) - servicePriority(left);
  if (priority !== 0) return priority;
  return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
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
 * jefe. Un cliente con varios servicios aparece una vez, pero su historial
 * conserva los mensajes de todos esos servicios autorizados.
 */
export function buildJefeConversations(
  services: Service[],
  messagesByService: Record<string, ConversationMessage[]>,
): JefeConversation[] {
  const byClient = new Map<string, Service[]>();

  for (const service of services) {
    if (!service.clienteId) continue;
    const messages = messagesByService[service.id] ?? [];
    if (messages.length === 0) continue;
    const current = byClient.get(service.clienteId) ?? [];
    current.push(service);
    byClient.set(service.clienteId, current);
  }

  return Array.from(byClient.entries())
    .map(([clientId, related]) => {
      const relatedServices = [...related].sort(compareServices);
      const service = relatedServices[0];
      const messages = uniqueMessages(
        relatedServices.flatMap((item) => messagesByService[item.id] ?? []),
      );
      const latest = messages[messages.length - 1];

      return {
        id: clientId,
        clientId,
        clientName: service.cliente?.nombreTelegram?.trim() || "Cliente",
        telegramId: service.cliente?.telegramChatId ?? null,
        employeeId: service.empleadaId,
        employeeName:
          service.empleada?.nombreArtistico?.trim() || "Sin asignar",
        service,
        relatedServices,
        messages,
        lastMessage: latest?.mensaje ?? "Sin mensajes",
        lastAt: latest?.enviadoAt ?? service.updatedAt,
        mode: service.iaActiva ? "AI_ACTIVE" : "HUMAN_ACTIVE",
        needsReply: latest?.emisor === "cliente",
        unreadCount: 0,
      } satisfies JefeConversation;
    })
    .sort(
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
      return ACTIVE_STATES.has(conversation.service.estado);
    if (filter === "in_progress")
      return conversation.service.estado === "en_curso";
    return true;
  });
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
      if (
        conversation.clientId !== message.clienteId &&
        !conversation.relatedServices.some(
          (service) => service.id === message.servicioId,
        )
      ) {
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
  conversationId: string,
  mode: "AI_ACTIVE" | "HUMAN_ACTIVE",
): JefeConversation[] {
  const iaActiva = mode === "AI_ACTIVE";
  return conversations.map((conversation) =>
    conversation.id === conversationId
      ? {
          ...conversation,
          mode,
          service: { ...conversation.service, iaActiva },
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
