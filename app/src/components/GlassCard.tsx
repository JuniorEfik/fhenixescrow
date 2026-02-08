"use client";

import { motion } from "framer-motion";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
}

export default function GlassCard({ children, className = "" }: GlassCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`
        relative overflow-hidden
        bg-gradient-to-br from-[var(--bg-glass)] to-transparent
        backdrop-blur-xl border border-white/10
        rounded-2xl shadow-2xl
        ${className}
      `}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-[var(--solana-green)]/5 via-transparent to-[var(--solana-blue)]/5 pointer-events-none" />
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}
