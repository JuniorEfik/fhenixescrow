"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useWallet } from "@/context/WalletContext";
import AnimatedButton from "./AnimatedButton";
import Modal from "./Modal";
import { getUsername, setUsername as setUsernameOnChain, getAddressByUsernameReadOnly } from "@/lib/escrow-service";
import { getReadOnlyProvider } from "@/lib/ethers-provider";
import { getChainConfig } from "@/lib/constants";
import { normalizeUsernameForStore, formatUsernameForDisplay } from "@/lib/username";
import { getActionErrorMessage, getErrorSuggestion, isUserRejection } from "@/lib/error-utils";

type UsernameAvailability = "idle" | "checking" | "available" | "taken" | "own";

export default function Header() {
  const pathname = usePathname();
  const { address, provider, isConnecting, connect, disconnect, chainId, walletMessage, clearWalletMessage, isWrongNetwork, switchNetwork } = useWallet();
  const chainConfig = getChainConfig();
  const chainName = chainId === chainConfig.chainId ? chainConfig.chainName : null;
  const [username, setUsername] = useState<string>("");
  const [usernameLoading, setUsernameLoading] = useState(false);
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [editInput, setEditInput] = useState("");
  const [savingUsername, setSavingUsername] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameAvailability, setUsernameAvailability] = useState<UsernameAvailability>("idle");
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [showCanceledPopup, setShowCanceledPopup] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const checkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCheckRef = useRef<string>("");

  useEffect(() => {
    if (!address || !provider) {
      setUsername("");
      return;
    }
    let cancelled = false;
    setUsernameLoading(true);
    import("@/lib/escrow-service").then((escrow) => {
      escrow.getUsername(provider, address).then((name) => {
        if (!cancelled) {
          setUsername(name || "");
          setEditInput(name || "");
        }
      }).finally(() => { if (!cancelled) setUsernameLoading(false); });
    });
    return () => { cancelled = true; };
  }, [address, provider]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setWalletMenuOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  useEffect(() => {
    if (!showUsernameModal) {
      setUsernameAvailability("idle");
      lastCheckRef.current = "";
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
        checkTimeoutRef.current = null;
      }
      return;
    }
    const { clean, error } = normalizeUsernameForStore(editInput);
    if (error || !clean) {
      setUsernameAvailability("idle");
      lastCheckRef.current = "";
      return;
    }
    const query = clean.toLowerCase();
    if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
    checkTimeoutRef.current = setTimeout(async () => {
      checkTimeoutRef.current = null;
      lastCheckRef.current = query;
      setUsernameAvailability("checking");
      const providerToUse = getReadOnlyProvider() ?? provider;
      if (!providerToUse) {
        setUsernameAvailability("idle");
        return;
      }
      try {
        const escrow = await import("@/lib/escrow-service");
        const addr = await escrow.getAddressByUsernameReadOnly(providerToUse, query);
        if (lastCheckRef.current !== query) return;
        if (!addr) {
          setUsernameAvailability("available");
          return;
        }
        const sameUser = address && addr.toLowerCase() === address.toLowerCase();
        setUsernameAvailability(sameUser ? "own" : "taken");
      } catch {
        if (lastCheckRef.current === query) setUsernameAvailability("idle");
      }
    }, 400);
    return () => {
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
        checkTimeoutRef.current = null;
      }
    };
  }, [showUsernameModal, editInput, provider, address]);

  const handleSaveUsername = async () => {
    if (!provider) return;
    const { clean, error } = normalizeUsernameForStore(editInput);
    setUsernameError(error ?? null);
    if (error || !clean) return;
    setSavingUsername(true);
    setUsernameError(null);
    try {
      await setUsernameOnChain(provider, clean);
      setUsername(clean);
      setShowUsernameModal(false);
      setUsernameError(null);
    } catch (e: unknown) {
      if (isUserRejection(e)) {
        setShowCanceledPopup(true);
      } else {
        setUsernameError(getErrorSuggestion(getActionErrorMessage(e)) || "Could not save. Please try again.");
      }
    } finally {
      setSavingUsername(false);
    }
  };

  const displayLabel = username.trim() ? formatUsernameForDisplay(username) : (address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "");
  const navLink = (href: string, label: string) => {
    const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));
    return (
      <Link
        href={href}
        className={`text-sm font-medium transition-colors rounded-lg px-3 py-2 ${isActive ? "text-[var(--solana-green)] bg-white/5" : "text-[var(--text-secondary)] hover:text-white hover:bg-white/5"}`}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[var(--bg-primary)]/90 backdrop-blur-xl">
      {isWrongNetwork && (
        <div className="bg-amber-500/20 border-b border-amber-500/40 px-4 py-2 flex items-center justify-center gap-3 text-sm">
          <span className="text-amber-200">Wrong network. Switch to {chainConfig.chainName} to use the app.</span>
          <button type="button" onClick={switchNetwork} className="px-3 py-1 rounded bg-amber-500/30 text-amber-100 hover:bg-amber-500/50 font-medium">
            Switch network
          </button>
        </div>
      )}
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg tracking-tight shrink-0">
          <Image src="/fhenix.png" alt="" width={28} height={28} className="rounded-md shrink-0" priority />
          <span className="bg-gradient-to-r from-[var(--solana-green)] to-[var(--solana-blue)] bg-clip-text text-transparent">FhenixEscrow</span>
        </Link>
        <nav className="flex items-center gap-1">
          {navLink("/", "Home")}
          {navLink("/dashboard", "Dashboard")}
        </nav>
        <div className="flex items-center gap-2 min-w-0">
          {chainName && address && !isWrongNetwork && (
            <span className="text-xs text-[var(--text-muted)] hidden sm:inline" title="Current network">
              {chainName}
            </span>
          )}
          {address ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setWalletMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded-full bg-white/5 border border-white/10 pl-4 pr-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-white/10 hover:border-white/20 hover:text-white transition-colors min-w-0"
                title={address}
              >
                <span className="font-mono truncate max-w-[120px]">
                  {usernameLoading ? "…" : displayLabel}
                </span>
                <svg className="w-4 h-4 shrink-0 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {walletMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-white/10 bg-[var(--bg-secondary)] shadow-xl py-1 z-50">
                  <button
                    type="button"
                    onClick={() => { setEditInput(username); setShowUsernameModal(true); setWalletMenuOpen(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:bg-white/5 hover:text-white transition-colors"
                  >
                    {username ? "Edit display name" : "Set display name"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { disconnect(); setWalletMenuOpen(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-red-400/90 hover:bg-red-500/10 transition-colors"
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-end gap-1">
              <AnimatedButton onClick={connect} disabled={isConnecting} variant="primary" className="shrink-0">
                {isConnecting ? "Connecting…" : "Connect Wallet"}
              </AnimatedButton>
              {walletMessage && (
                <div className="absolute top-full right-0 mt-2 w-72 p-3 rounded-lg bg-[var(--bg-secondary)] border border-white/10 shadow-xl z-50 text-left">
                  <p className="text-sm text-[var(--text-secondary)]">{walletMessage}</p>
                  <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--solana-green)] hover:underline mt-2 inline-block">
                    Install MetaMask
                  </a>
                  <button type="button" onClick={clearWalletMessage} className="block mt-2 text-xs text-[var(--text-muted)] hover:text-white">
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {showUsernameModal && (
        <Modal title="Username" onClose={() => { setShowUsernameModal(false); setUsernameError(null); setUsernameAvailability("idle"); }} belowHeader>
          <p className="text-sm text-[var(--text-muted)] mb-3">Letters and numbers only (max 32). You can type @alice or alice.</p>
          <label htmlFor="username-input" className="sr-only">Username</label>
          <input
            id="username-input"
            type="text"
            maxLength={33}
            placeholder="e.g. alice or @alice"
            value={editInput}
            onChange={(e) => { setEditInput(e.target.value); setUsernameError(null); }}
            className="w-full bg-[var(--bg-tertiary)] border border-white/10 rounded-lg px-3 py-2 text-sm mb-1"
          />
          {usernameAvailability === "checking" && (
            <p className="text-xs text-[var(--text-muted)] mb-2" aria-live="polite">Checking availability…</p>
          )}
          {usernameAvailability === "available" && (
            <p className="text-xs text-[var(--solana-green)] mb-2">Username available</p>
          )}
          {usernameAvailability === "own" && (
            <p className="text-xs text-[var(--text-muted)] mb-2">This is your current username</p>
          )}
          {usernameAvailability === "taken" && (
            <p className="text-xs text-red-400 mb-2">Username already taken</p>
          )}
          {usernameError && <p className="text-red-400 text-xs mb-2">{usernameError}</p>}
          <div className="flex gap-2 justify-end mt-4">
            <AnimatedButton variant="ghost" onClick={() => { setShowUsernameModal(false); setUsernameError(null); setUsernameAvailability("idle"); }}>Cancel</AnimatedButton>
            <AnimatedButton
              onClick={handleSaveUsername}
              disabled={savingUsername || !editInput.trim() || usernameAvailability === "taken" || usernameAvailability === "checking"}
            >
              {savingUsername ? (
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden />
                  Saving
                </span>
              ) : (
                "Save"
              )}
            </AnimatedButton>
          </div>
        </Modal>
      )}

      {showCanceledPopup && (
        <Modal title="Transaction was canceled" onClose={() => setShowCanceledPopup(false)}>
          <p className="text-sm text-[var(--text-muted)] mb-4">
            The transaction was canceled. You can try again when you&apos;re ready.
          </p>
          <AnimatedButton onClick={() => setShowCanceledPopup(false)} className="w-full">
            OK
          </AnimatedButton>
        </Modal>
      )}
    </header>
  );
}
