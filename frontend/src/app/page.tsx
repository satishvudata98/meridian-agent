"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchIcon, ActivityIcon, PlusIcon, ExternalLink, Loader2Icon, MessageSquareIcon } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { createRun, listDigests } from "@/lib/apiClient";

type DigestCard = {
  digest_id?: string;
  run_id?: string;
  topic_id?: string;
  executive_summary?: string;
  created_at?: string;
  confidence?: number;
  status?: string;
};

type TriggerRunResponse = {
  run_id: string;
  run_access_token?: string;
  run_access_expires_at?: number;
  status?: string;
};

function getDigestSummary(summary?: string) {
  if (!summary) {
    return "Processing detailed analysis...";
  }

  return summary.length > 250 ? `${summary.substring(0, 250)}...` : summary;
}

function getDigestTitle(topic?: string) {
  if (!topic?.trim()) {
    return "Untitled research topic";
  }

  return topic.trim();
}

function getConfidenceLabel(confidence?: number) {
  const normalizedConfidence = typeof confidence === "number" ? Math.max(0, Math.min(100, Math.round(confidence))) : 90;
  return `${normalizedConfidence}% confidence`;
}

function formatDigestDate(createdAt?: string) {
  if (!createdAt) {
    return "Pending analysis";
  }

  const parsedDate = new Date(createdAt);
  if (Number.isNaN(parsedDate.getTime())) {
    return "Pending analysis";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsedDate);
}

export default function Home() {
  const router = useRouter();
  const [topicInput, setTopicInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [digests, setDigests] = useState<DigestCard[]>([]);
  const [isLoadingDigests, setIsLoadingDigests] = useState(true);

  useEffect(() => {
    const fetchDigests = async () => {
      try {
        const data = await listDigests<DigestCard[]>();
        setDigests(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Failed to fetch digests", err);
      } finally {
        setIsLoadingDigests(false);
      }
    };
    
    fetchDigests();
  }, []);

  const handleTrigger = async () => {
    if (!topicInput.trim()) return;
    
    setIsSubmitting(true);
    try {
      const data = await createRun<TriggerRunResponse>(topicInput);
      router.push(`/runs/${data.run_id}`);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Error connecting to the authenticated Meridian API.");
      setIsSubmitting(false);
    }
  };

  const visibleDigests = digests.filter((digest) => digest.executive_summary);
  let digestContent: ReactNode;

  if (isLoadingDigests) {
    digestContent = (
      <div className="col-span-full flex justify-center rounded-[1.75rem] border border-white/10 bg-black/20 py-16">
        <Loader2Icon className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  } else if (visibleDigests.length === 0) {
    digestContent = (
      <div className="col-span-full rounded-[1.75rem] border border-white/10 bg-neutral-950/50 px-6 py-14 text-center text-neutral-400 shadow-[0_24px_100px_rgba(0,0,0,0.35)]">
        <div className="mx-auto max-w-xl space-y-3">
          <p className="text-lg font-medium text-white">No research digests yet</p>
          <p className="text-sm leading-6 text-neutral-400">Start a new topic from the command panel above and Meridian will populate this workspace with private research outputs.</p>
        </div>
      </div>
    );
  } else {
    digestContent = visibleDigests.map((digest, index) => {
      const isPaused = digest.status === "awaiting_input";
      const digestTitle = getDigestTitle(digest.topic_id);
      const digestDate = formatDigestDate(digest.created_at);

      return (
        <motion.div
          className="h-full"
          key={digest.digest_id || digest.run_id || digest.topic_id || index}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1, type: "spring", stiffness: 100 }}
        >
          <Card className={`relative flex h-full rounded-[1.75rem] border bg-neutral-950/60 shadow-[0_20px_90px_rgba(2,6,23,0.45)] backdrop-blur-xl transition-all duration-300 ${
            isPaused ? 'border-amber-500/40 hover:border-amber-400/80' : 'border-white/10 hover:border-sky-400/50'
          }`}>
            <div className={`pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/card:opacity-100 ${
              isPaused ? 'bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.16),transparent_42%)]' : 'bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.16),transparent_42%)]'
            }`} />
            <CardHeader className="gap-4 px-5 pt-5 sm:px-6 sm:pt-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="text-[11px] font-medium uppercase tracking-[0.24em] text-neutral-500">
                    {isPaused ? "Human review required" : "Research digest"}
                  </div>
                  <CardTitle
                    className={`min-w-0 text-lg leading-6 break-words transition-colors sm:text-[1.35rem] ${
                      isPaused ? 'text-amber-100 group-hover/card:text-amber-50' : 'text-white group-hover/card:text-sky-100'
                    }`}
                    title={digestTitle}
                  >
                    {digestTitle}
                  </CardTitle>
                </div>
                <Badge
                  variant="secondary"
                  className={isPaused
                    ? "h-auto max-w-[12rem] whitespace-normal rounded-2xl border border-amber-500/20 bg-amber-500/12 px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200"
                    : "h-auto max-w-[12rem] whitespace-normal rounded-2xl border border-emerald-400/20 bg-emerald-500/12 px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-200"
                  }
                >
                  {isPaused ? "Awaiting guidance" : getConfidenceLabel(digest.confidence)}
                </Badge>
              </div>
              <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs uppercase tracking-[0.18em] text-neutral-500">
                <span>{digestDate}</span>
                <span className="h-1 w-1 rounded-full bg-neutral-700" aria-hidden="true" />
                <span>{isPaused ? "Paused for input" : "Ready to read"}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-6 px-5 pb-0 sm:px-6">
              <div className={`min-h-[7.5rem] rounded-[1.4rem] border px-4 py-4 sm:px-5 ${
                isPaused ? 'border-amber-500/10 bg-amber-500/5' : 'border-white/6 bg-black/25'
              }`}>
                <p className={`text-sm leading-6 break-words ${isPaused ? 'text-amber-50/80' : 'text-neutral-300'}`}>
                  {getDigestSummary(digest.executive_summary)}
                </p>
              </div>
            </CardContent>
            <CardFooter className="mt-auto gap-2 border-t-0 bg-transparent px-5 pb-5 pt-0 sm:px-6 sm:pb-6">
                {isPaused ? (
                  <Link href={`/runs/${digest.run_id}`} className="flex-1">
                    <Button className="h-11 w-full rounded-2xl bg-amber-500 text-black transition-all hover:bg-amber-400">
                      Provide Guidance
                      <MessageSquareIcon className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                ) : (
                  <>
                    <Link href={`/digests/${digest.digest_id}`} className="flex-1">
                      <Button className="h-11 w-full rounded-2xl bg-sky-500 text-slate-950 transition-all hover:bg-sky-400">
                        Read Full Report
                        <ExternalLink className="w-4 h-4 ml-2 opacity-80" />
                      </Button>
                    </Link>
                    {digest.run_id && (
                      <Link href={`/runs/${digest.run_id}`}>
                        <Button variant="outline" className="h-11 rounded-2xl border-white/10 bg-white/5 px-3 text-neutral-300 transition-all hover:bg-white/10" title="View ReAct Agent Trace">
                          <ActivityIcon className="w-4 h-4" />
                        </Button>
                      </Link>
                    )}
                  </>
                )}
            </CardFooter>
          </Card>
        </motion.div>
      );
    });
  }

  // Mock data removed

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_34%),radial-gradient(circle_at_80%_16%,rgba(34,197,94,0.08),transparent_24%),linear-gradient(180deg,#030712_0%,#081121_42%,#030712_100%)] px-4 py-6 text-neutral-50 selection:bg-sky-500/20 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-7xl space-y-8 lg:space-y-10">
        <header className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-neutral-950/70 p-5 shadow-[0_24px_120px_rgba(2,6,23,0.45)] backdrop-blur-2xl sm:p-8 lg:p-10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.04),transparent_50%)]" />
          <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.88fr)] lg:items-end">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-500/10 px-4 py-2 text-xs font-medium uppercase tracking-[0.22em] text-sky-100">
                <ActivityIcon className="h-4 w-4" /> Private research workspace
              </div>
              <div className="space-y-3">
                <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-[3.2rem] lg:leading-[1.05]">
                  Meridian Agent HQ
                </h1>
                <p className="max-w-2xl text-sm leading-7 text-neutral-300 sm:text-base lg:text-lg">
                  Launch authenticated research runs, monitor private digests, and keep operator decisions readable across every screen size.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.18em] text-neutral-400">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">Owner scoped</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">Live run visibility</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">Human review ready</span>
              </div>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleTrigger();
              }}
              className="grid gap-4 rounded-[1.6rem] border border-white/10 bg-black/30 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-5"
            >
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-neutral-500">Start a new research thread</p>
                <p className="text-sm leading-6 text-neutral-300">Give Meridian a topic and it will create a new private run with live trace visibility.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <Input
                  value={topicInput}
                  onChange={(e) => setTopicInput(e.target.value)}
                  placeholder="e.g. Next-gen AI Models"
                  className="h-12 min-w-0 rounded-2xl border-white/10 bg-neutral-900/85 px-4 text-white placeholder:text-neutral-500"
                  disabled={isSubmitting}
                />
                <Button
                  disabled={isSubmitting}
                  type="submit"
                  className="h-12 rounded-2xl bg-sky-500 px-5 text-slate-950 shadow-[0_0_30px_rgba(56,189,248,0.24)] transition-all hover:bg-sky-400 sm:px-6"
                >
                  {isSubmitting ? <Loader2Icon className="mr-2 h-4 w-4 animate-spin" /> : <PlusIcon className="mr-2 h-4 w-4" />}
                  {isSubmitting ? "Triggering..." : "Track Topic"}
                </Button>
              </div>
            </form>
          </div>
        </header>

        <section className="space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-neutral-500">Digest workspace</p>
              <h2 className="flex items-center gap-2 text-xl font-semibold text-white sm:text-2xl">
                <SearchIcon className="h-5 w-5 text-sky-300" /> Latest insights
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-neutral-400">Cards now keep actions aligned, preserve badge visibility, and contain long research titles without collapsing the layout.</p>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {digestContent}
          </div>
        </section>
      </div>
    </main>
  );
}
