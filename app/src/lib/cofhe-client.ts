"use client";

import type { BrowserProvider } from "ethers";
import { getDefaultChainId, getFhenixEnv } from "./constants";
import { getEthersProvider, switchToFhenixNetwork } from "./ethers-provider";

/**
 * CoFHE client for the frontend. Loaded only when createContract/addMilestone run (dynamic import
 * in escrow-service) so the app renders without waiting on cofhejs.
 *
 * Contract side: fhenix.md (cofhe-contracts, InEuint32/InEuint128, FHE.allow*, etc.)
 * Client side: cofhejs (see node_modules/cofhejs/README.md) — use "cofhejs/web", initializeWithEthers
 * with provider/signer/environment, then encrypt([Encryptable.uint128(value)] etc.).
 *
 * Returns the shape expected by InEuint128 / InEuint32 in Solidity (ctHash, securityZone, utype, signature).
 */
export interface InEuintLike {
  ctHash: bigint;
  securityZone: number;
  utype: number;
  signature: string;
}

let cofheInitialized = false;

async function ensureCofheInitialized(provider: BrowserProvider): Promise<void> {
  if (cofheInitialized) return;

  // Wrong chain causes acl() to return 0x. Switch, then use a fresh provider to avoid NETWORK_ERROR.
  const network = await provider.getNetwork();
  let providerToUse = provider;
  if (Number(network.chainId) !== getDefaultChainId()) {
    await switchToFhenixNetwork();
    cofheInitialized = false;
    providerToUse = getEthersProvider() ?? provider;
  }

  const { cofhejs } = await import("cofhejs/web");
  const signer = await providerToUse.getSigner();
  const env = getFhenixEnv();
  const result = await cofhejs.initializeWithEthers({
    ethersProvider: providerToUse,
    ethersSigner: signer,
    environment: env as "LOCAL" | "TESTNET" | "MAINNET",
  });
  if (result.success === false) {
    const err = (result as { success: false; error?: unknown }).error;
    const errObj = err as { message?: string; cause?: Error } | undefined;
    const causeMsg = errObj?.cause instanceof Error ? errObj.cause.message : undefined;
    const msg = causeMsg ?? errObj?.message ?? (typeof err === "string" ? err : "Failed to initialize CoFHE. Switch to Arbitrum Sepolia in your wallet.");
    throw new Error(msg);
  }
  cofheInitialized = true;
}

export async function encryptUint128Cofhe(
  provider: BrowserProvider,
  value: bigint
): Promise<InEuintLike> {
  await ensureCofheInitialized(provider);
  const { cofhejs, Encryptable } = await import("cofhejs/web");
  const result = await cofhejs.encrypt([Encryptable.uint128(value)]);
  if (!result.success || !result.data?.length) {
    const err = (result as { success?: false; error?: unknown }).error;
    const errObj = err as { message?: string; cause?: Error } | undefined;
    const causeMsg = errObj?.cause instanceof Error ? errObj.cause.message : undefined;
    const msg = causeMsg ?? errObj?.message ?? (typeof err === "string" ? err : "Encryption failed");
    throw new Error(msg);
  }
  const item = result.data[0];
  return {
    ctHash: item.ctHash,
    securityZone: item.securityZone,
    utype: Number(item.utype),
    signature: item.signature,
  };
}

export async function encryptUint32Cofhe(
  provider: BrowserProvider,
  value: number
): Promise<InEuintLike> {
  await ensureCofheInitialized(provider);
  const { cofhejs, Encryptable } = await import("cofhejs/web");
  const result = await cofhejs.encrypt([Encryptable.uint32(BigInt(value))]);
  if (!result.success || !result.data?.length) {
    const err = (result as { success?: false; error?: unknown }).error;
    const errObj = err as { message?: string; cause?: Error } | undefined;
    const causeMsg = errObj?.cause instanceof Error ? errObj.cause.message : undefined;
    const msg = causeMsg ?? errObj?.message ?? (typeof err === "string" ? err : "Encryption failed");
    throw new Error(msg);
  }
  const item = result.data[0];
  return {
    ctHash: item.ctHash,
    securityZone: item.securityZone,
    utype: Number(item.utype),
    signature: item.signature,
  };
}

export function clearCofheClient(): void {
  cofheInitialized = false;
}
