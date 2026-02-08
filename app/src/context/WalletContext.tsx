"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getEthersProvider, switchToFhenixNetwork } from "@/lib/ethers-provider";
import { CONTRACT_STATES, type ContractStateKey } from "@/lib/contracts";
import { getDefaultChainId } from "@/lib/constants";

const NO_WALLET_MESSAGE = "No Web3 wallet detected. Install MetaMask or connect another wallet to continue.";

type WalletContextValue = {
  address: string | null;
  chainId: number | null;
  isConnecting: boolean;
  /** Shown when user clicks Connect but no wallet is available (no alert). */
  walletMessage: string | null;
  clearWalletMessage: () => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
  provider: ReturnType<typeof getEthersProvider>;
  hasWallet: boolean;
  isWrongNetwork: boolean;
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [provider, setProvider] = useState<ReturnType<typeof getEthersProvider>>(null);
  const [walletMessage, setWalletMessage] = useState<string | null>(null);
  const [hasWallet, setHasWallet] = useState(false);

  const connect = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!window.ethereum) {
      setWalletMessage(NO_WALLET_MESSAGE);
      return;
    }
    setWalletMessage(null);
    setIsConnecting(true);
    try {
      const accounts = (await window.ethereum.request!({ method: "eth_requestAccounts" })) as string[];
      setAddress(accounts[0] ?? null);
      const p = getEthersProvider();
      setProvider(p);
      if (p) {
        const network = await p.getNetwork();
        setChainId(Number(network.chainId));
      } else {
        setChainId(null);
      }
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setProvider(null);
    setChainId(null);
  }, []);

  const switchNetwork = useCallback(async () => {
    await switchToFhenixNetwork();
    const p = getEthersProvider();
    setProvider(p);
    if (p) {
      const network = await p.getNetwork();
      setChainId(Number(network.chainId));
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setHasWallet(!!window.ethereum);
    if (!window.ethereum) return;
    window.ethereum.request({ method: "eth_accounts" }).then(async (accounts: unknown) => {
      const list = accounts as string[];
      if (list?.length) {
        setAddress(list[0]);
        const p = getEthersProvider();
        setProvider(p);
        if (p) {
          try {
            const network = await p.getNetwork();
            setChainId(Number(network.chainId));
          } catch {
            setChainId(null);
          }
        }
      }
    });
    const onAccountsChanged = (accounts: unknown) => {
      const list = accounts as string[];
      setAddress(list?.[0] ?? null);
      if (!list?.length) {
        setProvider(null);
        setChainId(null);
      } else {
        const p = getEthersProvider();
        setProvider(p);
        if (p) p.getNetwork().then((n) => setChainId(Number(n.chainId))).catch(() => setChainId(null));
      }
    };
    const onChainChanged = () => {
      const p = getEthersProvider();
      setProvider(p);
      if (p) p.getNetwork().then((n) => setChainId(Number(n.chainId))).catch(() => setChainId(null));
    };
    window.ethereum?.on?.("accountsChanged", onAccountsChanged);
    window.ethereum?.on?.("chainChanged", onChainChanged);
    return () => {
      window.ethereum?.removeListener?.("accountsChanged", onAccountsChanged);
      window.ethereum?.removeListener?.("chainChanged", onChainChanged);
    };
  }, []);

  const isWrongNetwork = chainId != null && address != null && chainId !== getDefaultChainId();

  return (
    <WalletContext.Provider
      value={{
        address,
        chainId,
        isConnecting,
        walletMessage,
        clearWalletMessage: () => setWalletMessage(null),
        connect,
        disconnect,
        switchNetwork,
        provider,
        hasWallet,
        isWrongNetwork,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}

/** Single source of truth: use CONTRACT_STATES from contracts. */
export function stateLabel(state: number): ContractStateKey {
  return CONTRACT_STATES[state] ?? "DRAFT";
}
