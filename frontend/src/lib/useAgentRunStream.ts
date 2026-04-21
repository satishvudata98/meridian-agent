import { useState, useEffect } from 'react';

export type LogEntry = {
  step: number;
  status: string;
  message?: string;
  tool?: string;
};

export function useAgentRunStream(runId: string) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // In production, NEXT_PUBLIC_WS_URL comes from API Gateway exports
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'wss://demo-ws.execute-api.us-east-1.amazonaws.com/dev';
    // Remove trailing slash if the user accidentally included one in their env vars
    const cleanWsUrl = wsUrl.replace(/\/+$/, "");
    const ws = new WebSocket(`${cleanWsUrl}?runId=${runId}`);

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);

    ws.onmessage = (e) => {
      try {
        const entry = JSON.parse(e.data);
        setLogs(prev => [...prev, entry]);
      } catch (err) {
        console.error("Failed to parse websocket message", err);
      }
    };

    return () => {
      if (ws.readyState === 1) ws.close();
    };
  }, [runId]);

  return { logs, isConnected };
}
