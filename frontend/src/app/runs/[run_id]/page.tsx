"use client";

import { useParams } from "next/navigation";
import { useAgentRunStream } from "@/lib/useAgentRunStream";
import { motion } from "framer-motion";
import { TerminalIcon, CpuIcon, Loader2Icon, ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function RunViewer() {
  const params = useParams();
  const runId = params.run_id as string;
  const { logs, isConnected } = useAgentRunStream(runId);
  
  // Mocking initial logic tracing to display the UI immediately for demo purposes
  const displayLogs = logs.length > 0 ? logs : [
    { step: 1, status: "thinking", message: "Analyzing User Query and configuring memory vectors..." },
    { step: 1, status: "tool_use", tool: "web_search", message: "Calling Tavily API to fetch top queries." },
    { step: 2, status: "thinking", message: "Synthesizing 4 search results..." },
    { step: 2, status: "tool_use", tool: "save_to_memory", message: "Persisting insight to pgvector block 0x3f9A" },
    { step: 3, status: "thinking", message: "Threshold reached. Dispatching final digest..." },
  ];

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

        <div className="bg-black/80 rounded-2xl border border-white/10 shadow-xl overflow-hidden font-mono text-sm relative">
          <div className="absolute top-0 left-0 right-0 h-8 bg-neutral-900 border-b border-white/10 flex items-center px-4 gap-2">
             <div className="w-3 h-3 rounded-full bg-rose-500/80" />
             <div className="w-3 h-3 rounded-full bg-amber-500/80" />
             <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
             <div className="ml-4 text-xs font-sans text-neutral-600">agent-tty0 - SSH</div>
          </div>
          <div className="p-6 pt-12 min-h-[400px] flex flex-col gap-4">
            {displayLogs.map((log, i) => (
              <motion.div 
                key={i} 
                initial={{ opacity: 0, x: -10 }} 
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.15 }}
                className="flex items-start gap-4 p-2 hover:bg-white/5 rounded-md transition-colors"
               >
                 <span className="text-neutral-500 shrink-0 select-none">[{log.step}]</span>
                 <span className={`shrink-0 ${log.status === "tool_use" ? "text-indigo-400 font-semibold" : "text-neutral-200"}`}>
                   {log.status === "tool_use" ? `[λ ${log.tool}]` : "[agent]"}
                 </span>
                 <span className={log.status === "tool_use" ? "text-indigo-200" : "text-emerald-300"}>{log.message}</span>
              </motion.div>
            ))}
            <div className="text-neutral-500 animate-pulse flex items-center gap-2 mt-4 ml-2">
                <Loader2Icon className="animate-spin w-4 h-4"/> Awaiting lambda pulse...
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
