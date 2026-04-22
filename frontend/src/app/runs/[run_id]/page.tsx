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
  
  const isCompleted = logs.some(log => log.status === "completed");
  const displayLogs = logs;

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
                transition={{ delay: 0.1 }}
                className="flex items-start gap-4 p-2 hover:bg-white/5 rounded-md transition-colors"
               >
                 <span className="text-neutral-500 shrink-0 select-none">[{log.step}]</span>
                 <span className={`shrink-0 ${log.status === "tool_use" ? "text-indigo-400 font-semibold" : (log.status === "completed" ? "text-emerald-400 font-bold" : "text-neutral-200")}`}>
                   {log.status === "tool_use" ? `[λ ${log.tool}]` : (log.status === "completed" ? "[done]" : "[agent]")}
                 </span>
                 <span className={log.status === "tool_use" ? "text-indigo-200" : (log.status === "completed" ? "text-emerald-300 font-medium" : "text-emerald-300")}>{log.message || log.status}</span>
              </motion.div>
            ))}
            {!isCompleted && (
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
                <h3 className="text-xl font-bold text-emerald-400">Run Completed Successfully! 🎉</h3>
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
