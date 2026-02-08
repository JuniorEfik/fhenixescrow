"use client";

import { BrowserProvider, FallbackProvider, JsonRpcProvider } from "ethers";
import { getDefaultChainId, getChainConfig, getRpcUrls } from "./constants";

export type EthersProvider = BrowserProvider;

export function getEthersProvider(): EthersProvider | null {
  if (typeof window === "undefined" || !window.ethereum) return null;
  return new BrowserProvider(window.ethereum);
}

let readOnlyProviderInstance: FallbackProvider | null = null;

/**
 * Provider that uses multiple RPC URLs with fallback on 429/errors. Use for read-only and event
 * subscriptions to avoid rate limits. Returns null if no RPC URLs are configured (e.g. not Arbitrum Sepolia).
 */
export function getReadOnlyProvider(): FallbackProvider | null {
  if (typeof window === "undefined") return null;
  const urls = getRpcUrls();
  if (urls.length === 0) return null;
  if (readOnlyProviderInstance) return readOnlyProviderInstance;
  const config = getChainConfig();
  const network = { chainId: config.chainId, name: config.chainName };
  const last = urls.length > 1 ? urls[urls.length - 1] : null;
  const rest = last ? urls.slice(0, -1) : urls;
  const shuffled = [...rest].sort(() => Math.random() - 0.5);
  const ordered = last ? [...shuffled, last] : shuffled;
  const providers = ordered.map((url) => new JsonRpcProvider(url, network));
  readOnlyProviderInstance = new FallbackProvider(providers.map((p) => ({ provider: p })), network, { quorum: 1 });
  return readOnlyProviderInstance;
}

/** Switch wallet to the app's chain (Arbitrum Sepolia). */
export async function switchToFhenixNetwork(): Promise<void> {
  const provider = getEthersProvider();
  if (!provider) throw new Error("No wallet");
  const config = getChainConfig();
  try {
    await window.ethereum!.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: `0x${config.chainId.toString(16)}` }],
    });
  } catch (e: unknown) {
    const err = e as { code?: number };
    if (err.code === 4902) {
      await window.ethereum!.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: `0x${config.chainId.toString(16)}`,
            chainName: config.chainName,
            nativeCurrency: config.nativeCurrency,
            rpcUrls: [config.rpcUrl],
          },
        ],
      });
    } else {
      throw e;
    }
  }
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, cb: (args?: unknown) => void) => void;
      removeListener?: (event: string, cb: (args?: unknown) => void) => void;
    };
  }
}
