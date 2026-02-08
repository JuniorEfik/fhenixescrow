"use client";

import { motion } from "framer-motion";

export default function ContractLoader() {
  return (
    <div className="flex items-center justify-center p-12">
      <div className="relative">
        <motion.div
          className="w-24 h-24 rounded-full border-4 border-[var(--solana-green)]/20 border-t-[var(--solana-green)]"
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-gradient-to-r from-[var(--solana-green)] to-[var(--solana-blue)]"
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      </div>
    </div>
  );
}
