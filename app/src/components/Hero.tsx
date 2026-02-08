"use client";

import { Suspense, lazy } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import AnimatedButton from "./AnimatedButton";

const ThreeBackground = lazy(() => import("./ThreeBackground"));

export default function Hero() {
  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <Suspense
        fallback={
          <div
            className="fixed inset-0 -z-10 bg-[var(--bg-primary)]"
            aria-hidden
          />
        }
      >
        <ThreeBackground />
      </Suspense>
      <div className="relative z-10 text-center px-4">
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-[var(--solana-green)] via-[var(--solana-blue)] to-[var(--solana-purple)] bg-clip-text text-transparent"
        >
          FhenixEscrow
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="text-lg md:text-xl text-[var(--text-secondary)] mb-12 max-w-2xl mx-auto"
        >
          Secure, private, milestone-based contracts with on-chain enforcement
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <Link href="/create?role=client" prefetch={false}>
            <AnimatedButton>Create Client Contract</AnimatedButton>
          </Link>
          <Link href="/create?role=developer" prefetch={false}>
            <AnimatedButton variant="secondary">Create Developer Contract</AnimatedButton>
          </Link>
        </motion.div>
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[var(--bg-primary)]/50 to-[var(--bg-primary)] pointer-events-none" />
    </div>
  );
}
