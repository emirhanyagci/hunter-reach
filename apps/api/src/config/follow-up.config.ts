/**
 * Smart follow-up suggestions (contacts list). Override via env.
 *
 * - FOLLOW_UP_DAYS_FIRST / SECOND / FINAL: minimum days since first outbound send before each tier.
 * - FOLLOW_UP_COMPANY_SUPPRESS_MIN_RATIO: empty/unset = suppress when any peer at the same company
 *   (normalized name) has a reply. If set (0–1), suppress when replied/messaged ratio is >= value.
 */
export interface FollowUpConfig {
  daysFirst: number;
  daysSecond: number;
  daysFinal: number;
  /** When null, use “any reply at company” rule. Otherwise require this ratio of replied/messaged contacts. */
  companySuppressMinRatio: number | null;
}

function parseOptionalRatio(raw: string | undefined): number | null {
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) return null;
  return n;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = raw !== undefined ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n < 1) return fallback;
  return n;
}

export function getFollowUpConfig(): FollowUpConfig {
  return {
    daysFirst: parsePositiveInt(process.env.FOLLOW_UP_DAYS_FIRST, 3),
    daysSecond: parsePositiveInt(process.env.FOLLOW_UP_DAYS_SECOND, 7),
    daysFinal: parsePositiveInt(process.env.FOLLOW_UP_DAYS_FINAL, 14),
    companySuppressMinRatio: parseOptionalRatio(process.env.FOLLOW_UP_COMPANY_SUPPRESS_MIN_RATIO),
  };
}
