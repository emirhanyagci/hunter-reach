'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Gauge, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CampaignSendingLimits } from '@/lib/api';

export type SendingLimitsUsageData = Pick<
  CampaignSendingLimits,
  | 'maxEmailsPerDay'
  | 'maxEmailsPerHour'
  | 'sentTodayUtc'
  | 'pendingScheduledTodayUtc'
  | 'remainingQuotaTodayUtc'
  | 'sentThisHourUtc'
  | 'pendingScheduledThisHourUtc'
  | 'remainingQuotaHourUtc'
>;

/** Backend or cached responses may omit fields; avoid runtime errors on formatters. */
function nz(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return 0;
}

function usageTone(used: number, limit: number): 'ok' | 'warn' | 'critical' {
  if (limit <= 0) return 'ok';
  const ratio = used / limit;
  if (ratio >= 1) return 'critical';
  if (ratio >= 0.9) return 'critical';
  if (ratio >= 0.75) return 'warn';
  return 'ok';
}

function BarRow({
  title,
  sent,
  pending,
  limit,
  remaining,
}: {
  title: string;
  sent: number;
  pending: number;
  limit: number;
  remaining: number;
}) {
  const s = nz(sent);
  const p = nz(pending);
  const lim = nz(limit);
  const rem = nz(remaining);
  const used = s + p;
  const pct = lim > 0 ? Math.min(100, (used / lim) * 100) : 0;
  const tone = usageTone(used, lim);
  const atCap = lim > 0 && used >= lim;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <span
          className={cn(
            'text-xs tabular-nums text-muted-foreground',
            atCap && 'font-semibold text-destructive',
            !atCap && tone === 'critical' && 'font-medium text-amber-600 dark:text-amber-500',
            !atCap && tone === 'warn' && 'text-amber-700/90 dark:text-amber-400',
          )}
        >
          {used.toLocaleString()} / {lim.toLocaleString()} toward limit · {rem.toLocaleString()} left
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            atCap && 'bg-destructive',
            !atCap && tone === 'critical' && 'bg-amber-500',
            !atCap && tone === 'warn' && 'bg-amber-400',
            !atCap && tone === 'ok' && 'bg-primary',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {s.toLocaleString()} sent
        {p > 0 ? ` · ${p.toLocaleString()} queued` : ''}
      </p>
      {atCap && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Limit reached for this window. Wait or adjust scheduling.
        </p>
      )}
      {!atCap && tone === 'critical' && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Almost at the limit.
        </p>
      )}
    </div>
  );
}

export function SendingLimitUsage({ data }: { data: SendingLimitsUsageData }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="h-5 w-5 text-muted-foreground" />
          Sending capacity
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Limits use UTC (same as the server). Usage counts sent mail plus jobs scheduled in each window.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <BarRow
          title="Today (UTC day)"
          sent={nz(data.sentTodayUtc)}
          pending={nz(data.pendingScheduledTodayUtc)}
          limit={nz(data.maxEmailsPerDay)}
          remaining={nz(data.remainingQuotaTodayUtc)}
        />
        <BarRow
          title="This hour (UTC)"
          sent={nz(data.sentThisHourUtc)}
          pending={nz(data.pendingScheduledThisHourUtc)}
          limit={nz(data.maxEmailsPerHour)}
          remaining={nz(data.remainingQuotaHourUtc)}
        />
      </CardContent>
    </Card>
  );
}
