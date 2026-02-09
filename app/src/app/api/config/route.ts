import { NextResponse } from "next/server";

/**
 * Server-only config: on Netlify use ESCROW_CONTRACT_ADDRESS etc. (no NEXT_PUBLIC_).
 * Locally we fall back to NEXT_PUBLIC_* so .env with NEXT_PUBLIC_* works without duplicate vars.
 */
export async function GET() {
  const chainIdStr = process.env.CHAIN_ID ?? process.env.NEXT_PUBLIC_CHAIN_ID;
  const chainId = chainIdStr ? parseInt(String(chainIdStr), 10) : 421614;
  const rpcUrl =
    process.env.RPC_URL?.trim() ||
    (process.env.NEXT_PUBLIC_RPC_URL as string)?.trim() ||
    "https://sepolia-rollup.arbitrum.io/rpc";
  const rpcUrlsEnv =
    process.env.RPC_URLS?.trim() || (process.env.NEXT_PUBLIC_RPC_URLS as string)?.trim() || "";
  const rpcUrls = rpcUrlsEnv
    ? rpcUrlsEnv.split(",").map((u) => u.trim()).filter(Boolean)
    : [rpcUrl];

  return NextResponse.json({
    escrowContractAddress:
      process.env.ESCROW_CONTRACT_ADDRESS ?? (process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS as string) ?? "",
    disputeResolverAddress:
      process.env.DISPUTE_RESOLVER_ADDRESS ?? (process.env.NEXT_PUBLIC_DISPUTE_RESOLVER_ADDRESS as string) ?? "",
    chainId,
    chainName: "Arbitrum Sepolia",
    rpcUrl,
    rpcUrls,
    fhenixEnv: process.env.FHENIX_ENV ?? (process.env.NEXT_PUBLIC_FHENIX_ENV as string) ?? "TESTNET",
  });
}
