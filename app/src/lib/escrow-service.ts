"use client";

import { Contract, type BrowserProvider, type ContractRunner } from "ethers";
import { PRIVATE_ESCROW_ABI, DISPUTE_RESOLVER_ABI } from "./contracts";
import { getEscrowContractAddress, getDisputeResolverAddress } from "./constants";

/** Contract id is bytes32 (hash). Normalize to 0x + 64 hex chars for contract calls. */
export function normalizeContractId(id: string): string {
  const h = id.startsWith("0x") ? id.slice(2) : id;
  if (h.length !== 64 || !/^[0-9a-fA-F]+$/.test(h)) throw new Error("Invalid contract id (expected 64 hex chars)");
  return "0x" + h.toLowerCase();
}

/** Lenient: accept bytes32 from chain. Do NOT strip leading zeros (would change the value). Return 0x + 64 hex. */
export function normalizeContractIdLenient(id: string | unknown): string {
  const s = typeof id === "string" ? id : (typeof id === "bigint" ? "0x" + id.toString(16) : String(id));
  let h = (s.startsWith("0x") ? s.slice(2) : s).trim();
  if (!/^[0-9a-fA-F]+$/.test(h)) return s.startsWith("0x") ? s : "0x" + s;
  if (h.length < 64) h = h.padStart(64, "0");
  else if (h.length > 64) h = h.slice(-64);
  return "0x" + h.toLowerCase();
}

/**
 * Escrow service: real contract calls via ethers.js.
 * Contract ids are bytes32 hashes. CoFHE loaded only for createContract/addMilestone.
 */
export async function getEscrowContract(provider: BrowserProvider) {
  const address = getEscrowContractAddress();
  if (!address) throw new Error("ESCROW_CONTRACT_ADDRESS not set");
  const signer = await provider.getSigner();
  return new Contract(address, PRIVATE_ESCROW_ABI, signer);
}

/** Contract instance for read-only calls and event subscription (no signer). Use with FallbackProvider to avoid 429. */
export function getEscrowContractForReads(provider: ContractRunner) {
  const address = getEscrowContractAddress();
  if (!address) throw new Error("ESCROW_CONTRACT_ADDRESS not set");
  return new Contract(address, PRIVATE_ESCROW_ABI, provider);
}

export async function createContract(
  provider: BrowserProvider,
  clientAddress: string,
  developerAddress: string,
  totalAmountWei: bigint
): Promise<{ contractId: string; receipt: unknown }> {
  if (!getEscrowContractAddress()) throw new Error("ESCROW_CONTRACT_ADDRESS is not set. Deploy the contract and set it in .env or Netlify.");
  const { encryptUint128Cofhe } = await import("./cofhe-client");
  const contract = await getEscrowContract(provider);
  const encryptedTotal = await encryptUint128Cofhe(provider, totalAmountWei);
  const tx = await contract.createContract(clientAddress, developerAddress, {
    ctHash: encryptedTotal.ctHash,
    securityZone: encryptedTotal.securityZone,
    utype: encryptedTotal.utype,
    signature: encryptedTotal.signature,
  }, totalAmountWei);
  const receipt = await tx.wait();
  if (!receipt) throw new Error("No receipt");
  const topic = contract.interface.getEvent("ContractCreated")?.topicHash;
  const log = receipt.logs.find((l: { topics: string[] }) => l.topics[0] === topic);
  if (!log?.topics?.[1]) throw new Error("ContractCreated event not found");
  const contractId = log.topics[1] as string;
  return { contractId, receipt };
}

export async function getContractIdsForUser(provider: BrowserProvider, userAddress: string): Promise<string[]> {
  const contract = await getEscrowContract(provider);
  const count = Number(await contract.userContractCount(userAddress));
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = await contract.userContractIds(userAddress, i);
    ids.push(normalizeContractIdLenient(raw));
  }
  return ids;
}

export async function getAddressByUsername(provider: BrowserProvider, username: string): Promise<string | null> {
  const contract = await getEscrowContract(provider);
  const addr = await contract.getAddressByUsername(username.trim());
  if (!addr || addr === "0x0000000000000000000000000000000000000000") return null;
  return addr;
}

/** Read-only: resolve username to address (for availability checks). Use with any provider. */
export async function getAddressByUsernameReadOnly(
  provider: BrowserProvider | Parameters<typeof getEscrowContractForReads>[0],
  username: string
): Promise<string | null> {
  const contract = getEscrowContractForReads(provider);
  const addr = await contract.getAddressByUsername((username || "").trim().replace(/^@/, ""));
  if (!addr || addr === "0x0000000000000000000000000000000000000000") return null;
  return addr;
}

export async function createInvite(
  provider: BrowserProvider,
  isClientSide: boolean,
  totalAmountWei: bigint
): Promise<{ inviteId: string }> {
  if (!getEscrowContractAddress()) throw new Error("ESCROW_CONTRACT_ADDRESS not set");
  const { encryptUint128Cofhe } = await import("./cofhe-client");
  const contract = await getEscrowContract(provider);
  const encryptedTotal = await encryptUint128Cofhe(provider, totalAmountWei);
  const tx = await contract.createInvite(isClientSide, {
    ctHash: encryptedTotal.ctHash,
    securityZone: encryptedTotal.securityZone,
    utype: encryptedTotal.utype,
    signature: encryptedTotal.signature,
  }, totalAmountWei);
  const receipt = await tx.wait();
  if (!receipt) throw new Error("No receipt");
  const target = await contract.getAddress();
  const topic = contract.interface.getEvent("InviteCreated")?.topicHash;
  const log = receipt.logs.find(
    (l: { address: string; topics: string[] }) => l.address?.toLowerCase() === target?.toLowerCase() && l.topics[0] === topic
  );
  if (!log) throw new Error("InviteCreated event not found");
  let inviteId: string;
  try {
    const parsed = contract.interface.parseLog({ topics: log.topics as string[], data: log.data });
    inviteId = parsed?.args?.[0] != null ? String(parsed.args[0]) : (log.topics[1] as string);
  } catch {
    inviteId = log.topics[1] as string;
  }
  return { inviteId: normalizeContractIdLenient(inviteId) };
}

export async function acceptInvite(provider: BrowserProvider, inviteId: string): Promise<{ contractId: string }> {
  const contract = await getEscrowContract(provider);
  const id = normalizeContractIdLenient(inviteId);
  const raw = id.startsWith("0x") ? id.slice(2) : id;
  if (raw.length !== 64 || !/^[0-9a-fa-f]+$/.test(raw)) throw new Error("Invalid invite id (64 hex chars)");
  const tx = await contract.acceptInvite(id);
  const receipt = await tx.wait();
  if (!receipt) throw new Error("No receipt");
  const target = await contract.getAddress();
  const topic = contract.interface.getEvent("InviteAccepted")?.topicHash;
  const log = receipt.logs.find(
    (l: { address?: string; topics: string[] }) => l.address?.toLowerCase() === target?.toLowerCase() && l.topics[0] === topic
  );
  if (!log) throw new Error("InviteAccepted event not found");
  let contractId: string;
  try {
    const parsed = contract.interface.parseLog({ topics: log.topics as string[], data: log.data });
    contractId = parsed?.args?.[2] != null ? String(parsed.args[2]) : "";
  } catch {
    contractId = "";
  }
  if (!contractId) throw new Error("InviteAccepted event not found");
  return { contractId: normalizeContractIdLenient(contractId) };
}

export async function bailOutInvite(provider: BrowserProvider, inviteId: string) {
  const contract = await getEscrowContract(provider);
  const id = normalizeContractIdLenient(inviteId);
  const tx = await contract.bailOutInvite(id);
  await tx.wait();
}

export async function getInvite(
  provider: BrowserProvider,
  inviteId: string
): Promise<{ creator: string; isClientSide: boolean; acceptedBy: string; contractId: string } | null> {
  const contract = await getEscrowContract(provider);
  const id = normalizeContractIdLenient(inviteId);
  const creator = await contract.inviteCreator(id);
  if (!creator || creator === "0x0000000000000000000000000000000000000000") return null;
  const [isClientSide, acceptedByRaw, contractId] = await Promise.all([
    contract.inviteIsClientSide(id),
    contract.inviteAcceptedBy(id),
    contract.inviteContractId(id),
  ]);
  const cid = typeof contractId === "string" ? contractId : (contractId as unknown as string);
  const hasContract = cid !== "0x0000000000000000000000000000000000000000000000000000000000000000" && cid !== "";
  const zeroAddr = "0x0000000000000000000000000000000000000000";
  let acceptedBy = acceptedByRaw != null ? String(acceptedByRaw) : "";
  if (acceptedBy === zeroAddr) acceptedBy = "";
  if (hasContract) {
    const [client, developer] = await contract.getContract(cid);
    const accepter = isClientSide ? (developer as string) : (client as string);
    if (accepter && accepter !== zeroAddr) acceptedBy = accepter;
  }
  return {
    creator,
    isClientSide: Boolean(isClientSide),
    acceptedBy: acceptedBy || "",
    contractId: hasContract ? cid : "",
  };
}

export async function setTerms(provider: BrowserProvider, contractId: string, deadline: number) {
  const contract = await getEscrowContract(provider);
  const tx = await contract.setTerms(normalizeContractId(contractId), deadline);
  await tx.wait();
}

export async function addMilestone(
  provider: BrowserProvider,
  contractId: string,
  amountPortion: number,
  description: string
) {
  const { encryptUint32Cofhe } = await import("./cofhe-client");
  const contract = await getEscrowContract(provider);
  const encrypted = await encryptUint32Cofhe(provider, amountPortion);
  const tx = await contract.addMilestone(normalizeContractId(contractId), {
    ctHash: encrypted.ctHash,
    securityZone: encrypted.securityZone,
    utype: encrypted.utype,
    signature: encrypted.signature,
  }, description || "");
  await tx.wait();
}

export async function updateMilestone(
  provider: BrowserProvider,
  contractId: string,
  milestoneIndex: number,
  amountPortion: number,
  description: string
) {
  const { encryptUint32Cofhe } = await import("./cofhe-client");
  const contract = await getEscrowContract(provider);
  const encrypted = await encryptUint32Cofhe(provider, amountPortion);
  const tx = await contract.updateMilestone(normalizeContractId(contractId), milestoneIndex, {
    ctHash: encrypted.ctHash,
    securityZone: encrypted.securityZone,
    utype: encrypted.utype,
    signature: encrypted.signature,
  }, description || "");
  await tx.wait();
}

export async function removeLastMilestone(provider: BrowserProvider, contractId: string) {
  const contract = await getEscrowContract(provider);
  const tx = await contract.removeLastMilestone(normalizeContractId(contractId));
  await tx.wait();
}

export async function getMilestoneDescription(
  provider: BrowserProvider,
  contractId: string,
  index: number
): Promise<string> {
  const contract = await getEscrowContract(provider);
  return contract.milestoneDescriptions(normalizeContractId(contractId), index);
}

export async function getMilestoneCompletionComment(
  provider: BrowserProvider | Parameters<typeof getEscrowContractForReads>[0],
  contractId: string,
  index: number
): Promise<string> {
  const contract = getEscrowContractForReads(provider);
  const s = await contract.milestoneCompletionComments(normalizeContractIdLenient(contractId), index);
  return typeof s === "string" ? s : "";
}

export async function addDiscussionMessage(
  provider: BrowserProvider,
  contractId: string,
  message: string
) {
  const contract = await getEscrowContract(provider);
  const tx = await contract.addDiscussionMessage(normalizeContractIdLenient(contractId), message);
  await tx.wait();
}

export async function getDiscussionMessageCount(
  provider: BrowserProvider,
  contractId: string
): Promise<number> {
  const contract = await getEscrowContract(provider);
  return Number(await contract.discussionMessageCount(normalizeContractId(contractId)));
}

export async function getDiscussionMessages(
  provider: BrowserProvider | Parameters<typeof getEscrowContractForReads>[0],
  contractId: string
): Promise<{ sender: string; message: string }[]> {
  const contract = getEscrowContractForReads(provider);
  const cid = normalizeContractIdLenient(contractId);
  const count = Number(await contract.discussionMessageCount(cid));
  const out: { sender: string; message: string }[] = [];
  for (let i = 0; i < count; i++) {
    const [sender, message] = await Promise.all([
      contract.discussionSenders(cid, i),
      contract.discussionMessages(cid, i),
    ]);
    out.push({ sender, message });
  }
  return out;
}

/**
 * Subscribe to DiscussionMessage events for this contract. Calls onMessage when a new message is added (by anyone).
 * Returns an unsubscribe function.
 */
export function subscribeDiscussionMessages(
  provider: ContractRunner,
  contractId: string,
  onMessage: () => void
): () => void {
  const cid = normalizeContractIdLenient(contractId);
  const contractRef: { current: Contract | null } = { current: null };
  let cancelled = false;
  const handler = (eventContractId: unknown) => {
    if (normalizeContractIdLenient(eventContractId) !== cid) return;
    onMessage();
  };
  const contract = getEscrowContractForReads(provider);
  contractRef.current = contract;
  contract.on("DiscussionMessage", handler);
  return () => {
    cancelled = true;
    contract.off("DiscussionMessage", handler);
  };
}

export async function signContract(provider: BrowserProvider, contractId: string) {
  const contract = await getEscrowContract(provider);
  const tx = await contract.signContract(normalizeContractId(contractId));
  await tx.wait();
}

export async function fundEscrow(provider: BrowserProvider, contractId: string, valueWei: bigint) {
  const contract = await getEscrowContract(provider);
  const tx = await contract.fundEscrow(normalizeContractId(contractId), { value: valueWei });
  await tx.wait();
}

export async function submitMilestone(provider: BrowserProvider, contractId: string, milestoneIndex: number, comment = "") {
  const contract = await getEscrowContract(provider);
  const tx = await contract.submitMilestone(normalizeContractId(contractId), milestoneIndex, comment);
  await tx.wait();
}

export async function approveMilestone(provider: BrowserProvider, contractId: string, milestoneIndex: number) {
  const contract = await getEscrowContract(provider);
  const tx = await contract.approveMilestone(normalizeContractId(contractId), milestoneIndex);
  await tx.wait();
}

export async function rejectMilestone(provider: BrowserProvider, contractId: string, milestoneIndex: number) {
  const contract = await getEscrowContract(provider);
  const tx = await contract.rejectMilestone(normalizeContractId(contractId), milestoneIndex);
  await tx.wait();
}

export async function claimPayout(provider: BrowserProvider, contractId: string) {
  const contract = await getEscrowContract(provider);
  const tx = await contract.claimPayout(normalizeContractId(contractId));
  await tx.wait();
}

export async function raiseDispute(provider: BrowserProvider, contractId: string) {
  const contract = await getEscrowContract(provider);
  const tx = await contract.raiseDispute(normalizeContractId(contractId));
  await tx.wait();
}

export async function resolveDispute(provider: BrowserProvider, contractId: string, clientWins: boolean) {
  const contract = await getEscrowContract(provider);
  const tx = await contract.resolveDispute(normalizeContractId(contractId), clientWins);
  await tx.wait();
}

/** Resolve via DisputeResolver contract (for arbitrators when judge is the resolver). */
export async function resolveDisputeViaResolver(provider: BrowserProvider, contractId: string, clientWins: boolean) {
  const resolverAddr = getDisputeResolverAddress();
  if (!resolverAddr) throw new Error("DISPUTE_RESOLVER_ADDRESS not set");
  const signer = await provider.getSigner();
  const contract = new Contract(resolverAddr, DISPUTE_RESOLVER_ABI, signer);
  const tx = await contract.resolveDispute(normalizeContractId(contractId), clientWins);
  await tx.wait();
}

/** True if the connected signer is an arbitrator on the DisputeResolver contract. */
export async function isArbitrator(provider: BrowserProvider): Promise<boolean> {
  const resolverAddr = getDisputeResolverAddress();
  if (!resolverAddr) return false;
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  const resolver = new Contract(resolverAddr, DISPUTE_RESOLVER_ABI, provider);
  return resolver.arbitrators(address);
}

export async function requestCancel(provider: BrowserProvider, contractId: string) {
  const contract = await getEscrowContract(provider);
  const tx = await contract.requestCancel(normalizeContractId(contractId));
  await tx.wait();
}

export async function cancelContract(provider: BrowserProvider, contractId: string) {
  const contract = await getEscrowContract(provider);
  const tx = await contract.cancelContract(normalizeContractId(contractId));
  await tx.wait();
}

export async function claimRefund(provider: BrowserProvider, contractId: string) {
  const contract = await getEscrowContract(provider);
  const tx = await contract.claimRefund(normalizeContractId(contractId));
  await tx.wait();
}

export async function getContract(provider: BrowserProvider | Parameters<typeof getEscrowContractForReads>[0], contractId: string) {
  const contract = getEscrowContractForReads(provider);
  return contract.getContract(normalizeContractIdLenient(contractId));
}

/** Required funding amount (wei) for this contract; client must send exactly this in fundEscrow. */
export async function getRequiredFundAmount(provider: BrowserProvider | Parameters<typeof getEscrowContractForReads>[0], contractId: string): Promise<bigint> {
  const contract = getEscrowContractForReads(provider);
  return contract.requiredFundAmount(normalizeContractIdLenient(contractId));
}

/** Judge and dispute flags (from contracts mapping). Use when state === DISPUTED (5). */
export async function getContractDisputeInfo(
  provider: BrowserProvider | Parameters<typeof getEscrowContractForReads>[0],
  contractId: string
): Promise<{ judge: string; disputeResolved: boolean; clientWinsDispute: boolean }> {
  const contract = getEscrowContractForReads(provider);
  const raw = await contract.contracts(normalizeContractIdLenient(contractId));
  const judge = raw.judge ?? raw[10];
  const disputeResolved = raw.disputeResolved ?? raw[11];
  const clientWinsDispute = raw.clientWinsDispute ?? raw[12];
  return { judge: String(judge ?? ""), disputeResolved: Boolean(disputeResolved), clientWinsDispute: Boolean(clientWinsDispute) };
}

export async function getContractCreator(provider: BrowserProvider, contractId: string): Promise<string | null> {
  const contract = await getEscrowContract(provider);
  const creator = await contract.contractCreator(normalizeContractId(contractId));
  if (!creator || creator === "0x0000000000000000000000000000000000000000") return null;
  return creator;
}

export async function getMilestone(
  provider: BrowserProvider,
  contractId: string,
  index: number
): Promise<[boolean, boolean, bigint]> {
  const contract = await getEscrowContract(provider);
  return contract.milestones(normalizeContractId(contractId), index);
}

export async function getCancelRequested(provider: BrowserProvider, contractId: string): Promise<{ client: boolean; developer: boolean }> {
  const contract = await getEscrowContract(provider);
  const cid = normalizeContractId(contractId);
  const [client, developer] = await Promise.all([
    contract.clientCancelRequested(cid),
    contract.developerCancelRequested(cid),
  ]);
  return { client, developer };
}

export async function getUsername(provider: BrowserProvider | Parameters<typeof getEscrowContractForReads>[0], address: string): Promise<string> {
  const contract = getEscrowContractForReads(provider);
  const name = await contract.usernames(address);
  return typeof name === "string" ? name : "";
}

export async function setUsername(provider: BrowserProvider, username: string) {
  const contract = await getEscrowContract(provider);
  const tx = await contract.setUsername(username.slice(0, 32));
  await tx.wait();
}
