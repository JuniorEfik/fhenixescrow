"use client";

import { motion } from "framer-motion";
import type { ContractStateKey } from "@/lib/contracts";

const statusColors: Record<string, string> = {
  DRAFT: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  SIGNED: "bg-sky-500/20 text-sky-400 border-sky-500/30",
  FUNDED: "bg-[#03E1FF]/20 text-[#03E1FF] border-[#03E1FF]/30",
  IN_PROGRESS: "bg-[#00FFA3]/20 text-[#00FFA3] border-[#00FFA3]/30",
  COMPLETED: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  DISPUTED: "bg-red-500/20 text-red-400 border-red-500/30",
  CANCELLED: "bg-[var(--text-muted)]/20 text-[var(--text-muted)] border-white/10",
  PAID_OUT: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};

export default function StatusBadge({ status }: { status: ContractStateKey | string }) {
  const colorClass = statusColors[status] ?? "bg-white/10 text-white border-white/20";
  return (
    <motion.span
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${colorClass}`}
    >
      <motion.span
        className="w-2 h-2 rounded-full bg-current mr-2"
        animate={{ opacity: [1, 0.3, 1] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />
      {String(status).replace("_", " ")}
    </motion.span>
  );
}
