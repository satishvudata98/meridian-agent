"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
      <div className="col-span-full flex justify-center py-12">
        <Loader2Icon className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  } else if (visibleDigests.length === 0) {
    digestContent = (
      <div className="col-span-full text-center text-neutral-500 py-12 bg-neutral-900/30 rounded-2xl border border-white/5">
        No research digests found. Start tracking a topic above!
      </div>
    );
  } else {
    digestContent = visibleDigests.map((digest, index) => {
      const isPaused = digest.status === "awaiting_input";

      return (
        <motion.div
          key={digest.digest_id || digest.run_id || digest.topic_id || index}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1, type: "spring", stiffness: 100 }}
        >
          <Card className={`bg-neutral-900/60 transition-colors duration-300 group overflow-hidden relative ${
            isPaused ? 'border-amber-500/50 hover:border-amber-400' : 'border-white/10 hover:border-indigo-500/50'
          }`}>
            <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none bg-gradient-to-br ${
              isPaused ? 'from-amber-500/5 via-transparent to-transparent' : 'from-indigo-500/5 via-transparent to-transparent'
            }`} />
            <CardHeader>
              <div className="flex justify-between items-start">
                <CardTitle className={`text-lg transition-colors ${
                  isPaused ? 'text-amber-200 group-hover:text-amber-100' : 'text-white group-hover:text-indigo-300'
                }`}>{digest.topic_id}</CardTitle>
                <Badge variant="secondary" className={
                  isPaused ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                }>
                  {isPaused ? "Awaiting Guidance" : `${digest.confidence || 90}% Quality`}
                </Badge>
              </div>
              <CardDescription className="text-neutral-500">
                {digest.created_at ? new Date(digest.created_at).toLocaleDateString() : "Pending"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 mb-6">
                <p className={`text-sm ${isPaused ? 'text-amber-100/70' : 'text-neutral-300'}`}>
                  {getDigestSummary(digest.executive_summary)}
                </p>
              </div>
              <div className="flex gap-2">
                {isPaused ? (
                  <Link href={`/runs/${digest.run_id}`} className="flex-1">
                    <Button className="w-full bg-amber-600 hover:bg-amber-500 text-black font-bold transition-all rounded-xl cursor-pointer">
                      Provide Guidance
                      <MessageSquareIcon className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                ) : (
                  <>
                    <Link href={`/digests/${digest.digest_id}`} className="flex-1">
                      <Button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white transition-all rounded-xl cursor-pointer">
                        Read Full Report
                        <ExternalLink className="w-4 h-4 ml-2 opacity-80" />
                      </Button>
                    </Link>
                    {digest.run_id && (
                      <Link href={`/runs/${digest.run_id}`}>
                        <Button variant="outline" className="bg-transparent border-white/10 hover:bg-neutral-800 text-neutral-400 transition-all rounded-xl cursor-pointer px-3" title="View ReAct Agent Trace">
                          <ActivityIcon className="w-4 h-4" />
                        </Button>
                      </Link>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      );
    });
  }

  // Mock data removed

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50 p-8 sm:p-20 font-[family-name:var(--font-geist-sans)] selection:bg-indigo-500/30">
      <div className="max-w-6xl mx-auto space-y-12">
        <header className="flex justify-between items-center bg-neutral-900/40 p-6 rounded-3xl border border-white/5 backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-2xl border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
              <ActivityIcon className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white drop-shadow-md">Meridian Agent HQ</h1>
              <p className="text-neutral-400 text-sm">Autonomous MLOps Research Pipeline</p>
            </div>
          </div>
          <form onSubmit={(event) => {
            event.preventDefault();
            void handleTrigger();
          }} className="flex gap-2">
            <Input 
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              placeholder="e.g. Next-gen AI Models" 
              className="bg-neutral-800 border-white/10 text-white placeholder:text-neutral-500 min-w-[250px]"
              disabled={isSubmitting}
            />
            <Button disabled={isSubmitting} type="submit" className="bg-indigo-600 hover:bg-indigo-500 transition-all active:scale-95 text-white shadow-[0_0_20px_rgba(79,70,229,0.4)] rounded-full px-6">
              {isSubmitting ? <Loader2Icon className="w-4 h-4 mr-2 animate-spin" /> : <PlusIcon className="w-4 h-4 mr-2" />} 
              {isSubmitting ? "Triggering..." : "Track Topic"}
            </Button>
          </form>
        </header>

        <section className="space-y-6">
          <h2 className="text-xl flex items-center gap-2 text-white font-semibold">
            <SearchIcon className="w-5 h-5 text-indigo-400" /> Latest Insights
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {digestContent}
          </div>
        </section>
      </div>
    </main>
  );
}
