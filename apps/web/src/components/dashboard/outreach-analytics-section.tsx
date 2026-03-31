'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { emailJobsApi, type OutreachAnalytics } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  MessageSquareReply,
  Mail,
  Percent,
  Clock,
  XCircle,
  LayoutGrid,
  Tags,
  GitCompareArrows,
} from 'lucide-react';
import Link from 'next/link';

function pct(rate: number) {
  return `${(rate * 100).toFixed(1)}%`;
}

function templateKey(id: string | null) {
  return id ?? '__none__';
}

function findTemplateRow(data: OutreachAnalytics['byTemplate'], key: string) {
  return data.find((r) => templateKey(r.templateId) === key);
}

function findTagRow(data: OutreachAnalytics['byTag'], tag: string) {
  return data.find((r) => r.tag === tag);
}

function CompareMetric({
  label,
  sent,
  replies,
  rate,
}: {
  label: string;
  sent: number;
  replies: number;
  rate: number;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{pct(rate)}</p>
      <p className="text-xs text-muted-foreground tabular-nums">
        {replies.toLocaleString()} replies · {sent.toLocaleString()} sent
      </p>
    </div>
  );
}

export function OutreachAnalyticsSection() {
  const [trendDays, setTrendDays] = useState(30);
  const [tplA, setTplA] = useState<string | null>(null);
  const [tplB, setTplB] = useState<string | null>(null);
  const [tagA, setTagA] = useState<string | null>(null);
  const [tagB, setTagB] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['email-jobs-analytics', trendDays],
    queryFn: () => emailJobsApi.getAnalytics({ trendDays }),
  });

  const byTemplate = data?.byTemplate ?? [];
  const byTag = data?.byTag ?? [];

  useEffect(() => {
    if (!byTemplate.length) return;
    const k0 = templateKey(byTemplate[0].templateId);
    const k1 = templateKey((byTemplate[1] ?? byTemplate[0]).templateId);
    setTplA((prev) => prev ?? k0);
    setTplB((prev) => prev ?? (k1 !== k0 ? k1 : k0));
  }, [byTemplate]);

  useEffect(() => {
    if (!byTag.length) return;
    const a = byTag[0].tag;
    const b = (byTag[1] ?? byTag[0]).tag;
    setTagA((prev) => prev ?? a);
    setTagB((prev) => prev ?? (b !== a ? b : a));
  }, [byTag]);

  const tplRowA = tplA ? findTemplateRow(byTemplate, tplA) : undefined;
  const tplRowB = tplB ? findTemplateRow(byTemplate, tplB) : undefined;
  const tagRowA = tagA ? findTagRow(byTag, tagA) : undefined;
  const tagRowB = tagB ? findTagRow(byTag, tagB) : undefined;

  const trendChartData = useMemo(() => {
    const rows = data?.trends ?? [];
    return rows.map((r) => ({
      ...r,
      label: r.day.slice(5).replace('-', '/'),
    }));
  }, [data?.trends]);

  if (isError) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Could not load analytics. Try again later.
        </CardContent>
      </Card>
    );
  }

  const s = data?.summary;

  return (
    <section className="space-y-4" aria-label="Outreach analytics">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Analytics</h2>
          <p className="text-sm text-muted-foreground">
            Reply rates by template and contact tags. Sync replies from Gmail on the{' '}
            <Link href="/dashboard/history" className="text-primary underline-offset-4 hover:underline">
              history
            </Link>{' '}
            page for up-to-date counts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Trend window</span>
          <Select
            value={String(trendDays)}
            onValueChange={(v) => setTrendDays(parseInt(v, 10) || 30)}
            disabled={isLoading}
          >
            <SelectTrigger className="h-9 w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="14">14 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="60">60 days</SelectItem>
              <SelectItem value="90">90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card className="shadow-none">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">Emails sent</p>
              <Mail className="h-4 w-4 text-muted-foreground opacity-70" />
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {isLoading ? '—' : (s?.sent ?? 0).toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">Replies</p>
              <MessageSquareReply className="h-4 w-4 text-muted-foreground opacity-70" />
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {isLoading ? '—' : (s?.replied ?? 0).toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">Reply rate</p>
              <Percent className="h-4 w-4 text-muted-foreground opacity-70" />
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {isLoading ? '—' : s ? pct(s.replyRate) : '—'}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">Scheduled</p>
              <Clock className="h-4 w-4 text-muted-foreground opacity-70" />
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {isLoading ? '—' : (s?.scheduled ?? 0).toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">Failed</p>
              <XCircle className="h-4 w-4 text-muted-foreground opacity-70" />
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {isLoading ? '—' : (s?.failed ?? 0).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Templates */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <LayoutGrid className="h-4 w-4" />
              Template performance
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Sent and replied jobs only. &ldquo;Custom&rdquo; means no template id on the job.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : byTemplate.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sent emails yet to analyze.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 pr-3 font-medium text-muted-foreground">Template</th>
                      <th className="pb-2 pr-3 font-medium text-muted-foreground tabular-nums">Sent</th>
                      <th className="pb-2 pr-3 font-medium text-muted-foreground tabular-nums">Replies</th>
                      <th className="pb-2 font-medium text-muted-foreground tabular-nums">Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {byTemplate.map((row) => (
                      <tr key={templateKey(row.templateId)} className="hover:bg-muted/30">
                        <td className="py-2 pr-3 font-medium">{row.templateName}</td>
                        <td className="py-2 pr-3 tabular-nums text-muted-foreground">{row.sent}</td>
                        <td className="py-2 pr-3 tabular-nums text-muted-foreground">{row.replies}</td>
                        <td className="py-2 tabular-nums">{pct(row.replyRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {byTemplate.length >= 1 && (
              <div className="space-y-3 rounded-lg border border-dashed bg-muted/10 p-3">
                <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <GitCompareArrows className="h-3.5 w-3.5" />
                  Compare templates
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select value={tplA ?? ''} onValueChange={setTplA}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Template A" />
                    </SelectTrigger>
                    <SelectContent>
                      {byTemplate.map((row) => (
                        <SelectItem key={`a-${templateKey(row.templateId)}`} value={templateKey(row.templateId)}>
                          {row.templateName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={tplB ?? ''} onValueChange={setTplB}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Template B" />
                    </SelectTrigger>
                    <SelectContent>
                      {byTemplate.map((row) => (
                        <SelectItem key={`b-${templateKey(row.templateId)}`} value={templateKey(row.templateId)}>
                          {row.templateName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <CompareMetric
                    label={tplRowA?.templateName ?? 'A'}
                    sent={tplRowA?.sent ?? 0}
                    replies={tplRowA?.replies ?? 0}
                    rate={tplRowA?.replyRate ?? 0}
                  />
                  <CompareMetric
                    label={tplRowB?.templateName ?? 'B'}
                    sent={tplRowB?.sent ?? 0}
                    replies={tplRowB?.replies ?? 0}
                    rate={tplRowB?.replyRate ?? 0}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tags / audience */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Tags className="h-4 w-4" />
              Audience by contact tags
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Uses each contact&apos;s tags (e.g. HR, Technical). Jobs with multiple tags count toward each tag.
              Untagged contacts appear as &ldquo;(untagged)&rdquo;.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : byTag.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tag data for sent emails yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 pr-3 font-medium text-muted-foreground">Tag</th>
                      <th className="pb-2 pr-3 font-medium text-muted-foreground tabular-nums">Sent</th>
                      <th className="pb-2 pr-3 font-medium text-muted-foreground tabular-nums">Replies</th>
                      <th className="pb-2 font-medium text-muted-foreground tabular-nums">Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {byTag.map((row) => (
                      <tr key={row.tag} className="hover:bg-muted/30">
                        <td className="py-2 pr-3 font-medium">{row.tag}</td>
                        <td className="py-2 pr-3 tabular-nums text-muted-foreground">{row.sent}</td>
                        <td className="py-2 pr-3 tabular-nums text-muted-foreground">{row.replies}</td>
                        <td className="py-2 tabular-nums">{pct(row.replyRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {byTag.length >= 1 && (
              <div className="space-y-3 rounded-lg border border-dashed bg-muted/10 p-3">
                <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <GitCompareArrows className="h-3.5 w-3.5" />
                  Compare tags
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select value={tagA ?? ''} onValueChange={setTagA}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Tag A" />
                    </SelectTrigger>
                    <SelectContent>
                      {byTag.map((row) => (
                        <SelectItem key={`ta-${row.tag}`} value={row.tag}>
                          {row.tag}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={tagB ?? ''} onValueChange={setTagB}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Tag B" />
                    </SelectTrigger>
                    <SelectContent>
                      {byTag.map((row) => (
                        <SelectItem key={`tb-${row.tag}`} value={row.tag}>
                          {row.tag}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <CompareMetric
                    label={tagRowA?.tag ?? 'A'}
                    sent={tagRowA?.sent ?? 0}
                    replies={tagRowA?.replies ?? 0}
                    rate={tagRowA?.replyRate ?? 0}
                  />
                  <CompareMetric
                    label={tagRowB?.tag ?? 'B'}
                    sent={tagRowB?.sent ?? 0}
                    replies={tagRowB?.replies ?? 0}
                    rate={tagRowB?.replyRate ?? 0}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trends */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Activity trend</CardTitle>
          <p className="text-xs text-muted-foreground">
            Daily emails sent and replies detected (last {data?.trendDays ?? trendDays} days, UTC).
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">Loading…</div>
          ) : trendChartData.length === 0 ? (
            <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
              No sent email dates in this range yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendChartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" className="text-xs" tick={{ fontSize: 11 }} />
                <YAxis className="text-xs" tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  labelFormatter={(_label, items) => {
                    const p = items?.[0]?.payload as { day?: string } | undefined;
                    return p?.day ?? '';
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line
                  type="monotone"
                  dataKey="sent"
                  name="Sent"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="replies"
                  name="Replies"
                  stroke="rgb(34 197 94)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
