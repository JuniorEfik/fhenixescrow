"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { useWallet } from "@/context/WalletContext";
import GlassCard from "@/components/GlassCard";
import AnimatedButton from "@/components/AnimatedButton";
import Modal from "@/components/Modal";
import Link from "next/link";
import { getDefaultChainId } from "@/lib/constants";
import { getEthersProvider, switchToFhenixNetwork } from "@/lib/ethers-provider";
import { getErrorMessage } from "@/lib/error-utils";

export default function AcceptInvitePage() {
  const params = useParams();
  const router = useRouter();
  const inviteId = typeof params.inviteId === "string" ? params.inviteId : "";
  const { address, provider } = useWallet();
  const escrowRef = useRef<typeof import("@/lib/escrow-service") | null>(null);
  const [invite, setInvite] = useState<{ creator: string; isClientSide: boolean; acceptedBy: string; contractId: string } | null>(null);
  const [contractData, setContractData] = useState<{ clientSigned: boolean; developerSigned: boolean; state: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSamePartyPopup, setShowSamePartyPopup] = useState(false);

  useEffect(() => {
    if (!inviteId || !provider) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const network = await provider.getNetwork();
        let providerToUse = provider;
        if (Number(network.chainId) !== getDefaultChainId()) {
          await switchToFhenixNetwork();
          providerToUse = getEthersProvider() ?? provider;
        }
        const escrow = await import("@/lib/escrow-service");
        escrowRef.current = escrow;
        const data = await escrow.getInvite(providerToUse, inviteId);
        setInvite(data);
        if (data?.contractId) {
          const res = await escrow.getContract(providerToUse, data.contractId);
          setContractData({
            clientSigned: Boolean(res[6]),
            developerSigned: Boolean(res[7]),
            state: Number(res[2]),
          });
        }
      } catch {
        setInvite(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [inviteId, provider]);

  const handleAccept = async () => {
    const escrow = escrowRef.current;
    if (!provider || !escrow || !address || !invite) return;
    if (invite.creator.toLowerCase() === address.toLowerCase()) {
      setShowSamePartyPopup(true);
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      const { contractId } = await escrow.acceptInvite(provider, inviteId);
      router.push(`/contract/${contractId}`);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setActionLoading(false);
    }
  };

  const handleBailOut = async () => {
    const escrow = escrowRef.current;
    if (!provider || !escrow) return;
    setActionLoading(true);
    setError(null);
    try {
      await escrow.bailOutInvite(provider, inviteId);
      router.refresh();
      const data = await escrow.getInvite(provider, inviteId);
      setInvite(data);
      setContractData(null);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setActionLoading(false);
    }
  };

  if (!inviteId) {
    return (
      <main className="pt-24 px-4 max-w-lg mx-auto">
        <GlassCard className="p-8 text-center">
          <p className="text-[var(--text-secondary)]">Invalid invite link.</p>
          <Link href="/create" className="mt-4 inline-block text-[var(--solana-green)]">Create contract</Link>
        </GlassCard>
      </main>
    );
  }

  if (!address) {
    return (
      <main className="pt-24 px-4 max-w-lg mx-auto">
        <GlassCard className="p-8 text-center">
          <p className="text-[var(--text-secondary)]">Connect your wallet to accept this invite.</p>
          <Link href="/" className="mt-4 inline-block text-[var(--solana-green)]">Home</Link>
        </GlassCard>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="pt-24 px-4 max-w-lg mx-auto">
        <GlassCard className="p-8 text-center">
          <p className="text-[var(--text-muted)]">Loading invite…</p>
        </GlassCard>
      </main>
    );
  }

  if (!invite) {
    return (
      <main className="pt-24 px-4 max-w-lg mx-auto">
        <GlassCard className="p-8 text-center">
          <p className="text-[var(--text-secondary)]">Invite not found or invalid.</p>
          <Link href="/create" className="mt-4 inline-block text-[var(--solana-green)]">Create contract</Link>
        </GlassCard>
      </main>
    );
  }

  const isAccepted = !!invite.acceptedBy;
  const iAmAccepter = invite.acceptedBy?.toLowerCase() === address?.toLowerCase();
  const bothSigned = contractData?.clientSigned && contractData?.developerSigned;
  const canBail = isAccepted && iAmAccepter && invite.contractId && !bothSigned;

  return (
    <main className="pt-24 px-4 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6">Accept invite</h1>
      <GlassCard className="p-6">
        <p className="text-sm text-[var(--text-muted)] mb-4">
          {invite.isClientSide
            ? "Creator is the client; accepting makes you the developer."
            : "Creator is the developer; accepting makes you the client."}
        </p>
        <p className="text-sm">
          <span className="text-[var(--text-muted)]">Creator:</span>{" "}
          <span className="font-mono">{invite.creator.slice(0, 10)}...{invite.creator.slice(-8)}</span>
        </p>
        {isAccepted && (
          <p className="text-sm mt-2">
            <span className="text-[var(--text-muted)]">Accepted by:</span>{" "}
            <span className="font-mono">{invite.acceptedBy.slice(0, 10)}...{invite.acceptedBy.slice(-8)}</span>
          </p>
        )}
        {error && <p className="mt-3 text-red-400 text-sm">{error}</p>}
        <div className="mt-6 flex flex-col gap-2">
          {!isAccepted && (
            <AnimatedButton onClick={handleAccept} disabled={actionLoading} className="w-full">
              {actionLoading ? "Accepting…" : "Accept invite"}
            </AnimatedButton>
          )}
          {invite.contractId && (
            <Link href={`/contract/${invite.contractId}`} className="text-center text-[var(--solana-green)] hover:underline text-sm">
              Open contract →
            </Link>
          )}
          {canBail && (
            <AnimatedButton variant="secondary" onClick={handleBailOut} disabled={actionLoading} className="w-full mt-2">
              {actionLoading ? "Bailing…" : "Bail out (free this link for someone else)"}
            </AnimatedButton>
          )}
        </div>
        <Link href="/dashboard" className="block mt-4 text-center text-sm text-[var(--text-muted)] hover:text-white">
          Dashboard
        </Link>
      </GlassCard>

      {showSamePartyPopup && (
        <Modal title="Cannot accept invite" onClose={() => setShowSamePartyPopup(false)}>
          <p className="text-sm text-[var(--text-muted)] mb-4">
            You cannot accept your own invite. Client and developer must be different addresses.
          </p>
          <AnimatedButton onClick={() => setShowSamePartyPopup(false)} className="w-full">
            OK
          </AnimatedButton>
        </Modal>
      )}
    </main>
  );
}
