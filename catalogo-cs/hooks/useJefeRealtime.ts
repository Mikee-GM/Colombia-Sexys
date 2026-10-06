"use client";

import { useEffect, useRef } from "react";

export type JefeRealtimeEvent = {
  type?: string;
  data?: unknown;
};

export function useJefeRealtime({
  onEvent,
  onConnected,
}: {
  onEvent: (event: JefeRealtimeEvent) => void;
  onConnected?: () => void;
}) {
  const eventHandler = useRef(onEvent);
  const connectedHandler = useRef(onConnected);

  useEffect(() => {
    eventHandler.current = onEvent;
    connectedHandler.current = onConnected;
  }, [onEvent, onConnected]);

  useEffect(() => {
    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    function connect() {
      if (closed) return;
      source = new EventSource("/api/realtime/sse", { withCredentials: true });
      source.onopen = () => connectedHandler.current?.();
      source.onmessage = (message) => {
        try {
          eventHandler.current(JSON.parse(message.data) as JefeRealtimeEvent);
        } catch {
          // El siguiente evento valido vuelve a reconciliar el estado.
        }
      };
      source.onerror = () => {
        source?.close();
        source = null;
        if (!closed && !reconnectTimer) {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connect();
          }, 3000);
        }
      };
    }

    connect();
    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      source?.close();
    };
  }, []);
}
