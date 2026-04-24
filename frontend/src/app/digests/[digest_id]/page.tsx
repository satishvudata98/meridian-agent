"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ArrowLeftIcon, ArrowUpRightIcon, FileTextIcon, Loader2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listDigests } from "@/lib/apiClient";

type Digest = {
  digest_id?: string;
  topic_id?: string;
  executive_summary?: string;
  detailed_analysis?: string;
  citations?: string[];
  created_at?: string;
  confidence?: number;
};

function getDigestTitle(topic?: string) {
  if (!topic?.trim()) {
    return "Untitled research digest";
  }

  return topic.trim();
}

function getConfidenceLabel(confidence?: number) {
  const normalizedConfidence = typeof confidence === "number"
    ? Math.max(0, Math.min(100, Math.round(confidence)))
    : 90;

  return `${normalizedConfidence}% confidence`;
}

function formatDigestTimestamp(createdAt?: string) {
  if (!createdAt) {
    return "Pending publication";
  }

  const parsedDate = new Date(createdAt);
  if (Number.isNaN(parsedDate.getTime())) {
    return "Pending publication";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsedDate);
}

export default function DigestView() {
  const params = useParams();
  const router = useRouter();
  const digestId = params.digest_id as string;
  const [digest, setDigest] = useState<Digest | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDigest = async () => {
      try {
        const data = await listDigests<Digest[]>();
        const found = Array.isArray(data)
          ? data.find((item: Digest) => item.digest_id === digestId)
          : null;

        setDigest(found || null);
      } catch (err) {
        console.error("Failed to fetch digest", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDigest();
  }, [digestId]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.12),transparent_28%),linear-gradient(180deg,#030712_0%,#081121_46%,#030712_100%)] px-4">
        <div className="flex items-center gap-3 rounded-[1.2rem] border border-white/10 bg-neutral-950/70 px-5 py-3.5 text-neutral-200 shadow-[0_18px_60px_rgba(2,6,23,0.34)] backdrop-blur-xl">
          <Loader2Icon className="h-5 w-5 animate-spin text-sky-300" />
          <span className="text-sm">Loading report…</span>
        </div>
      </main>
    );
  }

  if (!digest) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.12),transparent_28%),linear-gradient(180deg,#030712_0%,#081121_46%,#030712_100%)] px-4 text-neutral-50">
        <div className="w-full max-w-xl rounded-[1.5rem] border border-white/10 bg-neutral-950/70 p-6 text-center shadow-[0_18px_60px_rgba(2,6,23,0.34)] backdrop-blur-xl">
          <h1 className="text-xl font-semibold text-white">Report not found</h1>
          <p className="mt-3 text-sm leading-6 text-neutral-400">
            Return to the dashboard to open another report.
          </p>
          <Button
            variant="outline"
            className="mt-5 h-10 rounded-xl border-white/10 bg-white/5 text-neutral-100 hover:bg-white/10"
            onClick={() => router.push("/")}
          >
            Back
          </Button>
        </div>
      </main>
    );
  }

  const digestTitle = getDigestTitle(digest.topic_id);
  const digestTimestamp = formatDigestTimestamp(digest.created_at);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.14),transparent_28%),linear-gradient(180deg,#030712_0%,#081121_44%,#030712_100%)] px-4 py-4 text-neutral-50 sm:px-5 sm:py-5 lg:px-8 lg:py-6">
      <div className="mx-auto max-w-5xl space-y-4 lg:space-y-5">
        <Button
          variant="ghost"
          className="-ml-2 cursor-pointer px-2 text-neutral-400 hover:bg-transparent hover:text-white group"
          onClick={() => router.push("/")}
        >
          <ArrowLeftIcon className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" />
          Back
        </Button>

        <header className="rounded-[1.5rem] border border-white/10 bg-neutral-950/65 p-4 shadow-[0_18px_60px_rgba(2,6,23,0.34)] backdrop-blur-2xl sm:p-5 lg:p-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1.5 text-[11px] font-medium text-sky-100">
                <FileTextIcon className="h-3.5 w-3.5" /> Report
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight break-words text-white sm:text-3xl lg:text-[2.3rem] lg:leading-tight">
                  {digestTitle}
                </h1>
                <p className="max-w-xl text-sm leading-6 text-neutral-300 sm:text-base">
                  Read the full report and sources.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 lg:items-end">
              <Badge className="h-auto rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-100">
                {getConfidenceLabel(digest.confidence)}
              </Badge>
              <div className="rounded-[1rem] border border-white/10 bg-black/25 px-3.5 py-2.5 text-sm text-neutral-300 lg:max-w-[16rem] lg:text-right">
                Published {digestTimestamp}
              </div>
            </div>
          </div>
        </header>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-4">
            <Card className="rounded-[1.4rem] border border-white/10 bg-neutral-950/60 shadow-[0_14px_42px_rgba(2,6,23,0.3)] backdrop-blur-xl">
              <CardHeader className="gap-1.5 px-4 pt-4 sm:px-5 sm:pt-5">
                <CardTitle className="text-lg text-white">Summary</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 sm:px-5 sm:pb-5">
                <p className="text-sm leading-6 text-neutral-200 sm:text-base">
                  {digest.executive_summary || "No executive summary available."}
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-[1.4rem] border border-white/10 bg-neutral-950/60 shadow-[0_14px_42px_rgba(2,6,23,0.3)] backdrop-blur-xl">
              <CardHeader className="gap-1.5 px-4 pt-4 sm:px-5 sm:pt-5">
                <CardTitle className="text-lg text-white">Report</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 sm:px-5 sm:pb-5">
                <div className="space-y-5 text-neutral-200 [&_a]:break-all [&_a]:text-sky-300 [&_a]:underline-offset-4 [&_a:hover]:text-sky-200 [&_a:hover]:underline [&_blockquote]:rounded-[1rem] [&_blockquote]:border [&_blockquote]:border-white/10 [&_blockquote]:bg-black/20 [&_blockquote]:px-4 [&_blockquote]:py-3 [&_blockquote]:text-neutral-300 [&_code]:break-words [&_h1]:mt-8 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:text-white [&_h2]:mt-7 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white [&_h3]:mt-5 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-white [&_li]:leading-6 [&_ol]:space-y-2 [&_ol]:pl-5 [&_p]:leading-7 [&_pre]:overflow-x-auto [&_pre]:rounded-[1rem] [&_pre]:border [&_pre]:border-white/10 [&_pre]:bg-black/35 [&_pre]:p-3.5 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:rounded-[1rem] [&_table]:border [&_table]:border-white/10 [&_table]:bg-black/20 [&_tbody_tr]:border-t [&_tbody_tr]:border-white/10 [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_thead]:border-b [&_thead]:border-white/10 [&_ul]:space-y-2 [&_ul]:pl-5">
                  <ReactMarkdown>{digest.detailed_analysis || "No detailed analysis available."}</ReactMarkdown>
                </div>
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
            <Card className="rounded-[1.4rem] border border-white/10 bg-neutral-950/60 shadow-[0_14px_42px_rgba(2,6,23,0.3)] backdrop-blur-xl">
              <CardHeader className="gap-1.5 px-4 pt-4 sm:px-5 sm:pt-5">
                <CardTitle className="text-base text-white">Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 px-4 pb-4 sm:px-5 sm:pb-5">
                <div className="rounded-[1rem] border border-white/10 bg-black/20 px-3.5 py-3">
                  <p className="text-xs text-neutral-500">Confidence</p>
                  <p className="mt-1.5 text-sm font-medium text-white">{getConfidenceLabel(digest.confidence)}</p>
                </div>
                <div className="rounded-[1rem] border border-white/10 bg-black/20 px-3.5 py-3">
                  <p className="text-xs text-neutral-500">Published</p>
                  <p className="mt-1.5 text-sm leading-5 text-neutral-300">{digestTimestamp}</p>
                </div>
                <div className="rounded-[1rem] border border-white/10 bg-black/20 px-3.5 py-3">
                  <p className="text-xs text-neutral-500">Sources</p>
                  <p className="mt-1.5 text-sm font-medium text-white">{digest.citations?.length || 0}</p>
                </div>
              </CardContent>
            </Card>

            {digest.citations && digest.citations.length > 0 && (
              <Card className="rounded-[1.4rem] border border-white/10 bg-neutral-950/60 shadow-[0_14px_42px_rgba(2,6,23,0.3)] backdrop-blur-xl">
                <CardHeader className="gap-1.5 px-4 pt-4 sm:px-5 sm:pt-5">
                  <CardTitle className="text-base text-white">Sources</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5 px-4 pb-4 sm:px-5 sm:pb-5">
                  {digest.citations.map((url: string) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-start justify-between gap-3 rounded-[1rem] border border-white/10 bg-black/20 px-3.5 py-3 transition-colors hover:bg-white/[0.04]"
                    >
                      <span className="min-w-0 break-all text-sm leading-5 text-neutral-300 group-hover:text-white">{url}</span>
                      <ArrowUpRightIcon className="mt-1 h-4 w-4 flex-none text-neutral-500 transition-colors group-hover:text-sky-300" />
                    </a>
                  ))}
                </CardContent>
              </Card>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
