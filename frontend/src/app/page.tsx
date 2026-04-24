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
    return "Summary pending.";
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
  return `${normalizedConfidence}%`;
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
      <div className="col-span-full flex justify-center rounded-[1.4rem] border border-white/10 bg-black/20 py-10">
        <Loader2Icon className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  } else if (visibleDigests.length === 0) {
    digestContent = (
      <div className="col-span-full rounded-[1.4rem] border border-white/10 bg-neutral-950/50 px-5 py-10 text-center text-neutral-400 shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
        <div className="mx-auto max-w-md space-y-2">
          <p className="text-base font-medium text-white">No reports yet</p>
          <p className="text-sm text-neutral-400">Start a topic above to create your first report.</p>
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
          <Card className={`relative flex h-full rounded-[1.4rem] border bg-neutral-950/60 shadow-[0_14px_42px_rgba(2,6,23,0.32)] backdrop-blur-xl transition-all duration-300 ${
            isPaused ? 'border-amber-500/40 hover:border-amber-400/80' : 'border-white/10 hover:border-sky-400/50'
          }`}>
            <div className={`pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/card:opacity-100 ${
              isPaused ? 'bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.12),transparent_42%)]' : 'bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.12),transparent_42%)]'
            }`} />
            <CardHeader className="gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <CardTitle
                    className={`min-w-0 text-base leading-6 break-words transition-colors sm:text-lg ${
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
                    ? "h-auto max-w-[10rem] whitespace-normal rounded-xl border border-amber-500/20 bg-amber-500/12 px-2.5 py-1 text-right text-[11px] font-medium text-amber-100"
                    : "h-auto max-w-[10rem] whitespace-normal rounded-xl border border-emerald-400/20 bg-emerald-500/12 px-2.5 py-1 text-right text-[11px] font-medium text-emerald-100"
                  }
                >
                  {isPaused ? "Needs input" : getConfidenceLabel(digest.confidence)}
                </Badge>
              </div>
              <CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500">
                <span>{digestDate}</span>
                <span className="h-1 w-1 rounded-full bg-neutral-700" aria-hidden="true" />
                <span>{isPaused ? "Paused" : "Ready"}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4 px-4 pb-0 sm:px-5">
              <div className={`min-h-[6rem] rounded-[1rem] border px-3.5 py-3.5 sm:px-4 ${
                isPaused ? 'border-amber-500/10 bg-amber-500/5' : 'border-white/6 bg-black/25'
              }`}>
                <p className={`text-sm leading-5 break-words ${isPaused ? 'text-amber-50/80' : 'text-neutral-300'}`}>
                  {getDigestSummary(digest.executive_summary)}
                </p>
              </div>
            </CardContent>
            <CardFooter className="mt-auto gap-2 border-t-0 bg-transparent px-4 pb-4 pt-0 sm:px-5 sm:pb-5">
                {isPaused ? (
                  <Link href={`/runs/${digest.run_id}`} className="flex-1">
                    <Button className="h-9 w-full rounded-xl bg-amber-500 text-black transition-all hover:bg-amber-400">
                      Review
                      <MessageSquareIcon className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                ) : (
                  <>
                    <Link href={`/digests/${digest.digest_id}`} className="flex-1">
                      <Button className="h-9 w-full rounded-xl bg-sky-500 text-slate-950 transition-all hover:bg-sky-400">
                        Read report
                        <ExternalLink className="w-4 h-4 ml-2 opacity-80" />
                      </Button>
                    </Link>
                    {digest.run_id && (
                      <Link href={`/runs/${digest.run_id}`}>
                        <Button variant="outline" className="h-9 rounded-xl border-white/10 bg-white/5 px-3 text-neutral-300 transition-all hover:bg-white/10" title="Open run">
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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.16),transparent_34%),linear-gradient(180deg,#030712_0%,#081121_42%,#030712_100%)] px-4 py-4 text-neutral-50 selection:bg-sky-500/20 sm:px-5 sm:py-5 lg:px-8 lg:py-6">
      <div className="mx-auto max-w-6xl space-y-5 lg:space-y-6">
        <header className="relative overflow-hidden rounded-[1.6rem] border border-white/10 bg-neutral-950/70 p-4 shadow-[0_18px_60px_rgba(2,6,23,0.34)] backdrop-blur-2xl sm:p-5 lg:p-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.04),transparent_50%)]" />
          <div className="relative grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] lg:items-center">
            <div className="space-y-2.5">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1.5 text-[11px] font-medium text-sky-100">
                <ActivityIcon className="h-3.5 w-3.5" /> Workspace
              </div>
              <div className="space-y-2">
                <h1 className="max-w-2xl text-2xl font-semibold tracking-tight text-white sm:text-3xl lg:text-[2.35rem] lg:leading-tight">
                  Meridian
                </h1>
                <p className="max-w-xl text-sm leading-6 text-neutral-300 sm:text-base">
                  Start a topic and review your reports in one place.
                </p>
              </div>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleTrigger();
              }}
              className="grid gap-3 rounded-[1.25rem] border border-white/10 bg-black/30 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-4"
            >
              <div className="space-y-1">
                <p className="text-xs font-medium text-neutral-400">New topic</p>
                <p className="text-sm text-neutral-300">Enter what you want to research.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <Input
                  value={topicInput}
                  onChange={(e) => setTopicInput(e.target.value)}
                  placeholder="Enter a topic"
                  className="h-10 min-w-0 rounded-xl border-white/10 bg-neutral-900/85 px-3.5 text-white placeholder:text-neutral-500"
                  disabled={isSubmitting}
                />
                <Button
                  disabled={isSubmitting}
                  type="submit"
                  className="h-10 rounded-xl bg-sky-500 px-4 text-slate-950 shadow-[0_0_24px_rgba(56,189,248,0.2)] transition-all hover:bg-sky-400 sm:px-5"
                >
                  {isSubmitting ? <Loader2Icon className="mr-2 h-4 w-4 animate-spin" /> : <PlusIcon className="mr-2 h-4 w-4" />}
                  {isSubmitting ? "Starting..." : "Start"}
                </Button>
              </div>
            </form>
          </div>
        </header>

        <section className="space-y-3">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-0.5">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-white sm:text-xl">
                <SearchIcon className="h-5 w-5 text-sky-300" /> Latest insights
              </h2>
              <p className="text-sm text-neutral-400">Your recent reports.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {digestContent}
          </div>
        </section>
      </div>
    </main>
  );
}
