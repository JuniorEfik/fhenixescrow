"use client";

import { motion } from "framer-motion";

interface AnimatedButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
}

export default function AnimatedButton({
  children,
  variant = "primary",
  className = "",
  ...props
}: AnimatedButtonProps) {
  const base =
    "px-6 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none outline-none focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--solana-green)] ";
  const variants = {
    primary:
      "bg-gradient-to-r from-[var(--solana-green)] to-[var(--solana-blue)] text-[var(--bg-primary)] shadow-lg shadow-[var(--solana-green)]/30 hover:opacity-95",
    secondary:
      "bg-[var(--bg-secondary)] border border-[var(--solana-green)]/30 text-[var(--text-primary)] hover:border-[var(--solana-green)]/50",
    ghost: "bg-transparent text-[var(--text-accent)] hover:bg-white/5",
  };

  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
      className="inline-block [&_button]:outline-none"
    >
      <button
        type="button"
        className={base + variants[variant] + " " + className}
        {...props}
      >
        {children}
      </button>
    </motion.div>
  );
}
