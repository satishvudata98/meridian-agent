"use client";

import { useParams } from "next/navigation";
import { useAgentRunStream, type LogEntry } from "@/lib/useAgentRunStream";
import { motion } from "framer-motion";
import { CpuIcon, Loader2Icon, ArrowLeftIcon, MessageSquareIcon, SendIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
      badgeClassName: "border border-sky-400/20 bg-sky-500/10 text-sky-100",
      badgeLabel: log.tool ? `Tool · ${log.tool}` : "Tool call",
      messageClassName: "text-sky-50",
    };
  }

  if (log.status === "completed") {
    return {
      badgeClassName: "border border-emerald-500/20 bg-emerald-500/10 text-emerald-100",
      badgeLabel: "Completed",
      messageClassName: "text-emerald-100 font-medium",
    };
  }

  if (log.status === "awaiting_human_input") {
    return {
      badgeClassName: "border border-amber-500/20 bg-amber-500/10 text-amber-100",
      badgeLabel: "Awaiting input",
      messageClassName: "text-amber-100",
    };
  }

  return {
    badgeClassName: "border border-white/10 bg-white/5 text-neutral-100",
    badgeLabel: "Agent",
    messageClassName: "text-neutral-100",
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
      className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-start gap-3 rounded-2xl border border-white/6 bg-white/[0.03] px-3 py-3 transition-colors hover:bg-white/[0.05] sm:px-4"
    >
      <span className="select-none rounded-full border border-white/8 bg-black/30 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500">
        {`step ${log.step}`}
      </span>
      <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${presentation.badgeClassName}`}>
        {presentation.badgeLabel}
      </span>
      <span className={`min-w-0 break-words text-sm leading-6 ${presentation.messageClassName}`}>
        {log.message || log.status}
      </span>
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
  const hitlQuestion = hitlLog?.message || pausedRun?.question || pausedRun?.executive_summary || "This run needs your input.";

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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.14),transparent_28%),linear-gradient(180deg,#030712_0%,#081121_44%,#030712_100%)] px-4 py-4 sm:px-5 sm:py-5 lg:px-8 lg:py-6">
      <div className="mx-auto max-w-5xl space-y-4 lg:space-y-5">
        <Link href="/">
          <Button variant="ghost" className="-ml-2 px-2 text-neutral-400 hover:bg-transparent hover:text-white group">
            <ArrowLeftIcon className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" /> Back
          </Button>
        </Link>

        <header className="rounded-[1.5rem] border border-white/10 bg-neutral-950/65 p-4 shadow-[0_18px_60px_rgba(2,6,23,0.34)] backdrop-blur-2xl sm:p-5 lg:p-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1.5 text-[11px] font-medium text-sky-100">
                <CpuIcon className="h-3.5 w-3.5" /> Run
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Research run</h1>
                <p className="max-w-xl text-sm leading-6 text-neutral-300 sm:text-base">
                  Follow progress and reply if input is needed.
                </p>
              </div>
              <div className="max-w-3xl rounded-[1rem] border border-white/10 bg-black/30 px-3.5 py-2.5 font-mono text-xs leading-5 break-all text-sky-100 sm:px-4 sm:text-sm">
                {runId}
              </div>
            </div>

            <div className="flex flex-col gap-2 lg:items-end">
              <Badge
                variant="secondary"
                className={isConnected
                  ? "h-auto rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-100"
                  : "h-auto rounded-xl border border-rose-500/20 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-100"
                }
              >
                {isConnected ? "Live" : "Waiting"}
              </Badge>
              <p className="max-w-sm text-sm text-neutral-400 lg:text-right">
                {isConnected ? "Updates are coming in." : "Waiting for updates."}
              </p>
            </div>
          </div>
        </header>

        {!runAccessToken && (
          <div className="rounded-[1.2rem] border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100 shadow-[0_16px_42px_rgba(127,29,29,0.16)]">
            {streamTicketError || "Live updates are not available right now."}
          </div>
        )}

        {isAwaitingHumanInput && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="rounded-[1.4rem] border border-amber-500/20 bg-amber-500/10 p-4 shadow-[0_16px_42px_rgba(245,158,11,0.12)] backdrop-blur-xl sm:p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="rounded-xl bg-amber-500/15 p-2.5">
                  <MessageSquareIcon className="h-4.5 w-4.5 text-amber-300" />
                </div>
                <div className="min-w-0 space-y-1">
                  <h3 className="text-base font-semibold text-amber-50">Input needed</h3>
                  <p className="text-sm text-amber-100/70">This run is paused.</p>
                </div>
              </div>
              <Badge className="h-auto rounded-xl border border-amber-500/20 bg-amber-500/15 px-2.5 py-1 text-[11px] font-medium text-amber-100">Paused</Badge>
            </div>

            <div className="space-y-3">
              <p className="rounded-[1rem] border border-amber-500/10 bg-amber-500/5 p-3.5 text-sm leading-6 break-words text-amber-50/85 sm:p-4">
              {hitlQuestion}
              </p>
              {pausedRun?.context && (
                <p className="text-xs leading-5 break-words text-amber-100/65">{pausedRun.context}</p>
              )}

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <Input
                  id="hitl-answer-input"
                  type="text"
                  value={hitlAnswer}
                  onChange={(e) => setHitlAnswer(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmitAnswer()}
                  placeholder="Type your reply"
                  className="h-10 rounded-xl border-white/10 bg-black/20 px-3.5 text-white placeholder:text-neutral-500"
                />
                <Button
                  id="hitl-submit-button"
                  onClick={handleSubmitAnswer}
                  disabled={hitlSubmitting || !hitlAnswer.trim()}
                  className="h-10 rounded-xl bg-amber-400 px-4 font-semibold text-black hover:bg-amber-300 disabled:opacity-50"
                >
                  {hitlSubmitting ? <Loader2Icon className="mr-2 h-4 w-4 animate-spin" /> : <SendIcon className="mr-2 h-4 w-4" />}
                  {hitlSubmitting ? "Sending..." : "Send"}
                </Button>
              </div>
            </div>

            {hitlError && (
              <p className="text-sm text-rose-200">{hitlError}</p>
            )}
          </motion.div>
        )}

        {hitlSubmitted && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="rounded-[1.2rem] border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-center text-sm text-emerald-100 shadow-[0_16px_42px_rgba(16,185,129,0.12)]"
          >
            Reply sent. The run is continuing.
          </motion.div>
        )}

        <Card className="rounded-[1.5rem] border border-white/10 bg-black/55 py-0 shadow-[0_18px_60px_rgba(0,0,0,0.38)] backdrop-blur-2xl">
          <CardHeader className="gap-2 border-b border-white/10 px-4 py-3.5 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base text-white sm:text-lg">Activity</CardTitle>
                <CardDescription className="mt-1 text-sm text-neutral-400">Latest updates from this run.</CardDescription>
              </div>
              <div className="flex items-center gap-2 text-neutral-500">
                <span className="h-3 w-3 rounded-full bg-rose-500/80" />
                <span className="h-3 w-3 rounded-full bg-amber-500/80" />
                <span className="h-3 w-3 rounded-full bg-emerald-500/80" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0 pt-0 font-mono text-sm">
            <div className="max-h-[62vh] min-h-[18rem] overflow-y-auto px-3.5 py-3.5 sm:px-5 sm:py-4">
              <div className="flex flex-col gap-3">
                {logs.map((log) => <RunLogLine key={log.entryId} log={log} />)}
                {logs.length === 0 && !streamTicketError && (
                  <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-neutral-500">
                    Waiting for updates.
                  </div>
                )}
                {!isCompleted && !isAwaitingHumanInput && (
                  <div className="flex items-center gap-2 px-2 pt-2 text-neutral-500 animate-pulse">
                    <Loader2Icon className="h-4 w-4 animate-spin" /> Working...
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {isCompleted && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[1.4rem] border border-emerald-500/20 bg-emerald-500/10 p-5 text-center shadow-[0_18px_60px_rgba(16,185,129,0.1)]"
          >
            <h3 className="text-lg font-semibold text-emerald-100">Run complete</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm text-emerald-100/75">
              Your report is ready.
            </p>
            <Link href="/">
              <Button className="mt-4 h-10 rounded-xl bg-emerald-400 px-5 text-slate-950 hover:bg-emerald-300">
                Back to reports
              </Button>
            </Link>
          </motion.div>
        )}
      </div>
    </main>
  );
}



