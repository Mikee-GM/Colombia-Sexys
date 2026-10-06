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
import { useJefeRealtime, type JefeRealtimeEvent } from "@/hooks/useJefeRealtime";
import ConversationInbox from "./ConversationInbox";
import ConversationWorkspace from "./ConversationWorkspace";
import EmployeeTabStrip from "./EmployeeTabStrip";
import TodayHeader from "./TodayHeader";
import {
  buildEmployeeNavigation,
  buildJefeConversations,
  buildOperationSections,
  conversationsForEmployee,
  markConversationRead,
  mergeRealtimeMessage,
  updateConversationMode,
  type EmployeeTabId,
  type JefeConversation,
} from "./today-model";

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

function firstConversationId(
  conversations: JefeConversation[],
  employeeId: EmployeeTabId,
) {
  const sections = buildOperationSections(
    conversationsForEmployee(conversations, employeeId),
    employeeId === "all" ? "radar" : "employee",
  );
  return sections[0]?.conversations[0]?.id ?? null;
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
    ),
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    () => {
      const initialConversations = buildJefeConversations(
        initialSnapshot.services,
        initialSnapshot.messagesByService,
      );
      return firstConversationId(initialConversations, "all");
    },
  );
  const [selectedEmployeeId, setSelectedEmployeeId] =
    useState<EmployeeTabId>("all");
  const [view, setView] = useState<MobileView>("inbox");
  const [search, setSearch] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [changingMode, setChangingMode] = useState(false);
  const [creatingService, setCreatingService] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectionByEmployee = useRef(new Map<EmployeeTabId, string>());

  const selected =
    conversations.find((conversation) => conversation.id === selectedId) ?? null;
  const employeeNavigation = useMemo(
    () => buildEmployeeNavigation(employees, conversations),
    [employees, conversations],
  );
  const employeeConversations = useMemo(
    () => conversationsForEmployee(conversations, selectedEmployeeId),
    [conversations, selectedEmployeeId],
  );
  const sections = useMemo(
    () =>
      buildOperationSections(
        employeeConversations,
        selectedEmployeeId === "all" ? "radar" : "employee",
        search,
      ),
    [employeeConversations, search, selectedEmployeeId],
  );
  const selectedEmployee = employeeNavigation.find(
    (employee) => employee.id === selectedEmployeeId,
  );

  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (
      selectedId &&
      employeeConversations.some(
        (conversation) => conversation.id === selectedId,
      )
    ) {
      return;
    }
    const remembered = selectionByEmployee.current.get(selectedEmployeeId);
    const next = employeeConversations.find(
      (conversation) => conversation.id === remembered,
    );
    setSelectedId(
      next?.id ?? firstConversationId(conversations, selectedEmployeeId),
    );
  }, [conversations, employeeConversations, selectedEmployeeId, selectedId]);

  const refresh = useCallback(async () => {
    try {
      const snapshot = await getJefeTodaySnapshot();
      setEmployees(snapshot.employees);
      setConversations((current) =>
        preserveTransientState(
          buildJefeConversations(snapshot.services, snapshot.messagesByService),
          current,
        ),
      );
    } catch {
      // Los eventos siguientes volveran a intentar la reconciliacion.
    }
  }, []);

  const scheduleRefresh = useCallback(() => {
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
        setConversations((current) => {
          const belongs = current.some(
            (conversation) =>
              conversation.service.id === message.servicioId,
          );
          if (!belongs) scheduleRefresh();
          return mergeRealtimeMessage(current, message, selectedId);
        });
        return;
      }

      if (event.type === "conversation_mode_changed" && event.data) {
        const data = event.data as {
          clientId?: string;
          mode?: "AI_ACTIVE" | "HUMAN_ACTIVE";
        };
        if (data.clientId && data.mode) {
          setConversations((current) =>
            updateConversationMode(current, data.clientId!, data.mode!),
          );
        }
        return;
      }

      if (event.type !== "heartbeat") scheduleRefresh();
    },
    [scheduleRefresh, selectedId],
  );

  useJefeRealtime({ onEvent: handleRealtime, onConnected: scheduleRefresh });

  function selectConversation(conversationId: string) {
    setSelectedId(conversationId);
    selectionByEmployee.current.set(selectedEmployeeId, conversationId);
    const conversation = conversations.find(
      (item) => item.id === conversationId,
    );
    if (conversation?.employeeId) {
      selectionByEmployee.current.set(
        conversation.employeeId,
        conversationId,
      );
    }
    setConversations((current) =>
      markConversationRead(current, conversationId),
    );
    setText("");
    setView("chat");
  }

  function selectEmployee(employeeId: EmployeeTabId) {
    if (employeeId === selectedEmployeeId) return;
    if (selectedId) {
      selectionByEmployee.current.set(selectedEmployeeId, selectedId);
    }
    const scoped = conversationsForEmployee(conversations, employeeId);
    const remembered = selectionByEmployee.current.get(employeeId);
    const next = scoped.find(
      (conversation) =>
        conversation.id === remembered || conversation.id === selectedId,
    );
    setSelectedEmployeeId(employeeId);
    setSelectedId(
      next?.id ?? firstConversationId(conversations, employeeId),
    );
    setSearch("");
    setText("");
    setView("inbox");
  }

  async function toggleMode() {
    if (!selected || changingMode) return;
    setChangingMode(true);
    const iaActiva = selected.mode === "HUMAN_ACTIVE";
    try {
      const result = await setJefeConversationMode(
        selected.service.id,
        selected.clientId,
        iaActiva,
      );
      if (!result.success) return toast.error(result.error);
      setConversations((current) =>
        updateConversationMode(
          current,
          selected.clientId,
          iaActiva ? "AI_ACTIVE" : "HUMAN_ACTIVE",
        ),
      );
      toast.success(
        iaActiva ? "Conversación devuelta a la IA" : "Ahora controlas la conversación",
      );
      scheduleRefresh();
    } finally {
      setChangingMode(false);
    }
  }

  async function send() {
    const value = text.trim();
    if (!selected || !value || sending || selected.mode !== "HUMAN_ACTIVE") return;
    setSending(true);
    try {
      const result = await sendJefeConversationMessage(
        selected.service.id,
        selected.clientId,
        value,
      );
      if (!result.success) return toast.error(result.error);
      setText("");
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
      <div className="relative flex h-[calc(100dvh-11.5rem)] min-h-[520px] flex-col overflow-hidden rounded-xl border border-zinc-800 bg-black md:h-[calc(100dvh-5rem)] md:min-h-[620px]">
        <EmployeeTabStrip
          items={employeeNavigation}
          selectedId={selectedEmployeeId}
          onSelect={selectEmployee}
        />
        <div className="relative min-h-0 flex-1 xl:grid xl:grid-cols-[minmax(260px,0.78fr)_minmax(420px,1.55fr)_minmax(285px,0.9fr)]">
          <div
            className={`${view === "inbox" ? "block" : "hidden"} h-full min-h-0 md:block md:w-[310px] xl:w-auto`}
          >
            <ConversationInbox
              sections={sections}
              radar={selectedEmployeeId === "all" && !search.trim()}
              title={
                selectedEmployeeId === "all"
                  ? "Radar operacional"
                  : selectedEmployee?.name ?? "Conversaciones"
              }
              total={employeeConversations.length}
              search={search}
              selectedId={selectedId}
              onSearch={setSearch}
              onSelect={selectConversation}
            />
          </div>

          <div
            className={`${view === "chat" ? "block" : "hidden"} h-full min-h-0 min-w-0 md:absolute md:inset-y-0 md:left-[310px] md:right-0 md:block xl:static`}
          >
            <ConversationWorkspace
              conversation={selected}
              text={text}
              sending={sending}
              changingMode={changingMode}
              onTextChange={setText}
              onSend={send}
              onToggleMode={toggleMode}
              onBack={() => setView("inbox")}
              onOpenService={() => setView("service")}
            />
          </div>

          <div
            className={`${view === "service" ? "absolute inset-0 z-30 block" : "hidden"} h-full min-h-0 border-l border-zinc-800 bg-black md:left-auto md:w-[380px] md:shadow-2xl xl:static xl:block xl:w-auto xl:shadow-none`}
          >
            <ServiceInspector
              key={selected?.service.id ?? "empty"}
              conversation={selected}
              employees={employees}
              onClose={() => setView("chat")}
              onRefresh={refresh}
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
