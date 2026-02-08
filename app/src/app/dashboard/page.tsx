"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@/context/WalletContext";
import GlassCard from "@/components/GlassCard";
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
      // Still show the contract so user can open it (e.g. wrong chain/RPC or view reverted)
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

export default function DashboardPage() {
  const pathname = usePathname();
  const { address, provider } = useWallet();
  const escrowRef = useRef<typeof import("@/lib/escrow-service") | null>(null);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!provider || !address) return;
    const escrow = await import("@/lib/escrow-service");
    escrowRef.current = escrow;
    try {
      const { list, nameMap: map } = await fetchContracts(provider, address, escrow);
      setContracts(list);
      setNameMap(map);
      setError(null);
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
    setLoading(true);
    load();
  }, [provider, address, pathname, load]);

  useEffect(() => {
    if (!provider || !address) return;
    const onFocus = () => {
      setRefreshing(true);
      load();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [provider, address, load]);

  const handleRefresh = () => {
    if (!provider || !address) return;
    setRefreshing(true);
    setError(null);
    load();
  };

  if (!address) {
    return (
      <main className="pt-24 px-4 max-w-4xl mx-auto">
        <GlassCard className="p-8 text-center">
          <p className="text-[var(--text-secondary)]">Connect your wallet to see your contracts.</p>
          <Link href="/" className="mt-4 inline-block text-[var(--solana-green)]">Back to Home</Link>
        </GlassCard>
      </main>
    );
  }

  const displayName = (addr: string) => {
    const name = nameMap[addr?.toLowerCase() ?? ""]?.trim();
    return name ? formatUsernameForDisplay(name) : `${addr?.slice(0, 6)}...${addr?.slice(-4) ?? ""}`;
  };

  const shortContractId = (id: string) => (id.startsWith("0x") ? id.slice(2, 10) : id.slice(0, 8));
  const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
  const isPlaceholder = (c: ContractRow) => c.client === ZERO_ADDR;

  const isTerminalState = (state: number) => state === 4 || state === 5 || state === 6 || state === 7;
  const activeContracts = contracts.filter((c) => !isTerminalState(c.state));
  const historyContracts = contracts.filter((c) => isTerminalState(c.state));

  const ContractLink = ({ c }: { c: ContractRow }) => {
    const stateKey = CONTRACT_STATES[c.state] ?? "DRAFT";
    return (
      <li>
        <Link
          href={`/contract/${c.id}`}
          className="flex flex-wrap items-center gap-3 p-4 rounded-xl bg-[var(--bg-tertiary)]/50 border border-white/5 hover:border-[var(--solana-green)]/30 transition-colors"
        >
          <span className="font-mono font-semibold text-[var(--solana-green)]" title={c.id}>#{shortContractId(c.id)}</span>
          <StatusBadge status={stateKey} />
          <span className="text-sm text-[var(--text-muted)]">
            {isPlaceholder(c) ? "Details unavailable (click to open)" : `${displayName(c.client)} · ${displayName(c.developer)}`}
          </span>
          {!isPlaceholder(c) && !isTerminalState(c.state) && (
            <span className="text-sm text-[var(--text-muted)]">
              {formatEther(c.balance ?? 0n)} ETH in escrow · {Number(c.approvedCount) || 0} of {Number(c.milestoneCount) || 0} milestones approved
            </span>
          )}
          <span className="text-xs text-[var(--text-muted)] ml-auto">View →</span>
        </Link>
      </li>
    );
  };

  if (loading) return <ContractLoader />;

  return (
    <main className="pt-24 px-4 max-w-4xl mx-auto pb-12">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <AnimatedButton variant="ghost" onClick={handleRefresh} disabled={refreshing || loading}>
          {refreshing || loading ? "Loading…" : "Refresh"}
        </AnimatedButton>
      </div>
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">{error}</div>
      )}
      <GlassCard className="p-6">
        {contracts.length === 0 ? (
          <p className="text-[var(--text-secondary)] py-8 text-center">
            No contracts yet. <Link href="/create?role=client" className="text-[var(--solana-green)] hover:underline">Create one</Link>.
          </p>
        ) : (
          <>
            {activeContracts.length > 0 && (
              <section className="mb-6">
                <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Active</h2>
                <ul className="space-y-3">
                  {activeContracts.map((c) => <ContractLink key={c.id} c={c} />)}
                </ul>
              </section>
            )}
            {historyContracts.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">History</h2>
                <ul className="space-y-3">
                  {historyContracts.map((c) => <ContractLink key={c.id} c={c} />)}
                </ul>
              </section>
            )}
          </>
        )}
        <div className="mt-6 pt-4 border-t border-white/10">
          <Link href="/create?role=client" className="text-sm text-[var(--solana-green)] hover:underline">
            + Create client contract
          </Link>
          <span className="text-[var(--text-muted)] mx-2">·</span>
          <Link href="/create?role=developer" className="text-sm text-[var(--solana-green)] hover:underline">
            Create developer contract
          </Link>
        </div>
      </GlassCard>
    </main>
  );
}
