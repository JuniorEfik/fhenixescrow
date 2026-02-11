"use client";

export default function ContractLoader() {
  return (
    <div className="flex items-center justify-center p-12 min-h-[200px]">
      <div
        className="h-10 w-10 rounded-full border-2 border-[var(--solana-green)]/30 border-t-[var(--solana-green)] animate-spin"
        aria-hidden
      />
    </div>
  );
}
