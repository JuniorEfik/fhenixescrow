"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { useWallet } from "@/context/WalletContext";
import GlassCard from "@/components/GlassCard";
import StatusBadge from "@/components/StatusBadge";
import MilestoneProgress from "@/components/MilestoneProgress";
import AnimatedButton from "@/components/AnimatedButton";
import ContractLoader from "@/components/ContractLoader";
import Modal from "@/components/Modal";
import { CONTRACT_STATES } from "@/lib/contracts";
import { formatUsernameForDisplay } from "@/lib/username";
import { getActionErrorMessage, getErrorSuggestion, isUserRejection } from "@/lib/error-utils";
import { getDefaultChainId, getDisputeResolverAddress, getEscrowContractAddress } from "@/lib/constants";
import { preloadCofhe } from "@/lib/cofhe-client";
import { getEthersProvider, getReadOnlyProvider, switchToFhenixNetwork } from "@/lib/ethers-provider";
import { formatEther, parseEther } from "ethers";
import { format } from "date-fns";

interface ContractData {
  client: string;
  developer: string;
  state: number;
  deadline: bigint;
  balance: bigint;
  createdAt: bigint;
  clientSigned: boolean;
  developerSigned: boolean;
  milestoneCount: number;
  approvedCount: number;
}

interface MilestoneData {
  submitted: boolean;
  approved: boolean;
  submittedAt: bigint;
  description: string;
  completionComment?: string;
}

export default function ContractDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";
  const { address, provider } = useWallet();
  const escrowRef = useRef<typeof import("@/lib/escrow-service") | null>(null);
  const [data, setData] = useState<ContractData | null>(null);
  const [milestones, setMilestones] = useState<MilestoneData[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deadlineInput, setDeadlineInput] = useState("");
  const [fundAmount, setFundAmount] = useState("");
  const [clientCancelRequested, setClientCancelRequested] = useState(false);
  const [developerCancelRequested, setDeveloperCancelRequested] = useState(false);
  const [showAddMilestoneForm, setShowAddMilestoneForm] = useState(false);
  const [addMilestoneDescription, setAddMilestoneDescription] = useState("");
  const [editingMilestoneIndex, setEditingMilestoneIndex] = useState<number | null>(null);
  const [editMilestoneDescription, setEditMilestoneDescription] = useState("");
  const [discussionMessages, setDiscussionMessages] = useState<{ sender: string; message: string }[]>([]);
  const [discussionInput, setDiscussionInput] = useState("");
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [creatorAddress, setCreatorAddress] = useState<string | null>(null);
  const discussionListRef = useRef<HTMLUListElement>(null);
  const [completionCommentForIndex, setCompletionCommentForIndex] = useState<number | null>(null);
  const [completionCommentText, setCompletionCommentText] = useState("");
  const [errorPopup, setErrorPopup] = useState<{ message: string; suggestion: string } | null>(null);
  const errorPopupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [addMilestoneLoading, setAddMilestoneLoading] = useState(false);
  const [sendDiscussionLoading, setSendDiscussionLoading] = useState(false);
  const [signContractLoading, setSignContractLoading] = useState(false);
  const [disputeInfo, setDisputeInfo] = useState<{ judge: string; disputeResolved: boolean; clientWinsDispute: boolean } | null>(null);
  const [isArbitrator, setIsArbitrator] = useState(false);
  const [refetchLoading, setRefetchLoading] = useState(false);
  const [requiredFundAmountWei, setRequiredFundAmountWei] = useState<bigint | null>(null);
  const [showCanceledPopup, setShowCanceledPopup] = useState(false);
  const [showMilestoneTerminalPopup, setShowMilestoneTerminalPopup] = useState(false);
  const [milestoneTerminalLines, setMilestoneTerminalLines] = useState<string[]>([]);

  const milestoneTerminalLog = (message: string) => {
    setMilestoneTerminalLines((prev) => [...prev, message]);
  };

  const showErrorPopup = (message: string, suggestion?: string) => {
    if (errorPopupTimeoutRef.current) clearTimeout(errorPopupTimeoutRef.current);
    setError(null);
    setErrorPopup({ message, suggestion: suggestion ?? "Please try again." });
  };

  const showSuccess = (msg: string) => {
    if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    setSuccessMessage(msg);
    successTimeoutRef.current = setTimeout(() => {
      setSuccessMessage(null);
      successTimeoutRef.current = null;
    }, 3000);
  };

  /** On tx error: show "Transaction was canceled" popup for user rejection, else error popup. */
  const handleActionError = (e: unknown) => {
    if (isUserRejection(e)) {
      setShowCanceledPopup(true);
    } else {
      showErrorPopup(getActionErrorMessage(e), getErrorSuggestion(getActionErrorMessage(e)));
    }
  };

  const copyContractId = () => {
    if (typeof navigator?.clipboard === "undefined") return;
    navigator.clipboard.writeText(id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const isContractDoesNotExistError = (e: unknown): boolean => {
    const msg = getActionErrorMessage(e);
    return msg.toLowerCase().includes("contract does not exist");
  };

  useEffect(() => {
    if (!provider || !id) {
      setLoading(false);
      return;
    }
    if (!getEscrowContractAddress()?.trim()) {
      setError("App not configured: missing escrow contract address.");
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
        const [client, developer, state, deadline, balance, createdAt, clientSigned, developerSigned, milestoneCount, approvedCount] = await escrow.getContract(providerToUse, id);
        setData({
          client,
          developer,
          state: Number(state),
          deadline,
          balance,
          createdAt,
          clientSigned,
          developerSigned,
          milestoneCount: Number(milestoneCount),
          approvedCount: Number(approvedCount),
        });
        const m: MilestoneData[] = [];
        for (let i = 0; i < Number(milestoneCount); i++) {
          const [submitted, approved, submittedAt] = await escrow.getMilestone(providerToUse, id, i);
          const [description, completionComment] = await Promise.all([
            escrow.getMilestoneDescription(providerToUse, id, i),
            escrow.getMilestoneCompletionComment(providerToUse, id, i),
          ]);
          m.push({ submitted, approved, submittedAt, description: description || "", completionComment: completionComment || undefined });
        }
        setMilestones(m);
        const cancelReq = await escrow.getCancelRequested(providerToUse, id);
        setClientCancelRequested(cancelReq.client);
        setDeveloperCancelRequested(cancelReq.developer);
        const discussion = await escrow.getDiscussionMessages(providerToUse, id);
        setDiscussionMessages(discussion);
        const uniqueAddrs = [...new Set([client, developer, ...discussion.map((m) => m.sender)].map((a) => a.toLowerCase()))];
        const names = await Promise.all(uniqueAddrs.map((addr) => escrow.getUsername(providerToUse, addr)));
        const map: Record<string, string> = {};
        uniqueAddrs.forEach((addr, i) => { map[addr] = names[i] || ""; });
        setNameMap(map);
        const creator = await escrow.getContractCreator(providerToUse, id);
        setCreatorAddress(creator);
        if (Number(state) === 5) {
          const info = await escrow.getContractDisputeInfo(providerToUse, id);
          setDisputeInfo(info);
          if (getDisputeResolverAddress() && info.judge?.toLowerCase() === getDisputeResolverAddress()?.toLowerCase() && provider) {
            escrow.isArbitrator(provider).then(setIsArbitrator).catch(() => setIsArbitrator(false));
          } else {
            setIsArbitrator(false);
          }
        } else {
          setDisputeInfo(null);
          setIsArbitrator(false);
        }
        if (Number(state) === 1) {
          const required = await escrow.getRequiredFundAmount(providerToUse, id);
          setRequiredFundAmountWei(required);
          setFundAmount(required > 0n ? formatEther(required) : "");
        } else {
          setRequiredFundAmountWei(null);
          setFundAmount("");
        }
      } catch (e) {
        if (isContractDoesNotExistError(e)) {
          setError(null);
          setErrorPopup({ message: "This contract does not exist.", suggestion: "Redirecting to the dashboard." });
          if (errorPopupTimeoutRef.current) clearTimeout(errorPopupTimeoutRef.current);
          errorPopupTimeoutRef.current = setTimeout(() => {
            setErrorPopup(null);
            errorPopupTimeoutRef.current = null;
            router.push("/dashboard");
          }, 3000);
        } else {
          setError(e instanceof Error ? e.message : "Failed to load contract");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [provider, id]);

  const refetchDiscussion = async () => {
    const escrow = escrowRef.current;
    if (!provider || !id || !escrow) return;
    const providerToUse = getReadOnlyProvider() ?? provider;
    try {
      const discussion = await escrow.getDiscussionMessages(providerToUse, id);
      setDiscussionMessages(discussion);
      const [client, developer] = await escrow.getContract(providerToUse, id);
      const uniqueAddrs = [...new Set([client, developer, ...discussion.map((m) => m.sender)].map((a) => String(a).toLowerCase()))];
      const names = await Promise.all(uniqueAddrs.map((addr) => escrow.getUsername(providerToUse, addr)));
      const map: Record<string, string> = {};
      uniqueAddrs.forEach((addr, i) => { map[addr] = names[i] || ""; });
      setNameMap((prev) => ({ ...prev, ...map }));
    } catch {
      // ignore refetch errors (e.g. network)
    }
  };

  const refetchContractAndMilestones = async (showLoading = false) => {
    const escrow = escrowRef.current;
    if (!id || !escrow || !provider) return;
    if (showLoading) setRefetchLoading(true);
    try {
      const [client, developer, state, deadline, balance, createdAt, clientSigned, developerSigned, milestoneCount, approvedCount] = await escrow.getContract(provider, id);
      setData({
        client,
        developer,
        state: Number(state),
        deadline,
        balance,
        createdAt,
        clientSigned,
        developerSigned,
        milestoneCount: Number(milestoneCount),
        approvedCount: Number(approvedCount),
      });
      const m: MilestoneData[] = [];
      for (let i = 0; i < Number(milestoneCount); i++) {
        const [submitted, approved, submittedAt] = await escrow.getMilestone(provider, id, i);
        const [description, completionComment] = await Promise.all([
          escrow.getMilestoneDescription(provider, id, i),
          escrow.getMilestoneCompletionComment(provider, id, i),
        ]);
        m.push({ submitted, approved, submittedAt, description: description || "", completionComment: completionComment || undefined });
      }
      setMilestones(m);
      if (Number(state) === 5) {
        const info = await escrow.getContractDisputeInfo(provider, id);
        setDisputeInfo(info);
        if (getDisputeResolverAddress() && info.judge?.toLowerCase() === getDisputeResolverAddress()?.toLowerCase()) {
          escrow.isArbitrator(provider).then(setIsArbitrator).catch(() => setIsArbitrator(false));
        } else {
          setIsArbitrator(false);
        }
      } else {
        setDisputeInfo(null);
        setIsArbitrator(false);
      }
      if (Number(state) === 1) {
        const required = await escrow.getRequiredFundAmount(provider, id);
        setRequiredFundAmountWei(required);
        setFundAmount(required > 0n ? formatEther(required) : "");
      } else {
        setRequiredFundAmountWei(null);
        setFundAmount("");
      }
    } catch (e) {
      if (showLoading) handleActionError(e);
    } finally {
      if (showLoading) setRefetchLoading(false);
    }
  };

  useEffect(() => {
    if (!provider || !id) return;
    const interval = setInterval(refetchDiscussion, 20_000);
    return () => clearInterval(interval);
  }, [provider, id]);

  useEffect(() => {
    if (!provider || !id) return;
    const interval = setInterval(refetchContractAndMilestones, 5_000);
    return () => clearInterval(interval);
  }, [provider, id]);

  useEffect(() => {
    if (!provider || !id) return;
    const onFocus = () => refetchContractAndMilestones();
    const onVisible = () => {
      if (document.visibilityState === "visible") refetchContractAndMilestones();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [provider, id]);

  useEffect(() => {
    return () => {
      if (errorPopupTimeoutRef.current) clearTimeout(errorPopupTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (provider) preloadCofhe(provider);
  }, [provider]);

  useEffect(() => {
    const el = discussionListRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [discussionMessages]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatDeadlineCountdown = (deadlineSec: bigint): string => {
    const left = Number(deadlineSec) - now;
    if (left <= 0) return "Expired";
    const d = Math.floor(left / 86400);
    const h = Math.floor((left % 86400) / 3600);
    const m = Math.floor((left % 3600) / 60);
    const s = left % 60;
    if (d > 0) return `${d}d ${h}h ${m}m ${s}s`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const isClient = address && data?.client?.toLowerCase() === address.toLowerCase();
  const isDeveloper = address && data?.developer?.toLowerCase() === address.toLowerCase();
  const isParty = isClient || isDeveloper;
  const isCreator = address && creatorAddress && address.toLowerCase() === creatorAddress.toLowerCase();
  const currentPartyHasSigned = data ? (isClient && data.clientSigned) || (isDeveloper && data.developerSigned) : false;

  const handleSetTerms = async () => {
    const escrow = escrowRef.current;
    if (!provider || !deadlineInput || !escrow) return;
    setActionLoading(true);
    try {
      const deadline = Math.floor(new Date(deadlineInput).getTime() / 1000);
      await escrow.setTerms(provider, id, deadline);
      router.refresh();
      setData((d) => (d ? { ...d, deadline: BigInt(deadline) } : null));
    } catch (e) {
      handleActionError(e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddMilestone = async () => {
    const escrow = escrowRef.current;
    if (!provider || !escrow) return;
    setActionLoading(true);
    setAddMilestoneLoading(true);
    setError(null);
    setShowMilestoneTerminalPopup(true);
    setMilestoneTerminalLines(["$ Adding milestone…"]);
    try {
      await escrow.addMilestone(provider, id, 1, addMilestoneDescription.trim() || "Milestone", milestoneTerminalLog);
      milestoneTerminalLog("Done.");
      setShowAddMilestoneForm(false);
      setAddMilestoneDescription("");
      router.refresh();
      await new Promise((r) => setTimeout(r, 400));
      await refetchContractAndMilestones();
    } catch (e) {
      handleActionError(e);
      milestoneTerminalLog(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setActionLoading(false);
      setAddMilestoneLoading(false);
    }
  };

  const handleUpdateMilestone = async (index: number) => {
    const escrow = escrowRef.current;
    if (!provider || !escrow) return;
    setActionLoading(true);
    setError(null);
    try {
      await escrow.updateMilestone(provider, id, index, 1, editMilestoneDescription.trim() || "Milestone");
      setEditingMilestoneIndex(null);
      router.refresh();
      const desc = await escrow.getMilestoneDescription(provider, id, index);
      setMilestones((m) => {
        const next = [...m];
        next[index] = { ...next[index], description: desc || "" };
        return next;
      });
    } catch (e) {
      handleActionError(e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendDiscussion = async () => {
    const escrow = escrowRef.current;
    if (!provider || !escrow || !discussionInput.trim() || !address) return;
    const msg = discussionInput.trim().slice(0, 500);
    setActionLoading(true);
    setSendDiscussionLoading(true);
    setError(null);
    try {
      await escrow.addDiscussionMessage(provider, id, msg);
      setDiscussionInput("");
      setDiscussionMessages((prev) => [...prev, { sender: address, message: msg }]);
      const discussion = await escrow.getDiscussionMessages(provider, id);
      setDiscussionMessages(discussion);
      const uniqueAddrs = [...new Set([data!.client, data!.developer, ...discussion.map((m) => m.sender)].map((a) => String(a).toLowerCase()))];
      const names = await Promise.all(uniqueAddrs.map((addr) => escrow.getUsername(provider, addr)));
      const map: Record<string, string> = {};
      uniqueAddrs.forEach((addr, i) => { map[addr] = names[i] || ""; });
      setNameMap((prev) => ({ ...prev, ...map }));
      router.refresh();
    } catch (e) {
      handleActionError(e);
    } finally {
      setActionLoading(false);
      setSendDiscussionLoading(false);
    }
  };

  const handleRemoveLastMilestone = async () => {
    const escrow = escrowRef.current;
    if (!provider || !escrow || !data || data.milestoneCount === 0) return;
    setActionLoading(true);
    setError(null);
    try {
      await escrow.removeLastMilestone(provider, id);
      router.refresh();
      await new Promise((r) => setTimeout(r, 400));
      await refetchContractAndMilestones();
    } catch (e) {
      handleActionError(e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSign = async () => {
    const escrow = escrowRef.current;
    if (!provider || !escrow) return;
    setActionLoading(true);
    setSignContractLoading(true);
    setError(null);
    try {
      await escrow.signContract(provider, id);
      const [client, developer, state, deadline, balance, createdAt, clientSigned, developerSigned, milestoneCount, approvedCount] = await escrow.getContract(provider, id);
      const newState = clientSigned && developerSigned ? 1 : Number(state);
      setData({
        client,
        developer,
        state: newState,
        deadline,
        balance,
        createdAt,
        clientSigned,
        developerSigned,
        milestoneCount: Number(milestoneCount),
        approvedCount: Number(approvedCount),
      });
      router.refresh();
    } catch (e) {
      handleActionError(e);
    } finally {
      setActionLoading(false);
      setSignContractLoading(false);
    }
  };

  const handleFund = async () => {
    const escrow = escrowRef.current;
    if (!provider || !fundAmount || !escrow) return;
    setActionLoading(true);
    try {
      const wei = parseEther(fundAmount.trim());
      await escrow.fundEscrow(provider, id, wei);
      router.refresh();
      const [, , , , balance] = await escrow.getContract(provider, id);
      setData((d) => (d ? { ...d, balance, state: 2 } : null));
    } catch (e) {
      handleActionError(e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitMilestone = async (index: number, comment = "") => {
    const escrow = escrowRef.current;
    if (!provider || !escrow) return;
    setActionLoading(true);
    setCompletionCommentForIndex(null);
    setCompletionCommentText("");
    try {
      await escrow.submitMilestone(provider, id, index, comment);
      router.refresh();
      const [submitted, approved, submittedAt] = await escrow.getMilestone(provider, id, index);
      const completionComment = await escrow.getMilestoneCompletionComment(provider, id, index);
      setMilestones((m) => {
        const next = [...m];
        next[index] = { ...next[index], submitted, approved, submittedAt, completionComment: completionComment || undefined };
        return next;
      });
      setData((d) => (d ? { ...d, state: 3 } : null));
      showSuccess("Milestone submitted");
    } catch (e) {
      handleActionError(e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveMilestone = async (index: number) => {
    const escrow = escrowRef.current;
    if (!provider || !escrow) return;
    setActionLoading(true);
    try {
      await escrow.approveMilestone(provider, id, index);
      router.refresh();
      const res = await escrow.getContract(provider, id);
      const milestoneCount = Number(res[8]);
      const approvedCount = Number(res[9]);
      setMilestones((m) => {
        const next = [...m];
        next[index] = { ...next[index], approved: true };
        return next;
      });
      setData((d) => (d ? { ...d, approvedCount, state: approvedCount === milestoneCount ? 4 : 3 } : null));
      showSuccess("Milestone approved");
    } catch (e) {
      handleActionError(e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectMilestone = async (index: number) => {
    const escrow = escrowRef.current;
    if (!provider || !escrow) return;
    setActionLoading(true);
    try {
      await escrow.rejectMilestone(provider, id, index);
      router.refresh();
      setMilestones((m) => {
        const next = [...m];
        next[index] = { ...next[index], submitted: false, submittedAt: 0n, completionComment: undefined };
        return next;
      });
    } catch (e) {
      handleActionError(e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleClaimPayout = async () => {
    const escrow = escrowRef.current;
    if (!provider || !escrow) return;
    setActionLoading(true);
    try {
      await escrow.claimPayout(provider, id);
      router.refresh();
      setData((d) => (d ? { ...d, state: 7, balance: 0n } : null));
    } catch (e) {
      handleActionError(e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRaiseDispute = async () => {
    const escrow = escrowRef.current;
    if (!provider || !escrow) return;
    setActionLoading(true);
    try {
      await escrow.raiseDispute(provider, id);
      router.refresh();
      setData((d) => (d ? { ...d, state: 5 } : null));
      const info = await escrow.getContractDisputeInfo(provider, id);
      setDisputeInfo(info);
      if (getDisputeResolverAddress() && info.judge?.toLowerCase() === getDisputeResolverAddress()?.toLowerCase()) {
        escrow.isArbitrator(provider).then(setIsArbitrator).catch(() => setIsArbitrator(false));
      } else {
        setIsArbitrator(false);
      }
    } catch (e) {
      handleActionError(e);
    } finally {
      setActionLoading(false);
    }
  };

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const judgeIsResolver = disputeInfo && getDisputeResolverAddress() && disputeInfo.judge?.toLowerCase() === getDisputeResolverAddress()?.toLowerCase();
  const isJudge =
    address &&
    disputeInfo &&
    (disputeInfo.judge.toLowerCase() === address.toLowerCase() ||
      disputeInfo.judge === ZERO_ADDRESS ||
      (!!judgeIsResolver && isArbitrator));
  /** Only client, developer, and judge(s) can view an accepted contract. */
  const canViewContract = isClient || isDeveloper || isJudge;

  const handleResolveDispute = async (clientWins: boolean) => {
    const escrow = escrowRef.current;
    if (!provider || !escrow) return;
    setActionLoading(true);
    try {
      if (judgeIsResolver) {
        await escrow.resolveDisputeViaResolver(provider, id, clientWins);
      } else {
        await escrow.resolveDispute(provider, id, clientWins);
      }
      router.refresh();
      await refetchContractAndMilestones();
    } catch (e) {
      handleActionError(e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestCancel = async () => {
    const escrow = escrowRef.current;
    if (!provider || !escrow) return;
    setActionLoading(true);
    setError(null);
    try {
      await escrow.requestCancel(provider, id);
      if (isClient) setClientCancelRequested(true);
      if (isDeveloper) setDeveloperCancelRequested(true);
      router.refresh();
    } catch (e) {
      handleActionError(e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelContract = async () => {
    const escrow = escrowRef.current;
    if (!provider || !escrow) return;
    setActionLoading(true);
    try {
      await escrow.cancelContract(provider, id);
      router.refresh();
      setData((d) => (d ? { ...d, state: 6, balance: 0n } : null));
    } catch (e) {
      handleActionError(e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleClaimRefund = async () => {
    const escrow = escrowRef.current;
    if (!provider || !escrow) return;
    setActionLoading(true);
    try {
      await escrow.claimRefund(provider, id);
      router.refresh();
      setData((d) => (d ? { ...d, state: 6, balance: 0n } : null));
    } catch (e) {
      handleActionError(e);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <ContractLoader />;
  if (!data || error) {
    const isRedirectingToDashboard = errorPopup?.suggestion?.includes("Redirecting to the dashboard");
    if (isRedirectingToDashboard && errorPopup) {
      return (
        <main className="pt-24 px-4 max-w-4xl mx-auto">
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/40">
            <div className="max-w-md w-full rounded-xl bg-red-500/95 text-white p-4 shadow-lg border border-red-400/50">
              <p className="font-medium">Contract not found</p>
              <p className="mt-1 text-sm opacity-90">{errorPopup.message}</p>
              <p className="mt-2 text-sm opacity-80">{errorPopup.suggestion}</p>
              <Link href="/dashboard" className="mt-3 inline-block px-3 py-1.5 rounded bg-white/20 hover:bg-white/30 text-sm font-medium">
                Go to Dashboard
              </Link>
            </div>
          </div>
        </main>
      );
    }
    return (
      <main className="pt-24 px-4 max-w-4xl mx-auto">
        <GlassCard className="p-8 text-center">
          {error || "Contract not found"}
        </GlassCard>
      </main>
    );
  }

  if (address && !canViewContract) {
    return (
      <main className="pt-24 px-4 max-w-4xl mx-auto">
        <GlassCard className="p-8 text-center">
          <p className="text-[var(--text-secondary)] mb-4">
            You don&apos;t have permission to view this contract. Only the client, developer, and assigned judge(s) can view it.
          </p>
          <Link href="/dashboard" className="text-[var(--solana-green)] hover:underline font-medium">
            Go to Dashboard
          </Link>
        </GlassCard>
      </main>
    );
  }

  const stateKey = CONTRACT_STATES[data.state] ?? "DRAFT";
  const deadlinePassed = data.deadline > 0n && Number(data.deadline) <= now;
  const canClaimRefund = isClient && deadlinePassed && data.state !== 6 && data.state !== 7 && data.approvedCount < data.milestoneCount;
  const milestoneActionsDisabled = data.state === 5 || data.state === 6;

  const displayName = (addr: string) => {
    const name = nameMap[addr?.toLowerCase() ?? ""]?.trim();
    return name ? formatUsernameForDisplay(name) : `${addr?.slice(0, 6)}...${addr?.slice(-4) ?? ""}`;
  };

  const shortId = id.startsWith("0x") ? id.slice(2, 10) : id.slice(0, 8);

  return (
    <main className="pt-24 px-4 max-w-4xl mx-auto pb-12">

      {errorPopup && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/40" onClick={() => setErrorPopup(null)}>
          <div className="max-w-md w-full rounded-xl bg-red-500/95 text-white p-4 shadow-lg border border-red-400/50" onClick={(e) => e.stopPropagation()}>
            <p className="font-medium">Something went wrong</p>
            <p className="mt-1 text-sm opacity-90">{errorPopup.message}</p>
            <p className="mt-2 text-sm opacity-80">{errorPopup.suggestion}</p>
            <button type="button" onClick={() => setErrorPopup(null)} className="mt-3 px-3 py-1.5 rounded bg-white/20 hover:bg-white/30 text-sm font-medium">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-lg bg-[var(--solana-green)]/90 text-[var(--bg-primary)] font-medium text-sm shadow-lg" role="status" aria-live="polite">
          {successMessage}
        </div>
      )}

      {showCanceledPopup && (
        <Modal title="Transaction was canceled" onClose={() => setShowCanceledPopup(false)}>
          <p className="text-sm text-[var(--text-muted)] mb-4">
            The transaction was canceled. You can try again when you&apos;re ready.
          </p>
          <AnimatedButton onClick={() => setShowCanceledPopup(false)} className="w-full">
            OK
          </AnimatedButton>
        </Modal>
      )}

      {showMilestoneTerminalPopup && (
        <Modal title="Adding milestone…" onClose={() => setShowMilestoneTerminalPopup(false)}>
          <div
            className="rounded-lg bg-[#0d1117] border border-white/10 p-4 font-mono text-sm text-[var(--solana-green)] overflow-x-auto min-h-[120px]"
            style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.05)" }}
          >
            {milestoneTerminalLines.map((line, i) => (
              <div key={i} className="leading-relaxed">
                {line.startsWith("Error:") ? (
                  <span className="text-red-400">{line}</span>
                ) : (
                  line
                )}
              </div>
            ))}
            {addMilestoneLoading && (
              <span className="inline-block w-2 h-4 ml-0.5 bg-[var(--solana-green)] animate-pulse" aria-hidden />
            )}
          </div>
          <AnimatedButton onClick={() => setShowMilestoneTerminalPopup(false)} className="w-full mt-4">
            {addMilestoneLoading ? "Minimize" : "Close"}
          </AnimatedButton>
        </Modal>
      )}

      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <h1 className="text-2xl font-bold" title={id}>Contract #{shortId}</h1>
        <button
          type="button"
          onClick={copyContractId}
          className="text-sm px-2 py-1 rounded bg-[var(--bg-tertiary)] border border-white/10 text-[var(--text-muted)] hover:text-white hover:border-white/20 transition-colors"
        >
          {copiedId ? "Copied!" : "Copy ID"}
        </button>
        <StatusBadge status={stateKey} />
      </div>

      <GlassCard className="p-6 mb-6">
        <div className="grid gap-2 text-sm">
          <p><span className="text-[var(--text-muted)]">Client:</span> <span className="font-mono" title={data.client}>{displayName(data.client)}</span></p>
          <p><span className="text-[var(--text-muted)]">Developer:</span> <span className="font-mono" title={data.developer}>{displayName(data.developer)}</span></p>
          <p><span className="text-[var(--text-muted)]">Balance:</span> {formatEther(data.balance)}</p>
          <p><span className="text-[var(--text-muted)]">Deadline:</span>{" "}
            {data.deadline > 0n
              ? format(Number(data.deadline) * 1000, "PPp")
              : data.state === 0
                ? "Not set (defaults to 3 days when both sign)"
                : "—"}
          </p>
          {data.deadline > 0n && data.state >= 1 && data.state <= 3 && (
            <p><span className="text-[var(--text-muted)]">Time left:</span>{" "}
              <span className={deadlinePassed ? "text-red-400" : "text-[var(--solana-green)]"}>
                {formatDeadlineCountdown(data.deadline)}
              </span>
            </p>
          )}
          {data.deadline > 0n && (data.state === 4 || data.state === 7) && (
            <p><span className="text-[var(--text-muted)]">Status:</span> <span className="text-[var(--solana-green)]">Completed</span></p>
          )}
          <p><span className="text-[var(--text-muted)]">Created:</span> {format(Number(data.createdAt) * 1000, "PP")}</p>
          <p>Client signed: {data.clientSigned ? "Yes" : "No"} · Developer signed: {data.developerSigned ? "Yes" : "No"}</p>
        </div>
      </GlassCard>

      <GlassCard className="p-6 mb-6">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="font-semibold">Milestones</h2>
          <button
            type="button"
            onClick={() => refetchContractAndMilestones(true)}
            disabled={refetchLoading}
            className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors underline underline-offset-2 disabled:opacity-50 disabled:pointer-events-none"
          >
            {refetchLoading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        <MilestoneProgress completed={data.approvedCount} total={data.milestoneCount || 1} />
        <p className="text-sm text-[var(--text-muted)] mt-1">{data.approvedCount} / {data.milestoneCount} approved</p>
        <ul className="mt-4 space-y-3">
          {milestones.map((m, i) => (
            <li key={i} className="py-3 border-b border-white/5 last:border-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-[var(--text-muted)]">Milestone {i + 1}</span>
                  <p className="mt-0.5 text-sm">{m.description || "— No description —"}</p>
                  {m.completionComment && (
                    <p className="mt-1 text-sm text-[var(--text-muted)] italic border-l-2 border-white/20 pl-2">Completion: {m.completionComment}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-sm text-[var(--text-muted)]">
                    {m.approved ? "Approved" : m.submitted ? "Pending approval" : "Not submitted"}
                  </span>
                  {data.state === 0 && isCreator && editingMilestoneIndex !== i && (
                    <AnimatedButton variant="ghost" className="text-sm py-1" onClick={() => { setEditingMilestoneIndex(i); setEditMilestoneDescription(m.description); }} disabled={actionLoading}>
                      Edit
                    </AnimatedButton>
                  )}
                  {data.state === 0 && isCreator && editingMilestoneIndex === i && (
                    <div className="flex flex-col gap-2 ml-2 p-2 rounded bg-[var(--bg-tertiary)] border border-white/10">
                      <input type="text" placeholder="Description" value={editMilestoneDescription} onChange={(e) => setEditMilestoneDescription(e.target.value)} className="bg-[var(--bg)] border border-white/10 rounded px-2 py-1 text-sm w-48" />
                      <div className="flex gap-1">
                        <AnimatedButton className="text-sm py-1" onClick={() => handleUpdateMilestone(i)} disabled={actionLoading}>Save</AnimatedButton>
                        <AnimatedButton variant="ghost" className="text-sm py-1" onClick={() => setEditingMilestoneIndex(null)}>Cancel</AnimatedButton>
                      </div>
                    </div>
                  )}
                  {isDeveloper && data.state >= 2 && !m.submitted && !milestoneActionsDisabled && (
                    <AnimatedButton variant="ghost" className="text-sm py-1" onClick={() => { setCompletionCommentForIndex(i); setCompletionCommentText(""); }} disabled={actionLoading}>
                      Mark as completed
                    </AnimatedButton>
                  )}
                  {isClient && m.submitted && !m.approved && !milestoneActionsDisabled && (
                    <div className="flex gap-1">
                      <AnimatedButton className="text-sm py-1" onClick={() => handleApproveMilestone(i)} disabled={actionLoading}>
                        Approve
                      </AnimatedButton>
                      <AnimatedButton variant="secondary" className="text-sm py-1" onClick={() => handleRejectMilestone(i)} disabled={actionLoading}>
                        Reject
                      </AnimatedButton>
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
        {isCreator && data.state === 0 && !showAddMilestoneForm && (
          <div className="mt-4 flex flex-wrap gap-2">
            <AnimatedButton onClick={() => setShowAddMilestoneForm(true)} disabled={actionLoading}>
              Add Milestone
            </AnimatedButton>
            {data.milestoneCount > 0 && (
              <AnimatedButton variant="secondary" onClick={handleRemoveLastMilestone} disabled={actionLoading}>
                Remove last milestone
              </AnimatedButton>
            )}
          </div>
        )}
        {isCreator && data.state === 0 && showAddMilestoneForm && (
          <div className="mt-4 p-4 rounded-lg bg-[var(--bg-tertiary)] border border-white/10">
            <h3 className="text-sm font-medium mb-2">New milestone</h3>
            <div className="flex flex-col gap-2 max-w-sm">
              <input type="text" placeholder="Description (e.g. Deliver API integration)" value={addMilestoneDescription} onChange={(e) => setAddMilestoneDescription(e.target.value)} className="bg-[var(--bg)] border border-white/10 rounded px-3 py-2 text-sm" />
              <div className="flex gap-2">
                <AnimatedButton onClick={handleAddMilestone} disabled={actionLoading || !addMilestoneDescription.trim()} className="inline-flex items-center gap-2">
                  {addMilestoneLoading ? (
                    <>
                      <span className="inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden />
                      <span>Adding…</span>
                    </>
                  ) : (
                    "Add"
                  )}
                </AnimatedButton>
                <AnimatedButton variant="ghost" onClick={() => { setShowAddMilestoneForm(false); setAddMilestoneDescription(""); }}>Cancel</AnimatedButton>
              </div>
            </div>
          </div>
        )}
      </GlassCard>

      {isParty && data.state === 0 && (
        <GlassCard className="p-6 mb-6">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="font-semibold">Discussion</h2>
            <button
              type="button"
              onClick={() => refetchDiscussion()}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--solana-green)] transition-colors"
            >
              Refresh
            </button>
          </div>
          <p className="text-sm text-[var(--text-muted)] mb-3">Propose and discuss milestones with the other party before signing. Both can post messages.</p>
          <ul ref={discussionListRef} className="space-y-2 mb-4 max-h-48 overflow-y-auto">
            {discussionMessages.length === 0 ? (
              <li className="text-sm text-[var(--text-muted)]">No messages yet. Add a comment to start the discussion.</li>
            ) : (
              discussionMessages.map((msg, i) => (
                <li key={i} className="text-sm py-1.5 px-2 rounded bg-[var(--bg-tertiary)] border border-white/5">
                  <span className="font-mono text-[var(--text-muted)]" title={msg.sender}>{displayName(msg.sender)}:</span>{" "}{msg.message}
                </li>
              ))
            )}
          </ul>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Add a comment (e.g. suggest a milestone or ask a question)"
              maxLength={500}
              value={discussionInput}
              onChange={(e) => setDiscussionInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSendDiscussion())}
              className="flex-1 bg-[var(--bg-tertiary)] border border-white/10 rounded px-3 py-2 text-sm"
            />
            <AnimatedButton onClick={handleSendDiscussion} disabled={actionLoading || !discussionInput.trim()} className="inline-flex items-center gap-2">
              {sendDiscussionLoading ? (
                <>
                  <span className="inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden />
                  <span>Sending…</span>
                </>
              ) : (
                "Send"
              )}
            </AnimatedButton>
          </div>
        </GlassCard>
      )}

      {isParty && (
        <GlassCard className="p-6">
          <h2 className="font-semibold mb-4">Actions</h2>
          <div className="flex flex-wrap gap-3">
            {data.state === 0 && (
              <>
                {!data.milestoneCount || data.milestoneCount === 0 ? (
                  <p className="text-sm text-[var(--text-muted)] w-full">
                    {isCreator ? "Add at least one milestone before either party can sign." : "The contract creator must add at least one milestone before either party can sign."}
                  </p>
                ) : null}
                {isCreator && (
                  <div className="flex gap-2 items-center">
                    <input
                      type="datetime-local"
                      value={deadlineInput}
                      onChange={(e) => setDeadlineInput(e.target.value)}
                      className="bg-[var(--bg-tertiary)] border border-white/10 rounded px-3 py-2 text-sm"
                    />
                    <AnimatedButton onClick={handleSetTerms} disabled={actionLoading || !deadlineInput}>Set Deadline</AnimatedButton>
                  </div>
                )}
                <AnimatedButton
                  onClick={handleSign}
                  disabled={actionLoading || currentPartyHasSigned || !data.milestoneCount || data.milestoneCount === 0}
                  className="inline-flex items-center gap-2"
                  title={!data.milestoneCount || data.milestoneCount === 0 ? "Add at least one milestone first" : undefined}
                >
                  {signContractLoading ? (
                    <>
                      <span className="inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden />
                      <span>Signing…</span>
                    </>
                  ) : currentPartyHasSigned ? (
                    "Signed"
                  ) : (
                    "Sign Contract"
                  )}
                </AnimatedButton>
              </>
            )}
            {data.state === 1 && isClient && (
              <>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder={requiredFundAmountWei != null ? "" : "e.g. 1.5"}
                  value={fundAmount}
                  onChange={(e) => requiredFundAmountWei == null && setFundAmount(e.target.value)}
                  readOnly={requiredFundAmountWei != null}
                  className="bg-[var(--bg-tertiary)] border border-white/10 rounded px-3 py-2 text-sm w-40"
                  title={requiredFundAmountWei != null ? "Exact amount required (set at contract creation)" : undefined}
                />
                <AnimatedButton onClick={handleFund} disabled={actionLoading || !fundAmount}>Fund Escrow</AnimatedButton>
              </>
            )}
            {data.state === 4 && isDeveloper && (
              <AnimatedButton onClick={handleClaimPayout} disabled={actionLoading}>Claim Payout</AnimatedButton>
            )}
            {(data.state === 2 || data.state === 3) && (
              <AnimatedButton variant="secondary" onClick={handleRaiseDispute} disabled={actionLoading}>Raise Dispute</AnimatedButton>
            )}
            {data.state === 5 && (
              <>
                <p className="text-sm text-[var(--text-muted)] w-full">A dispute has been raised. Escrow is locked until the judge resolves.</p>
                {isJudge && (
                  <div className="flex flex-wrap gap-2 items-center">
                    <AnimatedButton variant="secondary" onClick={() => handleResolveDispute(true)} disabled={actionLoading}>Resolve: Refund client</AnimatedButton>
                    <AnimatedButton variant="secondary" onClick={() => handleResolveDispute(false)} disabled={actionLoading}>Resolve: Payout to developer</AnimatedButton>
                  </div>
                )}
              </>
            )}
            {canClaimRefund && (
              <AnimatedButton variant="secondary" onClick={handleClaimRefund} disabled={actionLoading}>Claim Refund (Timeout)</AnimatedButton>
            )}
            {[0, 1, 2, 3].includes(data.state) && (
              <>
                {isClient && (clientCancelRequested ? <span className="text-sm text-[var(--text-muted)]">Cancellation requested</span> : <AnimatedButton variant="ghost" onClick={handleRequestCancel} disabled={actionLoading}>Request Cancel</AnimatedButton>)}
                {isDeveloper && (developerCancelRequested ? <span className="text-sm text-[var(--text-muted)]">Cancellation requested</span> : <AnimatedButton variant="ghost" onClick={handleRequestCancel} disabled={actionLoading}>Request Cancel</AnimatedButton>)}
                <AnimatedButton variant="secondary" onClick={handleCancelContract} disabled={actionLoading}>Cancel Contract (if both requested)</AnimatedButton>
              </>
            )}
          </div>
        </GlassCard>
      )}

      {completionCommentForIndex !== null && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => { setCompletionCommentForIndex(null); setCompletionCommentText(""); }}
          aria-modal
          role="dialog"
          aria-labelledby="completion-modal-title"
        >
          <div
            className="bg-[var(--bg-secondary)] border border-white/10 rounded-xl p-6 shadow-xl max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="completion-modal-title" className="font-semibold mb-2">Mark milestone as completed</h3>
            <p className="text-sm text-[var(--text-muted)] mb-3">
              Milestone {completionCommentForIndex + 1}: {milestones[completionCommentForIndex]?.description || "—"}
            </p>
            <label htmlFor="completion-comment" className="sr-only">Completion comment (optional)</label>
            <textarea
              id="completion-comment"
              placeholder="Completion comment (optional)"
              maxLength={500}
              rows={3}
              value={completionCommentText}
              onChange={(e) => setCompletionCommentText(e.target.value)}
              className="w-full bg-[var(--bg-tertiary)] border border-white/10 rounded-lg px-3 py-2 text-sm resize-none mb-4"
            />
            <div className="flex gap-2 justify-end">
              <AnimatedButton variant="ghost" onClick={() => { setCompletionCommentForIndex(null); setCompletionCommentText(""); }} disabled={actionLoading}>
                Cancel
              </AnimatedButton>
              <AnimatedButton
                onClick={() => handleSubmitMilestone(completionCommentForIndex, completionCommentText.trim())}
                disabled={actionLoading}
              >
                <span aria-live="polite">{actionLoading ? "Submitting…" : "Submit"}</span>
              </AnimatedButton>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
