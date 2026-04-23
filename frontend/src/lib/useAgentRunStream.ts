import { useState, useEffect } from 'react';

export type LogEntry = {
  entryId: string;
  step: number;
  status: string;
  message?: string;
  tool?: string;
};

function createLogEntryId() {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useAgentRunStream(runId: string, runAccessToken: string | null) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!runId || !runAccessToken) {
      return;
    }

    // In production, NEXT_PUBLIC_WS_URL comes from API Gateway exports
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'wss://demo-ws.execute-api.us-east-1.amazonaws.com/dev';
    // Remove trailing slash if the user accidentally included one in their env vars
    const cleanWsUrl = wsUrl.replace(/\/+$/, "");
    const query = new URLSearchParams({ runId, runAccessToken });
    const ws = new WebSocket(`${cleanWsUrl}?${query.toString()}`);

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);

    ws.onmessage = (e) => {
      try {
        const entry = JSON.parse(e.data) as Omit<LogEntry, "entryId">;
        setLogs(prev => [...prev, { ...entry, entryId: createLogEntryId() }]);
      } catch (err) {
        console.error("Failed to parse websocket message", err);
      }
    };

    return () => {
      if (ws.readyState === 1) ws.close();
    };
  }, [runId, runAccessToken]);

  return { logs, isConnected };
}
