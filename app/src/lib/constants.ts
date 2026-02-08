/**
 * This app runs on Arbitrum Sepolia (arb-sepolia) only.
 * On Netlify, config is loaded from /api/config (server-only env). Locally, use NEXT_PUBLIC_* or the API.
 */

/** Arbitrum Sepolia — chain ID 421614. */
export const ARBITRUM_SEPOLIA_CHAIN_ID = 421614;
export const ARBITRUM_SEPOLIA_RPC = "https://sepolia-rollup.arbitrum.io/rpc";

export type AppConfig = {
  escrowContractAddress: string;
  disputeResolverAddress: string;
  chainId: number;
  chainName: string;
  rpcUrl: string;
  rpcUrls: string[];
  fhenixEnv: string;
};

let runtimeConfig: AppConfig | null = null;

/** Set by ConfigLoader after fetching /api/config. Keeps env vars out of client bundle on Netlify. */
export function setRuntimeConfig(config: AppConfig) {
  runtimeConfig = config;
}

function fromEnv(): Partial<AppConfig> {
  const chainIdStr = process.env.NEXT_PUBLIC_CHAIN_ID;
  const chainId = chainIdStr ? parseInt(chainIdStr, 10) : ARBITRUM_SEPOLIA_CHAIN_ID;
  const rpcUrl = (process.env.NEXT_PUBLIC_RPC_URL as string)?.trim() || ARBITRUM_SEPOLIA_RPC;
  const rpcUrlsEnv = (process.env.NEXT_PUBLIC_RPC_URLS as string)?.trim() || "";
  const rpcUrls = rpcUrlsEnv ? rpcUrlsEnv.split(",").map((u) => u.trim()).filter(Boolean) : [rpcUrl];
  return {
    escrowContractAddress: (process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS as string) || "",
    disputeResolverAddress: (process.env.NEXT_PUBLIC_DISPUTE_RESOLVER_ADDRESS as string) || "",
    chainId,
    chainName: "Arbitrum Sepolia",
    rpcUrl,
    rpcUrls,
    fhenixEnv: (process.env.NEXT_PUBLIC_FHENIX_ENV as string) || "TESTNET",
  };
}

const envFallback = typeof window !== "undefined" ? fromEnv() : null;

export function getEscrowContractAddress(): string {
  return runtimeConfig?.escrowContractAddress ?? envFallback?.escrowContractAddress ?? "";
}

export function getDisputeResolverAddress(): string {
  return runtimeConfig?.disputeResolverAddress ?? envFallback?.disputeResolverAddress ?? "";
}

export function getDefaultChainId(): number {
  return runtimeConfig?.chainId ?? envFallback?.chainId ?? ARBITRUM_SEPOLIA_CHAIN_ID;
}

export function getRpcUrls(): string[] {
  if (runtimeConfig?.rpcUrls?.length) return runtimeConfig.rpcUrls;
  if (envFallback?.rpcUrls?.length) return envFallback.rpcUrls;
  return [ARBITRUM_SEPOLIA_RPC];
}

export function getChainConfig(): {
  chainId: number;
  chainName: string;
  rpcUrl: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
} {
  const chainId = runtimeConfig?.chainId ?? envFallback?.chainId ?? ARBITRUM_SEPOLIA_CHAIN_ID;
  const rpcUrl = runtimeConfig?.rpcUrl ?? envFallback?.rpcUrl ?? ARBITRUM_SEPOLIA_RPC;
  return {
    chainId,
    chainName: "Arbitrum Sepolia",
    rpcUrl,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  };
}

export function getFhenixEnv(): string {
  return runtimeConfig?.fhenixEnv ?? envFallback?.fhenixEnv ?? "TESTNET";
}

