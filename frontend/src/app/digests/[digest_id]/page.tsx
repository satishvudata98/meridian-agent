"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ArrowLeftIcon, ArrowUpRightIcon, FileTextIcon, Loader2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
        <div className="flex items-center gap-3 rounded-[1.5rem] border border-white/10 bg-neutral-950/70 px-6 py-4 text-neutral-200 shadow-[0_24px_120px_rgba(2,6,23,0.45)] backdrop-blur-xl">
          <Loader2Icon className="h-5 w-5 animate-spin text-sky-300" />
          <span className="text-sm">Loading digest…</span>
        </div>
      </main>
    );
  }

  if (!digest) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.12),transparent_28%),linear-gradient(180deg,#030712_0%,#081121_46%,#030712_100%)] px-4 text-neutral-50">
        <div className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-neutral-950/70 p-8 text-center shadow-[0_24px_120px_rgba(2,6,23,0.45)] backdrop-blur-xl">
          <h1 className="text-2xl font-semibold text-white">Report not found</h1>
          <p className="mt-3 text-sm leading-6 text-neutral-400">
            The digest could not be found in your private workspace. Return to the dashboard to open another report.
          </p>
          <Button
            variant="outline"
            className="mt-6 rounded-2xl border-white/10 bg-white/5 text-neutral-100 hover:bg-white/10"
            onClick={() => router.push("/")}
          >
            Return to Dashboard
          </Button>
        </div>
      </main>
    );
  }

  const digestTitle = getDigestTitle(digest.topic_id);
  const digestTimestamp = formatDigestTimestamp(digest.created_at);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.14),transparent_28%),radial-gradient(circle_at_82%_18%,rgba(34,197,94,0.08),transparent_20%),linear-gradient(180deg,#030712_0%,#081121_44%,#030712_100%)] px-4 py-6 text-neutral-50 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-6xl space-y-6 lg:space-y-8">
        <Button
          variant="ghost"
          className="-ml-2 cursor-pointer px-2 text-neutral-400 hover:bg-transparent hover:text-white group"
          onClick={() => router.push("/")}
        >
          <ArrowLeftIcon className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" />
          Back to Dashboard
        </Button>

        <header className="rounded-[2rem] border border-white/10 bg-neutral-950/65 p-5 shadow-[0_24px_120px_rgba(2,6,23,0.45)] backdrop-blur-2xl sm:p-6 lg:p-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-500/10 px-4 py-2 text-xs font-medium uppercase tracking-[0.22em] text-sky-100">
                <FileTextIcon className="h-4 w-4" /> Research digest
              </div>
              <div className="space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight break-words text-white sm:text-4xl lg:text-[3.1rem] lg:leading-[1.05]">
                  {digestTitle}
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-neutral-300 sm:text-base">
                  A private research brief generated inside your Meridian workspace, with editorial structure for fast scanning and safer long-form reading.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:items-end">
              <Badge className="h-auto rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-emerald-100">
                {getConfidenceLabel(digest.confidence)}
              </Badge>
              <div className="rounded-[1.2rem] border border-white/10 bg-black/25 px-4 py-3 text-sm leading-6 text-neutral-300 lg:max-w-[18rem] lg:text-right">
                Published {digestTimestamp}
              </div>
            </div>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-6">
            <Card className="rounded-[1.8rem] border border-white/10 bg-neutral-950/60 shadow-[0_20px_100px_rgba(2,6,23,0.36)] backdrop-blur-xl">
              <CardHeader className="gap-2 px-5 pt-5 sm:px-6 sm:pt-6">
                <CardDescription className="text-xs uppercase tracking-[0.22em] text-neutral-500">Executive summary</CardDescription>
                <CardTitle className="text-xl text-white">What matters most</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5 sm:px-6 sm:pb-6">
                <p className="text-base leading-8 text-neutral-200 sm:text-lg">
                  {digest.executive_summary || "No executive summary available."}
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-[1.8rem] border border-white/10 bg-neutral-950/60 shadow-[0_20px_100px_rgba(2,6,23,0.36)] backdrop-blur-xl">
              <CardHeader className="gap-2 px-5 pt-5 sm:px-6 sm:pt-6">
                <CardDescription className="text-xs uppercase tracking-[0.22em] text-neutral-500">Detailed analysis</CardDescription>
                <CardTitle className="text-xl text-white">Full narrative</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5 sm:px-6 sm:pb-6">
                <div className="space-y-6 text-neutral-200 [&_a]:break-all [&_a]:text-sky-300 [&_a]:underline-offset-4 [&_a:hover]:text-sky-200 [&_a:hover]:underline [&_blockquote]:rounded-[1.35rem] [&_blockquote]:border [&_blockquote]:border-white/10 [&_blockquote]:bg-black/20 [&_blockquote]:px-4 [&_blockquote]:py-4 [&_blockquote]:text-neutral-300 [&_code]:break-words [&_h1]:mt-10 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:text-white [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-white [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-white [&_li]:leading-7 [&_ol]:space-y-2 [&_ol]:pl-5 [&_p]:leading-8 [&_pre]:overflow-x-auto [&_pre]:rounded-[1.35rem] [&_pre]:border [&_pre]:border-white/10 [&_pre]:bg-black/35 [&_pre]:p-4 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:rounded-[1.35rem] [&_table]:border [&_table]:border-white/10 [&_table]:bg-black/20 [&_tbody_tr]:border-t [&_tbody_tr]:border-white/10 [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_thead]:border-b [&_thead]:border-white/10 [&_ul]:space-y-2 [&_ul]:pl-5">
                  <ReactMarkdown>{digest.detailed_analysis || "No detailed analysis available."}</ReactMarkdown>
                </div>
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-6 xl:sticky xl:top-24 xl:self-start">
            <Card className="rounded-[1.8rem] border border-white/10 bg-neutral-950/60 shadow-[0_20px_100px_rgba(2,6,23,0.36)] backdrop-blur-xl">
              <CardHeader className="gap-2 px-5 pt-5 sm:px-6 sm:pt-6">
                <CardDescription className="text-xs uppercase tracking-[0.22em] text-neutral-500">Digest metadata</CardDescription>
                <CardTitle className="text-lg text-white">At a glance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 px-5 pb-5 sm:px-6 sm:pb-6">
                <div className="rounded-[1.25rem] border border-white/10 bg-black/20 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Confidence</p>
                  <p className="mt-2 text-base font-medium text-white">{getConfidenceLabel(digest.confidence)}</p>
                </div>
                <div className="rounded-[1.25rem] border border-white/10 bg-black/20 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Published</p>
                  <p className="mt-2 text-sm leading-6 text-neutral-300">{digestTimestamp}</p>
                </div>
                <div className="rounded-[1.25rem] border border-white/10 bg-black/20 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Sources</p>
                  <p className="mt-2 text-base font-medium text-white">{digest.citations?.length || 0}</p>
                </div>
              </CardContent>
            </Card>

            {digest.citations && digest.citations.length > 0 && (
              <Card className="rounded-[1.8rem] border border-white/10 bg-neutral-950/60 shadow-[0_20px_100px_rgba(2,6,23,0.36)] backdrop-blur-xl">
                <CardHeader className="gap-2 px-5 pt-5 sm:px-6 sm:pt-6">
                  <CardDescription className="text-xs uppercase tracking-[0.22em] text-neutral-500">Sources & citations</CardDescription>
                  <CardTitle className="text-lg text-white">Reference links</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 px-5 pb-5 sm:px-6 sm:pb-6">
                  {digest.citations.map((url: string) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-start justify-between gap-3 rounded-[1.25rem] border border-white/10 bg-black/20 px-4 py-4 transition-colors hover:bg-white/[0.04]"
                    >
                      <span className="min-w-0 break-all text-sm leading-6 text-neutral-300 group-hover:text-white">{url}</span>
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
