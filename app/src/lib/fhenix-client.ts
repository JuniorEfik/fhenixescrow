"use client";

import type { EthersProvider } from "./ethers-provider";

/**
 * Fhenix SDK (fhenixjs) - loaded at runtime from UMD to avoid Next.js WASM/wbg bundling.
 * Encrypt inputs for FHE contracts. No simulation.
 */

declare global {
  interface Window {
    fhenixjs?: {
      FhenixClient: new (opts: { provider: EthersProvider }) => FhenixClientLike;
    };
  }
}

export interface FhenixClientLike {
  encryptUint32?(value: number): Promise<InEuintLike>;
  encryptUint128?(value: bigint): Promise<InEuintLike>;
  encryptUint256?(value: bigint): Promise<InEuintLike>;
  encrypt?(value: number | bigint, type: number): Promise<InEuintLike>;
}

export interface InEuintLike {
  ctHash: bigint;
  securityZone: number;
  utype: number;
  signature: string;
}

const SCRIPT_URL = "/fhenix.umd.min.js";
let scriptLoaded: Promise<void> | null = null;

function loadFhenixScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Not in browser"));
  if (window.fhenixjs?.FhenixClient) return Promise.resolve();
  if (scriptLoaded) return scriptLoaded;
  scriptLoaded = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_URL;
    s.async = true;
    s.onload = () => {
      if (window.fhenixjs?.FhenixClient) resolve();
      else reject(new Error("Fhenix SDK did not attach to window.fhenixjs"));
    };
    s.onerror = () => reject(new Error("Failed to load Fhenix SDK script"));
    document.head.appendChild(s);
  });
  return scriptLoaded;
}

let clientInstance: FhenixClientLike | null = null;

export async function getFhenixClient(provider: EthersProvider): Promise<FhenixClientLike> {
  await loadFhenixScript();
  const FhenixClient = window.fhenixjs!.FhenixClient;
  if (!clientInstance) clientInstance = new FhenixClient({ provider });
  return clientInstance;
}

export function clearFhenixClient(): void {
  clientInstance = null;
}

export async function encryptUint32(
  client: FhenixClientLike,
  value: number
): Promise<InEuintLike> {
  const encrypted = await client.encryptUint32?.(value);
  if (encrypted) return encrypted;
  const enc = await client.encrypt?.(value, 3);
  if (!enc) throw new Error("FhenixClient.encryptUint32/encrypt not available");
  return enc;
}

export async function encryptUint128(
  client: FhenixClientLike,
  value: bigint
): Promise<InEuintLike> {
  const enc = await client.encryptUint128?.(value);
  if (enc) return enc;
  const enc256 = await client.encryptUint256?.(value);
  if (enc256) return enc256;
  throw new Error("FhenixClient.encryptUint128 not available");
}
