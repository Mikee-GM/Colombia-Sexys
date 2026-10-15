"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import CreateServiceDialog from "@/components/services/create-service-dialog";
import {
  getJefeTodaySnapshot,
  sendJefeConversationMessage,
  setJefeConversationMode,
  type JefeTodaySnapshot,
} from "@/lib/actions/jefe-panel";
import type { WorkShiftStatus } from "@/lib/actions/work-shift";
import type { ConversationMessage } from "@/lib/types";
import {
  useJefeRealtime,
  type JefeRealtimeEvent,
} from "@/hooks/useJefeRealtime";
import ConversationInbox from "./ConversationInbox";
import ConversationWorkspace from "./ConversationWorkspace";
import TodayHeader from "./TodayHeader";
import {
  buildJefeConversations,
  markConversationRead,
  mergeRealtimeMessage,
  shouldRefreshTodayWorkspace,
  updateConversationMode,
  type JefeConversation,
} from "./today-model";
import {
  buildClientConversationGroups,
  conversationForClient,
  reconcileConversationDrafts,
  type ClientConversationGroup,
} from "./client-inbox-model";

type MobileView = "inbox" | "chat" | "service";

const ServiceInspector = dynamic(() => import("./ServiceInspector"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-black text-xs text-zinc-600">
      Cargando contexto operacional...
    </div>
  ),
});

function preserveTransientState(
  next: JefeConversation[],
  current: JefeConversation[],
) {
  const previous = new Map(current.map((item) => [item.id, item]));
  return next.map((conversation) => ({
    ...conversation,
    unreadCount: previous.get(conversation.id)?.unreadCount ?? 0,
  }));
}

export default function TodayWorkspace({
  initialSnapshot,
  workShift,
}: {
  initialSnapshot: JefeTodaySnapshot;
  workShift: WorkShiftStatus | null;
}) {
  const [employees, setEmployees] = useState(initialSnapshot.employees);
  const [conversations, setConversations] = useState(() =>
    buildJefeConversations(
      initialSnapshot.services,
      initialSnapshot.messagesByService,
      initialSnapshot.preServiceConversations,
    ),
  );
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const initialConversations = buildJefeConversations(
      initialSnapshot.services,
      initialSnapshot.messagesByService,
      initialSnapshot.preServiceConversations,
    );
    return (
      buildClientConversationGroups(initialConversations)[0]?.latest.id ?? null
    );
  });
  const [view, setView] = useState<MobileView>("inbox");
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const previousConversations = useRef(conversations);
  const text = selectedId ? (drafts[selectedId] ?? "") : "";
  const [sending, setSending] = useState(false);
  const [changingMode, setChangingMode] = useState(false);
  const [creatingService, setCreatingService] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshInFlight = useRef(false);
  const refreshQueued = useRef(false);
  const refreshRequest = useRef(0);
  const activityRevision = useRef(0);
  const mounted = useRef(true);
  const selectionByClient = useRef(new Map<string, string>());
  const selectedContext = useRef<{
    clientId: string;
    bookingSessionId: string | null;
  } | null>(null);

  const selected =
    conversations.find((conversation) => conversation.id === selectedId) ??
    null;
  const clientGroups = useMemo(
    () => buildClientConversationGroups(conversations),
    [conversations],
  );
  const visibleClientGroups = useMemo(
    () => buildClientConversationGroups(conversations, search),
    [conversations, search],
  );
  const selectedClient = clientGroups.find((group) =>
    group.conversations.some((thread) => thread.id === selectedId),
  );

  function setText(value: string) {
    if (!selectedId) return;
    setDrafts((current) => ({ ...current, [selectedId]: value }));
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      refreshRequest.current += 1;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
      refreshQueued.current = false;
    };
  }, []);

  useEffect(() => {
    const previous = previousConversations.current;
    previousConversations.current = conversations;
    setDrafts((current) =>
      reconcileConversationDrafts(current, previous, conversations),
    );
  }, [conversations]);

  useEffect(() => {
    if (selected && selectedClient) {
      selectedContext.current = {
        clientId: selected.clientId,
        bookingSessionId: selected.bookingSessionId,
      };
      selectionByClient.current.set(selectedClient.id, selected.id);
      return;
    }
    const previous = selectedContext.current;
    const matches = previous?.bookingSessionId
      ? conversations.filter(
          (thread) =>
            thread.clientId === previous.clientId &&
            thread.bookingSessionId === previous.bookingSessionId,
        )
      : [];
    const linked = matches.length === 1 ? matches[0] : null;
    const previousClient = clientGroups.find((group) =>
      group.conversations.some(
        (thread) => thread.clientId === previous?.clientId,
      ),
    );
    setSelectedId(
      linked?.id ??
        previousClient?.latest.id ??
        clientGroups[0]?.latest.id ??
        null,
    );
  }, [clientGroups, conversations, selected, selectedClient]);

  const refresh = useCallback(async function refreshSnapshot() {
    if (!mounted.current) return;
    if (refreshInFlight.current) {
      refreshQueued.current = true;
      return;
    }
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = null;
    refreshInFlight.current = true;
    refreshQueued.current = false;
    const request = ++refreshRequest.current;
    const revision = activityRevision.current;
    try {
      const snapshot = await getJefeTodaySnapshot();
      if (!mounted.current || request !== refreshRequest.current) return;
      // No reemplazar eventos recientes con una lectura iniciada antes de
      // recibirlos. Releer respeta también eliminaciones y permisos actuales.
      if (revision !== activityRevision.current) {
        refreshQueued.current = true;
        return;
      }
      setEmployees(snapshot.employees);
      setConversations((current) =>
        preserveTransientState(
          buildJefeConversations(
            snapshot.services,
            snapshot.messagesByService,
            snapshot.preServiceConversations,
          ),
          current,
        ),
      );
      setRefreshError(false);
    } catch {
      if (mounted.current && request === refreshRequest.current) {
        setRefreshError(true);
      }
    } finally {
      refreshInFlight.current = false;
      if (mounted.current && refreshQueued.current) {
        // Una sola reconciliación diferida: las ráfagas SSE no deben crear
        // consultas paralelas ni un bucle inmediato de lecturas completas.
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => {
          refreshTimer.current = null;
          void refreshSnapshot();
        }, 500);
      }
    }
  }, []);

  const scheduleRefresh = useCallback(() => {
    activityRevision.current += 1;
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      void refresh();
    }, 500);
  }, [refresh]);

  const handleRealtime = useCallback(
    (event: JefeRealtimeEvent) => {
      if (event.type === "chat_message" && event.data) {
        const message = event.data as ConversationMessage;
        activityRevision.current += 1;
        setConversations((current) => {
          const belongs = current.some(
            (conversation) =>
              conversation.service?.id === message.servicioId ||
              (Boolean(message.bookingSessionId) &&
                conversation.bookingSessionId === message.bookingSessionId),
          );
          if (!belongs) scheduleRefresh();
          return mergeRealtimeMessage(current, message, selectedId);
        });
        return;
      }

      if (event.type === "conversation_mode_changed" && event.data) {
        activityRevision.current += 1;
        const data = event.data as {
          bookingSessionId?: string;
          clientId?: string;
          mode?: "AI_ACTIVE" | "HUMAN_ACTIVE";
        };
        const conversationId = data.bookingSessionId
          ? `session:${data.bookingSessionId}`
          : data.clientId;
        if (conversationId && data.mode) {
          setConversations((current) =>
            updateConversationMode(current, conversationId, data.mode!),
          );
        }
        return;
      }

      if (shouldRefreshTodayWorkspace(event.type)) scheduleRefresh();
    },
    [scheduleRefresh, selectedId],
  );

  useJefeRealtime({ onEvent: handleRealtime, onConnected: scheduleRefresh });

  function selectConversation(conversationId: string) {
    const conversation = conversations.find(
      (item) => item.id === conversationId,
    );
    if (!conversation) return;
    setSelectedId(conversationId);
    setConversations((current) =>
      markConversationRead(current, conversationId),
    );
    setView("chat");
  }

  function selectClient(group: ClientConversationGroup) {
    const remembered = group.conversations.some(
      (thread) => thread.id === selectedId,
    )
      ? selectedId
      : selectionByClient.current.get(group.id);
    selectConversation(conversationForClient(group, remembered));
  }

  async function toggleMode() {
    if (!selected || changingMode) return;
    setChangingMode(true);
    const iaActiva = selected.mode === "HUMAN_ACTIVE";
    try {
      const result = await setJefeConversationMode({
        serviceId: selected.service?.id ?? null,
        bookingSessionId: selected.bookingSessionId,
        clientId: selected.clientId,
        iaActiva,
      });
      if (!result.success) return toast.error(result.error);
      activityRevision.current += 1;
      setConversations((current) =>
        updateConversationMode(
          current,
          selected.id,
          iaActiva ? "AI_ACTIVE" : "HUMAN_ACTIVE",
        ),
      );
      toast.success(
        iaActiva
          ? "Conversación devuelta a la IA"
          : "Ahora controlas la conversación",
      );
      scheduleRefresh();
    } finally {
      setChangingMode(false);
    }
  }

  async function send() {
    const value = text.trim();
    if (!selected || !value || sending || selected.mode !== "HUMAN_ACTIVE")
      return;
    setSending(true);
    try {
      const result = await sendJefeConversationMessage({
        serviceId: selected.service?.id ?? null,
        bookingSessionId: selected.bookingSessionId,
        clientId: selected.clientId,
        mode: selected.mode,
        message: value,
      });
      if (!result.success) return toast.error(result.error);
      activityRevision.current += 1;
      setDrafts((current) =>
        current[selected.id] === text
          ? { ...current, [selected.id]: "" }
          : current,
      );
      setConversations((current) =>
        mergeRealtimeMessage(current, result.data, selected.id),
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <TodayHeader
        workShift={workShift}
        onCreateService={() => setCreatingService(true)}
      />
      <div className="relative flex h-[calc(100dvh-11.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-black lg:h-[calc(100dvh-5rem)] lg:min-h-[620px]">
        {refreshError && (
          <div
            role="alert"
            className="m-3 mb-0 flex shrink-0 flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-100"
          >
            <p className="min-w-0 flex-1">
              No se pudo actualizar el historial. Los datos visibles pueden
              estar desactualizados.
            </p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="min-h-11 rounded-lg border border-amber-500/40 px-4 font-semibold focus-visible:outline-2 focus-visible:outline-amber-300"
            >
              Reintentar
            </button>
          </div>
        )}
        <div className="relative min-h-0 flex-1 xl:grid xl:grid-cols-[minmax(260px,0.78fr)_minmax(420px,1.55fr)_minmax(285px,0.9fr)]">
          <div
            className={`${view === "inbox" ? "block" : "hidden"} h-full min-h-0 lg:block lg:w-[310px] xl:w-auto`}
          >
            <ConversationInbox
              groups={visibleClientGroups}
              total={clientGroups.length}
              search={search}
              selectedId={selectedId}
              onSearch={setSearch}
              onSelect={selectClient}
            />
          </div>

          <div
            className={`${view === "chat" ? "block" : "hidden"} h-full min-h-0 min-w-0 lg:absolute lg:inset-y-0 lg:left-[310px] lg:right-0 lg:block xl:static`}
          >
            <ConversationWorkspace
              conversation={selected}
              clientConversations={selectedClient?.conversations ?? []}
              text={text}
              sending={sending}
              changingMode={changingMode}
              onTextChange={setText}
              onSend={send}
              onToggleMode={toggleMode}
              onBack={() => setView("inbox")}
              onOpenService={() => setView("service")}
              onSelectConversation={selectConversation}
            />
          </div>

          <div
            className={`${view === "service" ? "fixed inset-0 z-[60] block h-[100dvh]" : "hidden"} min-h-0 border-l border-zinc-800 bg-black lg:absolute lg:inset-y-0 lg:left-auto lg:z-30 lg:h-full lg:w-[380px] lg:shadow-2xl xl:static xl:z-auto xl:block xl:h-full xl:w-auto xl:shadow-none`}
          >
            <ServiceInspector
              key={selected?.id ?? "empty"}
              conversation={selected}
              employees={employees}
              onClose={() => setView("chat")}
              onRefresh={refresh}
              onTakeover={async () => {
                await toggleMode();
              }}
            />
          </div>
        </div>
      </div>

      <CreateServiceDialog
        open={creatingService}
        onClose={() => setCreatingService(false)}
        initialEmployees={employees}
        onCreated={() => void refresh()}
      />
    </>
  );
}
