"use client";

import { useParams } from "next/navigation";
import { useAgentRunStream, type LogEntry } from "@/lib/useAgentRunStream";
import { motion } from "framer-motion";
import { CpuIcon, Loader2Icon, ArrowLeftIcon, MessageSquareIcon, SendIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { createStreamTicket, listDigests, resumeRun } from "@/lib/apiClient";

type PausedRun = {
  run_id: string;
  question?: string;
  context?: string;
  executive_summary?: string;
  status?: string;
};

type StreamTicketResponse = {
  run_access_token: string;
};

type StreamTicketState = {
  runId: string;
  token: string | null;
  error: string;
};

function getLogPresentation(log: LogEntry) {
  if (log.status === "tool_use") {
    return {
      badgeClassName: "text-indigo-400 font-semibold",
      badgeLabel: `[λ ${log.tool}]`,
      messageClassName: "text-indigo-200",
    };
  }

  if (log.status === "completed") {
    return {
      badgeClassName: "text-emerald-400 font-bold",
      badgeLabel: "[done]",
      messageClassName: "text-emerald-300 font-medium",
    };
  }

  if (log.status === "awaiting_human_input") {
    return {
      badgeClassName: "text-amber-400 font-bold",
      badgeLabel: "[⏸ paused]",
      messageClassName: "text-amber-300",
    };
  }

  return {
    badgeClassName: "text-neutral-200",
    badgeLabel: "[agent]",
    messageClassName: "text-emerald-300",
  };
}

function RunLogLine({ log }: Readonly<{ log: LogEntry }>) {
  const presentation = getLogPresentation(log);

  return (
    <motion.div
      key={log.entryId}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.1 }}
      className="flex items-start gap-4 p-2 hover:bg-white/5 rounded-md transition-colors"
    >
      <span className="text-neutral-500 shrink-0 select-none">[{log.step}]</span>
      <span className={presentation.badgeClassName}>{presentation.badgeLabel}</span>
      <span className={presentation.messageClassName}>{log.message || log.status}</span>
    </motion.div>
  );
}

export default function RunViewer() {
  const params = useParams();
  const runId = params.run_id as string;
  const [streamTicketState, setStreamTicketState] = useState<StreamTicketState>({
    runId,
    token: null,
    error: "",
  });
  const runAccessToken = streamTicketState.runId === runId ? streamTicketState.token : null;
  const streamTicketError = streamTicketState.runId === runId ? streamTicketState.error : "";
  const { logs, isConnected } = useAgentRunStream(runId, runAccessToken);
  
  const [hitlAnswer, setHitlAnswer] = useState("");
  const [hitlSubmitting, setHitlSubmitting] = useState(false);
  const [hitlSubmitted, setHitlSubmitted] = useState(false);
  const [pausedRun, setPausedRun] = useState<PausedRun | null>(null);
  const [hitlError, setHitlError] = useState("");

  useEffect(() => {
    let isActive = true;

    const ticketPromise = createStreamTicket<StreamTicketResponse>(runId);
    ticketPromise
      .then((ticket: StreamTicketResponse) => {
        if (isActive) {
          setStreamTicketState({
            runId,
            token: ticket.run_access_token,
            error: "",
          });
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          setStreamTicketState({
            runId,
            token: null,
            error: error instanceof Error ? error.message : "Failed to request a live trace stream ticket.",
          });
        }
      });

    return () => {
      isActive = false;
    };
  }, [runId]);

  useEffect(() => {
    const fetchPausedRun = async () => {
      try {
        const data = await listDigests<PausedRun[]>();
        const found = (data || []).find((item: PausedRun) => (
          item.run_id === runId && item.status === "awaiting_input"
        ));
        setPausedRun(found || null);
      } catch (error) {
        console.error("Failed to fetch paused run state:", error);
      }
    };

    fetchPausedRun();
  }, [runId]);

  const isCompleted = logs.some(log => log.status === "completed");
  // Check if the latest status event is an HITL pause
  const hitlLog = logs.find(log => log.status === "awaiting_human_input");
  const isAwaitingHumanInput = (!!hitlLog || !!pausedRun) && !hitlSubmitted;
  const hitlQuestion = hitlLog?.message || pausedRun?.question || pausedRun?.executive_summary || "The agent encountered ambiguity and needs your direction.";

  const handleSubmitAnswer = async () => {
    setHitlError("");
    if (!hitlAnswer.trim()) return;
    setHitlSubmitting(true);
    try {
      await resumeRun<{ message: string; run_id: string }>(runId, hitlAnswer.trim(), runAccessToken);
      setHitlSubmitted(true);
      setPausedRun(null);
    } catch (e) {
      console.error("Failed to submit HITL answer:", e);
      setHitlError(e instanceof Error ? e.message : "Failed to submit HITL answer.");
    } finally {
      setHitlSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-950 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <Link href="/">
          <Button variant="ghost" className="text-neutral-400 hover:text-white px-0 hover:bg-transparent -ml-2 group">
            <ArrowLeftIcon className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" /> Back to Dashboard
          </Button>
        </Link>
        
        <header className="flex justify-between items-end border-b border-white/10 pb-6">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <CpuIcon className="w-6 h-6 text-indigo-400" />
              Runtime Trace: <span className="text-indigo-400 font-mono text-lg mt-1">{runId}</span>
            </h1>
          </div>
          <div className="flex items-center gap-2 text-sm text-neutral-400">
             <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]' : 'bg-rose-500'}`} /> 
             {isConnected ? "Live Connection" : "Disconnected"}
          </div>
        </header>

        {!runAccessToken && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {streamTicketError || "Live trace access is unavailable until a short-lived stream ticket is issued for this run."}
          </div>
        )}

        {/* HITL Question Card — only shown when agent is paused */}
        {isAwaitingHumanInput && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="p-6 bg-amber-500/10 border border-amber-500/30 rounded-2xl shadow-[0_0_30px_rgba(245,158,11,0.1)] space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/20">
                <MessageSquareIcon className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-amber-300 font-bold text-base">Agent needs your guidance</h3>
                <p className="text-amber-400/60 text-xs">The agent paused and is waiting for your input to continue</p>
              </div>
            </div>
            <p className="text-amber-100/80 text-sm leading-relaxed bg-amber-500/5 rounded-xl p-4 border border-amber-500/10">
              {hitlQuestion}
            </p>
            {pausedRun?.context && (
              <p className="text-amber-100/60 text-xs leading-relaxed">
                {pausedRun.context}
              </p>
            )}
            <div className="flex gap-3">
              <input
                id="hitl-answer-input"
                type="text"
                value={hitlAnswer}
                onChange={e => setHitlAnswer(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSubmitAnswer()}
                placeholder="Type your guidance here..."
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors"
              />
              <Button
                id="hitl-submit-button"
                onClick={handleSubmitAnswer}
                disabled={hitlSubmitting || !hitlAnswer.trim()}
                className="bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-xl px-5 flex items-center gap-2 disabled:opacity-50"
              >
                {hitlSubmitting ? <Loader2Icon className="animate-spin w-4 h-4" /> : <SendIcon className="w-4 h-4" />}
                {hitlSubmitting ? "Sending..." : "Send"}
              </Button>
            </div>
            {hitlError && (
              <p className="text-rose-300 text-sm">{hitlError}</p>
            )}
          </motion.div>
        )}

        {/* HITL Submitted confirmation */}
        {hitlSubmitted && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-300 text-sm text-center"
          >
            Answer submitted! The agent is resuming research... check back in a moment.
          </motion.div>
        )}

        <div className="bg-black/80 rounded-2xl border border-white/10 shadow-xl overflow-hidden font-mono text-sm relative">
          <div className="absolute top-0 left-0 right-0 h-8 bg-neutral-900 border-b border-white/10 flex items-center px-4 gap-2">
             <div className="w-3 h-3 rounded-full bg-rose-500/80" />
             <div className="w-3 h-3 rounded-full bg-amber-500/80" />
             <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
             <div className="ml-4 text-xs font-sans text-neutral-600">agent-tty0 - SSH</div>
          </div>
          <div className="p-6 pt-12 min-h-[400px] flex flex-col gap-4">
            {logs.map((log) => <RunLogLine key={log.entryId} log={log} />)}
            {!isCompleted && !isAwaitingHumanInput && (
              <div className="text-neutral-500 animate-pulse flex items-center gap-2 mt-4 ml-2">
                  <Loader2Icon className="animate-spin w-4 h-4"/> Awaiting lambda pulse...
              </div>
            )}
            {isCompleted && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }} 
                className="mt-8 p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex flex-col items-center gap-4 text-center"
              >
                <h3 className="text-xl font-bold text-emerald-400">Run Completed Successfully!</h3>
                <p className="text-emerald-200/70 text-sm">The agent has finished compiling the research digest.</p>
                <Link href="/">
                  <Button className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.4)] px-8 rounded-full mt-2">
                    Read Generated Digest
                  </Button>
                </Link>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}



