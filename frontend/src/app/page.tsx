"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchIcon, ActivityIcon, PlusIcon, ExternalLink, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";

export default function Home() {
  const router = useRouter();
  const [topicInput, setTopicInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleTrigger = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topicInput.trim()) return;
    
    setIsSubmitting(true);
    try {
      // Note: Make sure NEXT_PUBLIC_TRIGGER_URL is set in your .env.local
      const triggerUrl = process.env.NEXT_PUBLIC_TRIGGER_URL || "";
      if (!triggerUrl) {
          alert("Missing NEXT_PUBLIC_TRIGGER_URL. Please set it in your environment variables.");
          setIsSubmitting(false);
          return;
      }
      
      const response = await fetch(triggerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic_name: topicInput })
      });
      
      if (response.ok) {
        const data = await response.json();
        router.push(`/runs/${data.run_id}`);
      } else {
        const errorText = await response.text();
        alert(`Failed to trigger: ${errorText}`);
        setIsSubmitting(false);
      }
    } catch (err) {
      console.error(err);
      alert("Error connecting to backend trigger endpoint.");
      setIsSubmitting(false);
    }
  };

  // Mock data for the Scaffold - in production this fetches from our DynamoDB digest API
  const digests = [
    { id: "run-LLM500", topic: "LLM Agent Frameworks 2025", date: "April 21, 2026", confidence: 94, findings: ["Autonomous routing is standard", "Cost guardrails are key", "Bedrock usage surging"] },
    { id: "run-AWS701", topic: "AWS Serverless Pricing Models", date: "April 20, 2026", confidence: 88, findings: ["Lambda cold starts drastically mitigated", "SQS limits natively increased", "pgvector standard in RDS"] }
  ];

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
          <form onSubmit={handleTrigger} className="flex gap-2">
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
            {digests.map((digest, i) => (
              <motion.div 
                key={digest.id} 
                initial={{ opacity: 0, y: 20 }} 
                animate={{ opacity: 1, y: 0 }} 
                transition={{ delay: i * 0.1, type: "spring", stiffness: 100 }}
              >
                <Card className="bg-neutral-900/60 border-white/10 hover:border-indigo-500/50 transition-colors duration-300 group overflow-hidden relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg text-white group-hover:text-indigo-300 transition-colors">{digest.topic}</CardTitle>
                      <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{digest.confidence}% Quality</Badge>
                    </div>
                    <CardDescription className="text-neutral-500">{digest.date}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3 mb-6">
                      {digest.findings.map((f, j) => (
                        <li key={j} className="text-sm text-neutral-300 flex items-start gap-2">
                          <span className="text-indigo-500 mt-0.5">•</span> {f}
                        </li>
                      ))}
                    </ul>
                    <Link href={`/runs/${digest.id}`}>
                        <Button variant="outline" className="w-full bg-transparent border-white/10 hover:bg-neutral-800 hover:text-indigo-300 text-neutral-300 transition-all rounded-xl cursor-pointer">
                            View ReAct Traces
                            <ExternalLink className="w-4 h-4 ml-2 opacity-50" />
                        </Button>
                    </Link>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
