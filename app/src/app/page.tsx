"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { motion } from "framer-motion";
import GlassCard from "@/components/GlassCard";
import Footer from "@/components/Footer";
import Link from "next/link";
import AnimatedButton from "@/components/AnimatedButton";

const ThreeBackground = dynamic(() => import("@/components/ThreeBackground"), { ssr: false });

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.2 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
};

export default function Home() {
  return (
    <main className="pt-16">
      <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <Suspense fallback={<div className="fixed inset-0 -z-10 bg-[var(--bg-primary)]" aria-hidden />}>
          <ThreeBackground />
        </Suspense>
        <div className="relative z-10 text-center px-4">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-[var(--solana-green)] via-[var(--solana-blue)] to-[var(--solana-purple)] bg-clip-text text-transparent"
          >
            FhenixEscrow
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="text-lg md:text-xl text-[var(--text-secondary)] mb-12 max-w-2xl mx-auto"
          >
            Secure, private, milestone-based contracts with on-chain enforcement
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
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
      <section className="relative z-10 max-w-6xl mx-auto px-4 py-24">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-3xl font-bold text-center mb-12 text-[var(--text-primary)]"
        >
          How It Works
        </motion.h2>
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid md:grid-cols-3 gap-6"
        >
          {[
            { step: 1, title: "Create & Negotiate", desc: "Client or developer creates a contract. Set encrypted terms and milestones." },
            { step: 2, title: "Sign & Fund", desc: "Both parties sign. Client funds the escrow. Work begins." },
            { step: 3, title: "Complete & Payout", desc: "Developer submits milestones; client approves. Claim payout when all are approved." },
          ].map((item) => (
            <motion.div key={item.step} variants={itemVariants}>
              <GlassCard className="p-6">
                <div className="text-2xl font-bold text-[var(--solana-green)] mb-2">{item.step}</div>
                <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-[var(--text-secondary)] text-sm">{item.desc}</p>
              </GlassCard>
            </motion.div>
          ))}
        </motion.div>
      </section>
      <section className="relative z-10 max-w-6xl mx-auto px-4 py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <GlassCard className="p-8">
            <h2 className="text-2xl font-bold mb-4">Why FhenixEscrow?</h2>
            <ul className="space-y-2 text-[var(--text-secondary)]">
              <li>• <strong className="text-[var(--text-primary)]">Private terms</strong> — Amount and details encrypted with FHE (Fhenix)</li>
              <li>• <strong className="text-[var(--text-primary)]">Milestone-based</strong> — Release funds only when work is approved</li>
              <li>• <strong className="text-[var(--text-primary)]">On-chain</strong> — Non-custodial, enforced by smart contracts</li>
              <li>• <strong className="text-[var(--text-primary)]">Dispute resolution</strong> — Raise disputes and resolve on-chain</li>
              <li>• <strong className="text-[var(--text-primary)]">Timeout & refund</strong> — Client can claim refund after deadline if milestones incomplete</li>
            </ul>
            <div className="mt-6">
              <Link href="/dashboard">
                <span className="inline-block px-6 py-3 rounded-lg bg-gradient-to-r from-[var(--solana-green)] to-[var(--solana-blue)] text-[var(--bg-primary)] font-semibold hover:opacity-90">
                  Go to Dashboard
                </span>
              </Link>
            </div>
          </GlassCard>
        </motion.div>
      </section>
      <Footer />
    </main>
  );
}
