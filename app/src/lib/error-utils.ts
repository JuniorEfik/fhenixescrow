/**
 * Shared error message extraction and user-friendly suggestions.
 */

/** True if the error is from the user rejecting the transaction in their wallet (e.g. MetaMask). */
export function isUserRejection(e: unknown): boolean {
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const code = o.code ?? (o.error && typeof o.error === "object" && (o.error as Record<string, unknown>).code);
    if (code === 4001 || code === "ACTION_REJECTED") return true;
    if (o.reason === "rejected") return true;
    const msg = getErrorMessage(e).toLowerCase();
    if (msg.includes("user rejected") || msg.includes("user denied") || msg.includes("rejected the request") || msg.includes("ethers-user-denied")) return true;
  }
  return false;
}

export function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    if (typeof o.message === "string") return o.message;
    if (o.error && typeof o.error === "object" && o.error !== null && typeof (o.error as Record<string, unknown>).message === "string") {
      return (o.error as Record<string, unknown>).message as string;
    }
    if (typeof o.reason === "string") return o.reason;
    if (typeof o.shortMessage === "string") return o.shortMessage;
  }
  return String(e);
}

/** For contract/tx errors: prefer reason, then message. */
export function getActionErrorMessage(e: unknown): string {
  if (e instanceof Error) {
    const err = e as { reason?: string };
    if (typeof err.reason === "string") return err.reason;
    return e.message;
  }
  if (e && typeof e === "object" && "reason" in e && typeof (e as { reason: string }).reason === "string") {
    return (e as { reason: string }).reason;
  }
  return String(e);
}

export function getErrorSuggestion(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("deadline") && m.includes("future")) return "Please choose a future date and time for the deadline.";
  if (m.includes("not creator") || m.includes("not a party")) return "Only the contract creator can perform this action.";
  if (m.includes("already signed") || m.includes("already submitted")) return "This step has already been completed.";
  if (m.includes("wrong state") || m.includes("invalid state")) return "This action is not allowed in the current contract state.";
  if (m.includes("insufficient") || m.includes("balance")) return "Check your balance and the required amount.";
  if (m.includes("username already taken")) return "That username is already taken. Please choose another.";
  return "Please check the details and try again.";
}
