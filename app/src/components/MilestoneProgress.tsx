"use client";

import { motion } from "framer-motion";

interface MilestoneProgressProps {
  completed: number;
  total: number;
}

export default function MilestoneProgress({ completed, total }: MilestoneProgressProps) {
  const percentage = total > 0 ? (completed / total) * 100 : 0;

  return (
    <div className="relative w-full h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
      <motion.div
        className="absolute h-full bg-gradient-to-r from-[var(--solana-green)] to-[var(--solana-blue)]"
        initial={{ width: 0 }}
        animate={{ width: `${percentage}%` }}
        transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.div
        className="absolute h-full w-full bg-gradient-to-r from-transparent via-white to-transparent opacity-30"
        animate={{ x: ["-100%", "200%"] }}
        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
}
