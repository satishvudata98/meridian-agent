"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ArrowLeftIcon, FileTextIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function DigestView() {
  const params = useParams();
  const router = useRouter();
  const digestId = params.digest_id as string;
  const [digest, setDigest] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDigest = async () => {
      try {
        const url = process.env.NEXT_PUBLIC_GET_DIGESTS_URL;
        if (!url) return;
        
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          // Find the specific digest from the bulk response
          const found = data.find((d: any) => d.digest_id === digestId);
          setDigest(found);
        }
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
      <main className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <Loader2Icon className="w-8 h-8 text-indigo-500 animate-spin" />
      </main>
    );
  }

  if (!digest) {
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-50 p-8 flex flex-col items-center justify-center">
        <h1 className="text-2xl font-bold mb-4">Report Not Found</h1>
        <Button variant="outline" onClick={() => router.push("/")}>Return to Dashboard</Button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50 p-8 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <div className="max-w-4xl mx-auto space-y-8">
        <Button variant="ghost" className="text-neutral-400 hover:text-white px-0 hover:bg-transparent -ml-2 group cursor-pointer" onClick={() => router.push("/")}>
          <ArrowLeftIcon className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" /> Back to Dashboard
        </Button>
        
        <header className="border-b border-white/10 pb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl">
              <FileTextIcon className="w-6 h-6" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">{digest.topic_id}</h1>
          </div>
          <div className="flex items-center gap-3">
             <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{digest.confidence || 90}% Confidence</Badge>
             <span className="text-sm text-neutral-500">{new Date(digest.created_at).toLocaleString()}</span>
          </div>
        </header>

        <section className="prose prose-invert prose-indigo max-w-none">
          <h2 className="text-2xl text-indigo-300 border-b border-white/5 pb-2">Executive Summary</h2>
          <p className="text-lg text-neutral-300 leading-relaxed mb-8">
            {digest.executive_summary}
          </p>

          <h2 className="text-2xl text-indigo-300 border-b border-white/5 pb-2">Detailed Analysis</h2>
          <div className="text-neutral-300 leading-relaxed space-y-4">
            <ReactMarkdown>{digest.detailed_analysis}</ReactMarkdown>
          </div>

          {digest.citations && digest.citations.length > 0 && (
            <div className="mt-12 p-6 bg-neutral-900/50 rounded-2xl border border-white/5">
              <h2 className="text-xl text-neutral-200 mb-4 flex items-center gap-2">Sources & Citations</h2>
              <ul className="list-disc list-inside space-y-2 text-sm text-neutral-400">
                {digest.citations.map((url: string, i: number) => (
                  <li key={i}>
                    <a href={url} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-400 transition-colors">
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
