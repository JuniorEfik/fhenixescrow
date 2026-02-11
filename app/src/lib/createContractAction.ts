"use client";

import type { BrowserProvider } from "ethers";

/**
 * Loads escrow-service (and CoFHE) only when the user submits the create form.
 * Keeps the /create route compile fast and the page rendering.
 */
export async function runCreateContract(
  provider: BrowserProvider,
  clientAddress: string,
  developerAddress: string,
  totalAmountWei: bigint,
  onProgress?: (message: string) => void
) {
  const { createContract } = await import("./escrow-service");
  return createContract(provider, clientAddress, developerAddress, totalAmountWei, onProgress);
}
