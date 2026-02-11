"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { parseEther } from "ethers";
import { useWallet } from "@/context/WalletContext";
import GlassCard from "@/components/GlassCard";
import AnimatedButton from "@/components/AnimatedButton";
import Modal from "@/components/Modal";
import Link from "next/link";
import { getErrorMessage, isUserRejection } from "@/lib/error-utils";
import { getEscrowContractAddress } from "@/lib/constants";
import { preloadCofhe } from "@/lib/cofhe-client";

type CreateMode = "address" | "link";

export default function CreatePageContent() {
  const searchParams = useSearchParams();
  const role = searchParams.get("role") || "client";
  const { address, provider } = useWallet();
  const [mode, setMode] = useState<CreateMode>("address");
  const [otherParty, setOtherParty] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [createdInviteId, setCreatedInviteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSamePartyPopup, setShowSamePartyPopup] = useState(false);
  const [showCanceledPopup, setShowCanceledPopup] = useState(false);
  const [showTerminalPopup, setShowTerminalPopup] = useState(false);
  const [terminalLines, setTerminalLines] = useState<string[]>([]);

  const isClient = role === "client";

  const terminalLog = (message: string) => {
    setTerminalLines((prev) => [...prev, message]);
  };

  useEffect(() => {
    if (provider && address) preloadCofhe(provider);
  }, [provider, address]);

  const resolveOtherPartyAddress = async (): Promise<string> => {
    const raw = otherParty.trim();
    if (raw.startsWith("0x") && raw.length >= 42) return raw;
    const escrow = await import("@/lib/escrow-service");
    const resolved = await escrow.getAddressByUsername(provider!, raw);
    if (!resolved) throw new Error(`Username "${raw}" not found. They must set their username on-chain first.`);
    return resolved;
  };

  const handleCreateForAddress = async () => {
    if (!provider || !address || !otherParty.trim() || !totalAmount.trim()) {
      setError("Fill all fields.");
      return;
    }
    if (!getEscrowContractAddress()?.trim()) {
      setError("App not configured: missing escrow contract address.");
      return;
    }
    let wei: bigint;
    try {
      wei = parseEther(totalAmount.trim());
    } catch {
      setError("Enter a valid total payment amount (e.g. 1.5).");
      return;
    }
    if (wei <= 0n) {
      setError("Total payment must be greater than 0.");
      return;
    }
    setLoading(true);
    setError(null);
    setShowTerminalPopup(true);
    setTerminalLines(["$ Creating contract…"]);
    try {
      terminalLog("Resolving party address…");
      const otherAddress = await resolveOtherPartyAddress();
      if (address && otherAddress.toLowerCase() === address.toLowerCase()) {
        setShowSamePartyPopup(true);
        setLoading(false);
        setShowTerminalPopup(false);
        return;
      }
      const { runCreateContract } = await import("@/lib/createContractAction");
      const wei = parseEther(totalAmount.trim());
      const clientAddress = isClient ? address : otherAddress;
      const developerAddress = isClient ? otherAddress : address;
      const { contractId } = await runCreateContract(provider, clientAddress, developerAddress, wei, terminalLog);
      terminalLog("Done.");
      setCreatedId(contractId ?? null);
    } catch (e) {
      if (isUserRejection(e)) {
        setShowCanceledPopup(true);
      } else {
        setError(getErrorMessage(e));
        terminalLog(`Error: ${getErrorMessage(e)}`);
      }
      if (typeof window !== "undefined") console.error("[Create contract]", e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLink = async () => {
    if (!provider || !address || !totalAmount.trim()) {
      setError("Enter total payment.");
      return;
    }
    if (!getEscrowContractAddress()?.trim()) {
      setError("App not configured: missing escrow contract address.");
      return;
    }
    let wei: bigint;
    try {
      wei = parseEther(totalAmount.trim());
    } catch {
      setError("Enter a valid total payment amount (e.g. 1.5).");
      return;
    }
    if (wei <= 0n) {
      setError("Total payment must be greater than 0.");
      return;
    }
    setLoading(true);
    setError(null);
    setShowTerminalPopup(true);
    setTerminalLines(["$ Creating invite link…"]);
    try {
      const escrow = await import("@/lib/escrow-service");
      const { inviteId } = await escrow.createInvite(provider, isClient, wei, terminalLog);
      terminalLog("Done.");
      setCreatedInviteId(inviteId ?? null);
    } catch (e) {
      if (isUserRejection(e)) {
        setShowCanceledPopup(true);
      } else {
        setError(getErrorMessage(e));
        terminalLog(`Error: ${getErrorMessage(e)}`);
      }
      if (typeof window !== "undefined") console.error("[Create invite]", e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    if (mode === "link") handleCreateLink();
    else handleCreateForAddress();
  };

  if (!address) {
    return (
      <main className="pt-24 px-4 max-w-lg mx-auto">
        <GlassCard className="p-8 text-center">
          <p className="text-[var(--text-secondary)]">Connect your wallet to create a contract.</p>
          <Link href="/" className="mt-4 inline-block text-[var(--solana-green)]">Back to Home</Link>
        </GlassCard>
      </main>
    );
  }

  if (createdId !== null) {
    const shortId = createdId.startsWith("0x") ? createdId.slice(2, 10) : createdId.slice(0, 8);
    return (
      <main className="pt-24 px-4 max-w-lg mx-auto">
        <GlassCard className="p-8 text-center">
          <p className="text-[var(--solana-green)] font-semibold">Contract created!</p>
          <p className="text-[var(--text-muted)] mt-2 font-mono text-sm break-all" title={createdId}>#{shortId}</p>
          <Link href={`/contract/${createdId}`} className="mt-4 inline-block text-[var(--solana-green)] hover:underline">
            Open contract →
          </Link>
        </GlassCard>
      </main>
    );
  }

  if (createdInviteId !== null) {
    const acceptUrl = typeof window !== "undefined" ? `${window.location.origin}/create/accept/${createdInviteId}` : `/create/accept/${createdInviteId}`;
    const shortInvite = createdInviteId.startsWith("0x") ? createdInviteId.slice(2, 10) : createdInviteId.slice(0, 8);
    return (
      <main className="pt-24 px-4 max-w-lg mx-auto">
        <GlassCard className="p-8 text-center">
          <p className="text-[var(--solana-green)] font-semibold">Unique link created!</p>
          <p className="text-[var(--text-muted)] mt-2 text-sm">
            Share this link with a {isClient ? "developer" : "client"}. The first to accept becomes the other party. They can bail out before both sign to free the link.
          </p>
          <p className="mt-3 font-mono text-xs text-[var(--text-muted)] break-all" title={createdInviteId}>#{shortInvite}</p>
          <div className="mt-4 flex flex-col gap-2">
            <input readOnly value={acceptUrl} className="w-full bg-[var(--bg-tertiary)] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono" />
            <AnimatedButton
              variant="secondary"
              onClick={() => { navigator.clipboard.writeText(acceptUrl); }}
            >
              Copy link
            </AnimatedButton>
          </div>
          <Link href="/dashboard" className="mt-4 inline-block text-sm text-[var(--solana-green)] hover:underline">
            Back to Dashboard
          </Link>
        </GlassCard>
      </main>
    );
  }

  return (
    <main className="pt-24 px-4 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6">
        {isClient ? "Create as Client" : "Create as Developer"}
      </h1>
      <GlassCard className="p-6">
        <p className="text-sm text-[var(--text-muted)] mb-4">
          You are the {isClient ? "client" : "developer"}. Choose to invite by address/username or create a unique link for someone to accept.
        </p>

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setMode("address")}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${mode === "address" ? "bg-[var(--solana-green)]/20 text-[var(--solana-green)] border border-[var(--solana-green)]/50" : "bg-[var(--bg-tertiary)] border border-white/10 text-[var(--text-muted)]"}`}
          >
            Address or username
          </button>
          <button
            type="button"
            onClick={() => setMode("link")}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${mode === "link" ? "bg-[var(--solana-green)]/20 text-[var(--solana-green)] border border-[var(--solana-green)]/50" : "bg-[var(--bg-tertiary)] border border-white/10 text-[var(--text-muted)]"}`}
          >
            Create unique link
          </button>
        </div>

        <div className="space-y-4">
          {mode === "address" && (
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1">
                {isClient ? "Developer address or username" : "Client address or username"}
              </label>
              <input
                type="text"
                value={otherParty}
                onChange={(e) => setOtherParty(e.target.value)}
                placeholder="0x... or username"
                className="w-full bg-[var(--bg-tertiary)] border border-white/10 rounded-lg px-4 py-2 font-mono text-sm"
              />
            </div>
          )}
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1">Total payment</label>
            <input
              type="text"
              inputMode="decimal"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              placeholder="e.g. 1.5"
              className="w-full bg-[var(--bg-tertiary)] border border-white/10 rounded-lg px-4 py-2 font-mono text-sm"
            />
          </div>
          {error && (
            <div className="space-y-1">
              <p className="text-red-400 text-sm">{error}</p>
              <p className="text-xs text-[var(--text-muted)]">
                Ensure your wallet is on the same chain as app config and ESCROW_CONTRACT_ADDRESS is set (in .env or Netlify).
              </p>
            </div>
          )}
          <AnimatedButton onClick={handleCreate} disabled={loading} className="w-full inline-flex items-center justify-center gap-2">
            {loading && (
              <span className="inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden />
            )}
            {loading ? (mode === "link" ? "Creating link" : "Creating") : mode === "link" ? "Create link" : "Create contract"}
          </AnimatedButton>
        </div>
        <Link href="/dashboard" className="block mt-4 text-center text-sm text-[var(--text-muted)] hover:text-white">
          Back to Dashboard
        </Link>
      </GlassCard>

      {showSamePartyPopup && (
        <Modal title="Cannot create contract" onClose={() => setShowSamePartyPopup(false)}>
          <p className="text-sm text-[var(--text-muted)] mb-4">
            Client and developer must be different. You cannot create a contract with your own address or username.
          </p>
          <AnimatedButton onClick={() => setShowSamePartyPopup(false)} className="w-full">
            OK
          </AnimatedButton>
        </Modal>
      )}

      {showCanceledPopup && (
        <Modal title="Contract creation was cancelled" onClose={() => setShowCanceledPopup(false)}>
          <p className="text-sm text-[var(--text-muted)] mb-4">
            The transaction was canceled. You can try again when you&apos;re ready.
          </p>
          <AnimatedButton onClick={() => setShowCanceledPopup(false)} className="w-full">
            OK
          </AnimatedButton>
        </Modal>
      )}

      {showTerminalPopup && (
        <Modal title="Creating…" onClose={() => setShowTerminalPopup(false)}>
          <div
            className="rounded-lg bg-[#0d1117] border border-white/10 p-4 font-mono text-sm text-[var(--solana-green)] overflow-x-auto min-h-[120px]"
            style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.05)" }}
          >
            {terminalLines.map((line, i) => (
              <div key={i} className="leading-relaxed">
                {line.startsWith("Error:") ? (
                  <span className="text-red-400">{line}</span>
                ) : (
                  line
                )}
              </div>
            ))}
            {loading && (
              <span className="inline-block w-2 h-4 ml-0.5 bg-[var(--solana-green)] animate-pulse" aria-hidden />
            )}
          </div>
          <AnimatedButton onClick={() => setShowTerminalPopup(false)} className="w-full mt-4">
            {loading ? "Minimize" : "Close"}
          </AnimatedButton>
        </Modal>
      )}
    </main>
  );
}
