/**
 * Username rules: letters and numbers only; optional leading @ is stripped (UI adds @ when displaying).
 * Prevents double @ and invalid characters.
 */

const ALPHANUMERIC = /^[a-zA-Z0-9]+$/;
const MAX_LENGTH = 32;

/**
 * Strip leading @ and validate. Returns clean string for on-chain storage, or an error message.
 */
export function normalizeUsernameForStore(input: string): { clean: string; error?: string } {
  const trimmed = input.trim();
  const withoutAt = trimmed.startsWith("@") ? trimmed.slice(1).trim() : trimmed;
  if (!withoutAt) return { clean: "", error: "Enter a username" };
  if (withoutAt.length > MAX_LENGTH) return { clean: "", error: `Max ${MAX_LENGTH} characters` };
  if (!ALPHANUMERIC.test(withoutAt)) return { clean: "", error: "Only letters and numbers (no @, spaces, or symbols)" };
  return { clean: withoutAt };
}

/**
 * Display username with single @ prefix (handles legacy stored "@alice" to avoid double @@).
 */
export function formatUsernameForDisplay(stored: string): string {
  if (!stored?.trim()) return "";
  const name = stored.startsWith("@") ? stored.slice(1) : stored;
  return name ? `@${name}` : "";
}
