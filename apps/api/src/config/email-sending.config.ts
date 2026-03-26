import { ConfigService } from '@nestjs/config';

/**
 * Central tuning knobs for outreach sending. Override via env; defaults aim for
 * high throughput (~450/hr cap) while avoiding obvious burst patterns that hurt deliverability.
 *
 * Defaults rationale (tune via env for your ESP / Gmail limits):
 * - EMAIL_MAX_RECIPIENTS_PER_CAMPAIGN (1500): large single sends without multi-day list splits.
 * - EMAIL_MAX_PER_DAY (2000): aggressive daily ceiling; still below many provider abuse thresholds.
 * - EMAIL_MAX_PER_HOUR (450): ~7.2s min spacing vs hourly cap; main driver with per-minute cap.
 * - EMAIL_MAX_PER_MINUTE (35): ~1.7s floor; stagger uses max(hourly, minute) spacing.
 * - EMAIL_STAGGER_JITTER_MS (2500): random extra delay so sends are not perfectly periodic.
 * - EMAIL_QUEUE_LIMITER_*: Bull processes at most N jobs per duration window (backup vs stagger).
 * - EMAIL_QUEUE_CONCURRENCY (2): few parallel Gmail/SMTP calls to avoid API burst errors.
 */
export interface EmailSendingConfig {
  maxRecipientsPerCampaign: number;
  maxEmailsPerDay: number;
  maxEmailsPerHour: number;
  maxEmailsPerMinute: number;
  staggerJitterMs: number;
  queueLimiterMax: number;
  queueLimiterDurationMs: number;
  queueConcurrency: number;
}

/**
 * When scheduledAt is in the past (e.g. server was down), how to treat DB rows still in SCHEDULED.
 * - immediate: queue with delay 0 (default; preserves “never lose” sends).
 * - fail: mark the EmailJob FAILED with an error message (manual follow-up).
 * - skip_queue: leave SCHEDULED in DB but do not enqueue (operator must fix or reschedule).
 */
export type OverdueScheduledEmailPolicy = 'immediate' | 'fail' | 'skip_queue';

export interface ScheduleReconcileConfig {
  overduePolicy: OverdueScheduledEmailPolicy;
  /** 0 = disable periodic reconciliation; otherwise interval in ms (e.g. 300_000 = 5 min). */
  periodicIntervalMs: number;
}

function envInt(config: ConfigService, key: string, defaultVal: number): number {
  const raw = config.get<string>(key);
  if (raw === undefined || raw === '') return defaultVal;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : defaultVal;
}

export function getEmailSendingConfig(config: ConfigService): EmailSendingConfig {
  return {
    maxRecipientsPerCampaign: envInt(config, 'EMAIL_MAX_RECIPIENTS_PER_CAMPAIGN', 1500),
    maxEmailsPerDay: envInt(config, 'EMAIL_MAX_PER_DAY', 2000),
    maxEmailsPerHour: envInt(config, 'EMAIL_MAX_PER_HOUR', 450),
    maxEmailsPerMinute: envInt(config, 'EMAIL_MAX_PER_MINUTE', 35),
    staggerJitterMs: envInt(config, 'EMAIL_STAGGER_JITTER_MS', 2500),
    queueLimiterMax: envInt(config, 'EMAIL_QUEUE_LIMITER_MAX', 40),
    queueLimiterDurationMs: envInt(config, 'EMAIL_QUEUE_LIMITER_DURATION_MS', 60_000),
    queueConcurrency: Math.max(1, envInt(config, 'EMAIL_QUEUE_CONCURRENCY', 2)),
  };
}

/** Minimum ms between consecutive scheduled sends from per-hour and per-minute caps. */
export function computeMinStaggerIntervalMs(cfg: EmailSendingConfig): number {
  const fromMinute =
    cfg.maxEmailsPerMinute > 0 ? Math.ceil(60_000 / cfg.maxEmailsPerMinute) : 60_000;
  const fromHour = cfg.maxEmailsPerHour > 0 ? Math.ceil(3_600_000 / cfg.maxEmailsPerHour) : 3_600_000;
  return Math.max(fromMinute, fromHour, 1);
}

/**
 * Build monotonic send times starting at baseUtc: first email at base, each next after
 * minInterval + random jitter in [0, staggerJitterMs].
 */
export function computeStaggeredSchedule(
  baseUtc: Date,
  count: number,
  cfg: EmailSendingConfig,
): Date[] {
  if (count <= 0) return [];
  const minInterval = computeMinStaggerIntervalMs(cfg);
  const jitterMax = cfg.staggerJitterMs;
  const times: Date[] = [];
  let t = baseUtc.getTime();
  for (let i = 0; i < count; i++) {
    times.push(new Date(t));
    if (i < count - 1) {
      const jitter = jitterMax > 0 ? Math.floor(Math.random() * (jitterMax + 1)) : 0;
      t += minInterval + jitter;
    }
  }
  return times;
}

export function utcDayBounds(reference: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate(), 0, 0, 0, 0),
  );
  const end = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate(), 23, 59, 59, 999),
  );
  return { start, end };
}

export function utcHourBounds(reference: Date = new Date()): { start: Date; end: Date } {
  const y = reference.getUTCFullYear();
  const m = reference.getUTCMonth();
  const d = reference.getUTCDate();
  const h = reference.getUTCHours();
  const start = new Date(Date.UTC(y, m, d, h, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, d, h, 59, 59, 999));
  return { start, end };
}

export function countJobsScheduledOnUtcDay(dates: Date[], day: Date): number {
  const { start, end } = utcDayBounds(day);
  return dates.filter((d) => d.getTime() >= start.getTime() && d.getTime() <= end.getTime()).length;
}

/** Used by EmailProcessor decorator (runs at import; mirrors EMAIL_QUEUE_CONCURRENCY / ConfigService). */
export function getQueueConcurrencyFromEnv(): number {
  const raw = process.env.EMAIL_QUEUE_CONCURRENCY;
  if (raw === undefined || raw === '') return 2;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : 2;
}

const OVERDUE_POLICIES: ReadonlySet<string> = new Set(['immediate', 'fail', 'skip_queue']);

function parseOverduePolicy(raw: string | undefined): OverdueScheduledEmailPolicy {
  if (raw && OVERDUE_POLICIES.has(raw)) {
    return raw as OverdueScheduledEmailPolicy;
  }
  return 'immediate';
}

export function getScheduleReconcileConfig(config: ConfigService): ScheduleReconcileConfig {
  const overdueRaw = config.get<string>('EMAIL_OVERDUE_SCHEDULED_POLICY');
  const intervalRaw = config.get<string>('EMAIL_SCHEDULE_RECONCILE_INTERVAL_MS');
  let periodicIntervalMs = 300_000;
  if (intervalRaw !== undefined && intervalRaw !== '') {
    const n = parseInt(intervalRaw, 10);
    if (Number.isFinite(n) && n >= 0) periodicIntervalMs = n;
  }
  return {
    overduePolicy: parseOverduePolicy(overdueRaw),
    periodicIntervalMs,
  };
}
