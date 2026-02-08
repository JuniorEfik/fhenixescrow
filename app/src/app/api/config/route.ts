import { NextResponse } from "next/server";

/**
 * Server-only config: env vars are set in Netlify (or .env) without NEXT_PUBLIC_
 * so they are never exposed in the client bundle.
 */
export async function GET() {
  const chainId = process.env.CHAIN_ID
    ? parseInt(process.env.CHAIN_ID, 10)
    : 421614;
  const rpcUrl =
    process.env.RPC_URL?.trim() || "https://sepolia-rollup.arbitrum.io/rpc";
  const rpcUrlsEnv = process.env.RPC_URLS?.trim() || "";
  const rpcUrls = rpcUrlsEnv
    ? rpcUrlsEnv.split(",").map((u) => u.trim()).filter(Boolean)
    : [rpcUrl];

  return NextResponse.json({
    escrowContractAddress: process.env.ESCROW_CONTRACT_ADDRESS ?? "",
    disputeResolverAddress: process.env.DISPUTE_RESOLVER_ADDRESS ?? "",
    chainId,
    chainName: "Arbitrum Sepolia",
    rpcUrl,
    rpcUrls,
    fhenixEnv: process.env.FHENIX_ENV ?? "TESTNET",
  });
}
