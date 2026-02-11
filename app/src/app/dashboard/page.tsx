"use client";

import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useWallet } from "@/context/WalletContext";
import StatusBadge from "@/components/StatusBadge";
import ContractLoader from "@/components/ContractLoader";
import AnimatedButton from "@/components/AnimatedButton";
import { CONTRACT_STATES } from "@/lib/contracts";
import { formatUsernameForDisplay } from "@/lib/username";
import { getDefaultChainId } from "@/lib/constants";
import { getEthersProvider, switchToFhenixNetwork } from "@/lib/ethers-provider";
import { formatEther } from "ethers";

interface ContractRow {
  id: string;
  client: string;
  developer: string;
  state: number;
  balance: bigint;
  milestoneCount: number;
  approvedCount: number;
}

/** Cache dashboard data per address so revisiting dashboard shows content immediately. */
let dashboardCache: { address: string; list: ContractRow[]; nameMap: Record<string, string> } | null = null;

async function fetchContracts(
  provider: NonNullable<ReturnType<typeof useWallet>["provider"]>,
  address: string,
  escrow: typeof import("@/lib/escrow-service")
): Promise<{ list: ContractRow[]; nameMap: Record<string, string> }> {
  const network = await provider.getNetwork();
  let providerToUse = provider;
  if (Number(network.chainId) !== getDefaultChainId()) {
    await switchToFhenixNetwork();
    providerToUse = getEthersProvider() ?? provider;
  }
  const contractIds = await escrow.getContractIdsForUser(providerToUse, address);
  const list: ContractRow[] = [];
  for (const id of contractIds) {
    try {
      const [client, developer, state, , balance, , , , , milestoneCount, approvedCount] = await escrow.getContract(providerToUse, id);
      list.push({
        id,
        client,
        developer,
        state: Number(state),
        balance,
        milestoneCount: Number(milestoneCount),
        approvedCount: Number(approvedCount),
      });
    } catch {
      list.push({
        id,
        client: "0x0000000000000000000000000000000000000000",
        developer: "0x0000000000000000000000000000000000000000",
        state: 0,
        balance: 0n,
        milestoneCount: 0,
        approvedCount: 0,
      });
    }
  }
  const reversed = [...list].reverse();
  const zero = "0x0000000000000000000000000000000000000000";
  const uniqueAddrs = [...new Set(reversed.flatMap((c) => [c.client, c.developer]).filter((a) => a && a !== zero).map((a) => a.toLowerCase()))];
  const names = await Promise.all(uniqueAddrs.map((addr) => escrow.getUsername(providerToUse, addr)));
  const map: Record<string, string> = {};
  uniqueAddrs.forEach((addr, i) => { map[addr] = names[i] || ""; });
  return { list: reversed, nameMap: map };
}

function NavIcon({ d, className = "w-5 h-5" }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
    </svg>
  );
}

export default function DashboardPage() {
  const { address, provider } = useWallet();
  const escrowRef = useRef<typeof import("@/lib/escrow-service") | null>(null);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [createMenuBottomOpen, setCreateMenuBottomOpen] = useState(false);
  const createMenuRef = useRef<HTMLDivElement>(null);
  const createMenuBottomRef = useRef<HTMLDivElement>(null);
  const lastLoadAtRef = useRef<number>(0);
  const FOCUS_REFETCH_MIN_MS = 30_000;

  const load = useCallback(async () => {
    if (!provider || !address) return;
    const escrow = await import("@/lib/escrow-service");
    escrowRef.current = escrow;
    try {
      const { list, nameMap: map } = await fetchContracts(provider, address, escrow);
      setContracts(list);
      setNameMap(map);
      setError(null);
      dashboardCache = { address, list, nameMap: map };
      lastLoadAtRef.current = Date.now();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load contracts");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [provider, address]);

  useEffect(() => {
    if (!provider || !address) {
      setLoading(false);
      return;
    }
    const cached =
      dashboardCache && dashboardCache.address.toLowerCase() === address.toLowerCase();
    if (cached && dashboardCache) {
      setContracts(dashboardCache.list);
      setNameMap(dashboardCache.nameMap);
      setLoading(false);
    } else {
      setLoading(true);
    }
    load();
  }, [provider, address, load]);

  useEffect(() => {
    if (!provider || !address) return;
    const onFocus = () => {
      if (Date.now() - lastLoadAtRef.current < FOCUS_REFETCH_MIN_MS) return;
      load();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [provider, address, load]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (createMenuRef.current && !createMenuRef.current.contains(e.target as Node)) setCreateMenuOpen(false);
      if (createMenuBottomRef.current && !createMenuBottomRef.current.contains(e.target as Node)) setCreateMenuBottomOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const handleRefresh = () => {
    if (!provider || !address) return;
    setRefreshing(true);
    setError(null);
    load();
  };

  const displayName = useCallback(
    (addr: string) => {
      const name = nameMap[addr?.toLowerCase() ?? ""]?.trim();
      return name ? formatUsernameForDisplay(name) : `${addr?.slice(0, 6)}...${addr?.slice(-4) ?? ""}`;
    },
    [nameMap]
  );

  const shortContractId = useCallback((id: string) => (id.startsWith("0x") ? id.slice(2, 10) : id.slice(0, 8)), []);
  const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
  const isPlaceholder = useCallback((c: ContractRow) => c.client === ZERO_ADDR, []);
  const isTerminalState = useCallback((state: number) => state === 4 || state === 5 || state === 6 || state === 7, []);

  const activeContracts = useMemo(() => contracts.filter((c) => !isTerminalState(c.state)), [contracts, isTerminalState]);
  const historyContracts = useMemo(() => contracts.filter((c) => isTerminalState(c.state)), [contracts, isTerminalState]);
  const totalInEscrow = useMemo(
    () => activeContracts.reduce((sum, c) => sum + (c.balance ?? 0n), 0n),
    [activeContracts]
  );

  if (!address) {
    return (
      <main className="pt-24 px-4 max-w-4xl mx-auto min-h-[60vh] flex items-center justify-center">
        <div className="rounded-2xl bg-[var(--bg-secondary)] border border-white/10 shadow-xl p-8 text-center max-w-md">
          <p className="text-[var(--text-secondary)]">Connect your wallet to see your contracts.</p>
          <Link href="/" className="mt-4 inline-block text-[var(--solana-green)] hover:underline font-medium">
            Back to Home
          </Link>
        </div>
      </main>
    );
  }

  if (loading) return <ContractLoader />;

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] pt-14">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-white/10 bg-[var(--bg-primary)] flex flex-col">
        <div className="p-4 border-b border-white/5">
          <Link href="/" className="flex items-center gap-2 font-bold text-[var(--text-primary)] tracking-tight">
            <Image src="/fhenix.png" alt="" width={24} height={24} className="rounded-md shrink-0" />
            <span className="bg-gradient-to-r from-[var(--solana-green)] to-[var(--solana-blue)] bg-clip-text text-transparent text-sm">
              FhenixEscrow
            </span>
          </Link>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[var(--solana-green)]/15 text-[var(--solana-green)] font-medium text-sm"
          >
            <NavIcon d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2z" />
            Dashboard
          </Link>
          <div ref={createMenuRef}>
            <button
              type="button"
              onClick={() => setCreateMenuOpen((o) => !o)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg w-full text-left text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)] font-medium text-sm transition-colors"
            >
              <NavIcon d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              Create
              <svg
                className={`w-4 h-4 ml-auto shrink-0 transition-transform duration-200 ${createMenuOpen ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div
              className="overflow-hidden transition-[max-height] duration-200 ease-out"
              style={{ maxHeight: createMenuOpen ? 96 : 0 }}
            >
              <div className="py-1 pl-4">
                <Link
                  href="/create?role=client"
                  onClick={() => setCreateMenuOpen(false)}
                  className="block px-3 py-2 rounded-lg text-sm text-[var(--text-primary)] hover:bg-white/5"
                >
                  Create client contract
                </Link>
                <Link
                  href="/create?role=developer"
                  onClick={() => setCreateMenuOpen(false)}
                  className="block px-3 py-2 rounded-lg text-sm text-[var(--text-primary)] hover:bg-white/5"
                >
                  Create developer contract
                </Link>
              </div>
            </div>
          </div>
          <Link
            href="/"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)] font-medium text-sm transition-colors"
          >
            <NavIcon d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            Home
          </Link>
        </nav>
        <div className="p-3 border-t border-white/5 flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <span className="w-2 h-2 rounded-full bg-[var(--solana-green)] shrink-0" aria-hidden />
          Connected
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 p-6 lg:p-8">
        <div className="max-w-5xl mx-auto">
          {/* Breadcrumb + Title + Actions */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1">
                Dashboard
              </p>
              <h1 className="text-2xl lg:text-3xl font-bold text-[var(--text-primary)] tracking-tight">
                Your contracts
              </h1>
            </div>
            <AnimatedButton variant="ghost" onClick={handleRefresh} disabled={refreshing || loading} className="shrink-0">
              {refreshing || loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden />
                Loading
              </span>
            ) : (
              "Refresh"
            )}
            </AnimatedButton>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-[var(--helius-orange)]/10 border border-[var(--helius-orange)]/30 text-[var(--helius-orange)] text-sm flex items-center gap-3">
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {error}
            </div>
          )}

          {/* Stats cards */}
          {contracts.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <div className="rounded-xl bg-[var(--bg-secondary)] border border-white/10 p-5 shadow-lg">
                <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                  Total contracts
                </p>
                <p className="text-2xl font-bold text-[var(--text-primary)]">{contracts.length}</p>
              </div>
              <div className="rounded-xl bg-[var(--bg-secondary)] border border-white/10 p-5 shadow-lg">
                <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                  Active
                </p>
                <p className="text-2xl font-bold text-[var(--solana-green)]">{activeContracts.length}</p>
              </div>
              <div className="rounded-xl bg-[var(--bg-secondary)] border border-white/10 p-5 shadow-lg">
                <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                  In escrow
                </p>
                <p className="text-2xl font-bold text-[var(--text-primary)]">
                  {formatEther(totalInEscrow)} <span className="text-sm font-medium text-[var(--text-muted)]">ETH</span>
                </p>
              </div>
            </div>
          )}

          {/* Contract list */}
          {contracts.length === 0 ? (
            <div className="rounded-2xl bg-[var(--bg-secondary)] border border-white/10 shadow-xl p-12 text-center">
              <p className="text-[var(--text-secondary)] mb-4">No contracts yet.</p>
              <div className="relative flex justify-center" ref={createMenuBottomRef}>
                <AnimatedButton
                  onClick={() => setCreateMenuBottomOpen((o) => !o)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl"
                >
                  + Create
                </AnimatedButton>
                {createMenuBottomOpen && (
                  <div className="absolute left-1/2 top-full -translate-x-1/2 mt-1 min-w-[200px] py-1 rounded-lg bg-[var(--bg-secondary)] border border-white/10 shadow-xl z-50">
                    <Link
                      href="/create?role=client"
                      onClick={() => setCreateMenuBottomOpen(false)}
                      className="block px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-white/5 rounded-t-lg"
                    >
                      Create client contract
                    </Link>
                    <Link
                      href="/create?role=developer"
                      onClick={() => setCreateMenuBottomOpen(false)}
                      className="block px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-white/5 rounded-b-lg"
                    >
                      Create developer contract
                    </Link>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              {activeContracts.length > 0 && (
                <section className="mb-8">
                  <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-4">
                    Active
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {activeContracts.map((c) => (
                      <ContractCard
                        key={c.id}
                        c={c}
                        displayName={displayName}
                        shortContractId={shortContractId}
                        isPlaceholder={isPlaceholder}
                        isTerminalState={isTerminalState}
                      />
                    ))}
                  </div>
                </section>
              )}
              {historyContracts.length > 0 && (
                <section>
                  <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-4">
                    History
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {historyContracts.map((c) => (
                      <ContractCard
                        key={c.id}
                        c={c}
                        displayName={displayName}
                        shortContractId={shortContractId}
                        isPlaceholder={isPlaceholder}
                        isTerminalState={isTerminalState}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

const ContractCard = React.memo(function ContractCard({
  c,
  displayName,
  shortContractId,
  isPlaceholder,
  isTerminalState,
}: {
  c: ContractRow;
  displayName: (addr: string) => string;
  shortContractId: (id: string) => string;
  isPlaceholder: (c: ContractRow) => boolean;
  isTerminalState: (state: number) => boolean;
}) {
  const stateKey = CONTRACT_STATES[c.state] ?? "DRAFT";
  return (
    <Link
      href={`/contract/${c.id}`}
      className="group block rounded-xl bg-[var(--bg-secondary)] border border-white/10 hover:border-[var(--solana-green)]/30 shadow-lg hover:shadow-[var(--solana-green)]/5 transition-all duration-200 p-5"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <span className="font-mono font-semibold text-[var(--solana-green)] text-sm" title={c.id}>
          #{shortContractId(c.id)}
        </span>
        <StatusBadge status={stateKey} />
      </div>
      <p className="text-sm text-[var(--text-secondary)] mb-3 line-clamp-2">
        {isPlaceholder(c)
          ? "Details unavailable (click to open)"
          : `${displayName(c.client)} · ${displayName(c.developer)}`}
      </p>
      {!isPlaceholder(c) && !isTerminalState(c.state) && (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)] mb-2">
            <span>{formatEther(c.balance ?? 0n)} ETH in escrow</span>
            <span>
              {Number(c.approvedCount) || 0} / {Number(c.milestoneCount) || 0} milestones
            </span>
          </div>
          {Number(c.milestoneCount) > 0 && (
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--solana-green)] transition-all duration-300"
                style={{ width: `${(100 * (Number(c.approvedCount) || 0)) / Number(c.milestoneCount)}%` }}
              />
            </div>
          )}
        </>
      )}
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--solana-green)] group-hover:gap-2 transition-all">
        View contract
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </span>
    </Link>
  );
});
