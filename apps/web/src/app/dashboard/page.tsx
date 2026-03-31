'use client';
import { useQuery } from '@tanstack/react-query';
import { campaignsApi, contactsApi, emailJobsApi, type CampaignSendingLimits } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/page-header';
import { StatusBadge } from '@/components/email-jobs/status-badge';
import { formatDate, formatRelative } from '@/lib/utils';
import {
  Users, Send, Clock, CheckCircle2, XCircle, BarChart3,
  TrendingUp, Mail, AlertTriangle,
} from 'lucide-react';
import { SendingLimitUsage } from '@/components/dashboard/sending-limit-usage';
import { OutreachAnalyticsSection } from '@/components/dashboard/outreach-analytics-section';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function DashboardPage() {
  const { data: campaignStats } = useQuery({
    queryKey: ['campaign-stats'],
    queryFn: campaignsApi.getStats,
  });

  const { data: contactStats } = useQuery({
    queryKey: ['contact-stats'],
    queryFn: contactsApi.getStats,
  });

  const { data: recentJobs } = useQuery({
    queryKey: ['recent-email-jobs'],
    queryFn: () => emailJobsApi.getAll({ limit: 8 }),
  });

  const { data: campaigns } = useQuery({
    queryKey: ['campaigns'],
    queryFn: campaignsApi.getAll,
  });

  const { data: sendingLimits } = useQuery<CampaignSendingLimits>({
    queryKey: ['campaign-sending-limits'],
    queryFn: campaignsApi.getSendingLimits,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const emailStats = campaignStats?.emails || [];
  const sentCount = emailStats.find((e: any) => e.status === 'SENT')?._count || 0;
  const scheduledCount = emailStats.find((e: any) => e.status === 'SCHEDULED')?._count || 0;
  const failedCount = emailStats.find((e: any) => e.status === 'FAILED')?._count || 0;
  const processingCount = emailStats.find((e: any) => e.status === 'PROCESSING')?._count || 0;

  const chartData = emailStats.map((e: any) => ({
    name: e.status.charAt(0) + e.status.slice(1).toLowerCase(),
    count: e._count,
  }));

  const stats = [
    {
      title: 'Total Contacts',
      value: contactStats?.total || 0,
      sub: `${contactStats?.valid || 0} valid`,
      icon: Users,
      color: 'text-blue-600',
      bg: 'bg-blue-50 dark:bg-blue-950',
    },
    {
      title: 'Emails Sent',
      value: sentCount,
      sub: `${processingCount} processing`,
      icon: CheckCircle2,
      color: 'text-green-600',
      bg: 'bg-green-50 dark:bg-green-950',
    },
    {
      title: 'Scheduled',
      value: scheduledCount,
      sub: 'queued to send',
      icon: Clock,
      color: 'text-orange-600',
      bg: 'bg-orange-50 dark:bg-orange-950',
    },
    {
      title: 'Failed',
      value: failedCount,
      sub: 'need attention',
      icon: AlertTriangle,
      color: 'text-red-600',
      bg: 'bg-red-50 dark:bg-red-950',
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="Overview of your email campaigns and sending activity"
        actions={
          <Link href="/dashboard/campaigns/new">
            <Button>
              <Send className="mr-2 h-4 w-4" />
              New Campaign
            </Button>
          </Link>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="overflow-hidden">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                  <p className="mt-2 text-3xl font-bold">{stat.value.toLocaleString()}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{stat.sub}</p>
                </div>
                <div className={`rounded-xl p-3 ${stat.bg}`}>
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {sendingLimits && (
        <SendingLimitUsage
          data={{
            maxEmailsPerDay: sendingLimits.maxEmailsPerDay,
            maxEmailsPerHour: sendingLimits.maxEmailsPerHour,
            sentTodayUtc: sendingLimits.sentTodayUtc,
            pendingScheduledTodayUtc: sendingLimits.pendingScheduledTodayUtc,
            remainingQuotaTodayUtc: sendingLimits.remainingQuotaTodayUtc,
            sentThisHourUtc: sendingLimits.sentThisHourUtc,
            pendingScheduledThisHourUtc: sendingLimits.pendingScheduledThisHourUtc,
            remainingQuotaHourUtc: sendingLimits.remainingQuotaHourUtc,
          }}
        />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Email status chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Email Status Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} barSize={40}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[220px] items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Mail className="mx-auto mb-2 h-10 w-10 opacity-20" />
                  <p className="text-sm">No emails sent yet</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent campaigns */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Recent Campaigns
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {campaigns?.slice(0, 5).map((c: any) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{formatRelative(c.createdAt)}</p>
                </div>
                <StatusBadge status={c.status} />
              </div>
            )) || (
              <p className="text-center text-sm text-muted-foreground py-4">No campaigns yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      <OutreachAnalyticsSection />

      {/* Recent email jobs */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Recent Email Activity
          </CardTitle>
          <Link href="/dashboard/history">
            <Button variant="ghost" size="sm">View all</Button>
          </Link>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-3 pr-4 font-medium text-muted-foreground">Recipient</th>
                  <th className="pb-3 pr-4 font-medium text-muted-foreground">Subject</th>
                  <th className="pb-3 pr-4 font-medium text-muted-foreground">Status</th>
                  <th className="pb-3 font-medium text-muted-foreground">Scheduled</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recentJobs?.data?.map((job: any) => (
                  <tr key={job.id} className="hover:bg-muted/30">
                    <td className="py-3 pr-4">
                      <p className="font-medium">{job.contact?.email}</p>
                      <p className="text-xs text-muted-foreground">{job.contact?.company}</p>
                    </td>
                    <td className="py-3 pr-4 max-w-xs">
                      <p className="truncate">{job.renderedSubject}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="py-3 text-muted-foreground">{formatDate(job.scheduledAt)}</td>
                  </tr>
                )) || (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-muted-foreground">
                      No email activity yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
