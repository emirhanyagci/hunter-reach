'use client';
import { useState, useCallback } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { emailJobsApi, campaignsApi, templatesApi } from '@/lib/api';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '@/components/email-jobs/status-badge';
import { SendReminderModal } from '@/components/email-jobs/send-reminder-modal';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDate } from '@/lib/utils';
import {
  History,
  Eye,
  Mail,
  Search,
  Bell,
  Filter,
  X,
  MessageSquare,
  Calendar,
  Zap,
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useGmailReplySync } from '@/hooks/use-gmail-reply-sync';
import { GmailThreadDialog } from '@/components/email-jobs/gmail-thread-dialog';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'SENT', label: 'Sent' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'NOT_REPLIED', label: 'Sent — Not replied' },
  { value: 'REPLIED', label: 'Replied' },
];

export default function HistoryPage() {
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reminderOpen, setReminderOpen] = useState(false);
  const [sendNowConfirm, setSendNowConfirm] = useState<any>(null);
  const [gmailThreadOpen, setGmailThreadOpen] = useState(false);
  const [gmailThreadJobId, setGmailThreadJobId] = useState<string | null>(null);

  // Filters
  const [status, setStatus] = useState('all');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const hasFilters = status !== 'all' || email || company || campaignId || templateId || dateFrom || dateTo;

  const { data, isLoading } = useQuery({
    queryKey: ['email-history', { status, email, company, campaignId, templateId, dateFrom, dateTo, page }],
    queryFn: () =>
      emailJobsApi.getAll({
        status: status === 'all' ? undefined : status,
        email: email || undefined,
        company: company || undefined,
        campaignId: campaignId || undefined,
        templateId: templateId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page,
        limit: 50,
      }),
  });

  const { data: campaigns } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => campaignsApi.getAll(),
  });

  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: () => templatesApi.getAll(),
  });

  const jobs: any[] = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const campaignList: any[] = campaigns ?? [];
  const templateList: any[] = templates ?? [];

  // Only sent + unreplied jobs can be selected for reminders
  const eligibleForReminder = (job: any) =>
    job.status === 'SENT' && (job.replyCount ?? 0) === 0;

  const eligibleJobs = jobs.filter(eligibleForReminder);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selectedIds.size === eligibleJobs.length && eligibleJobs.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(eligibleJobs.map((j) => j.id)));
    }
  }, [selectedIds.size, eligibleJobs]);

  const sendNowMutation = useMutation({
    mutationFn: (id: string) => emailJobsApi.sendNow(id),
    onSuccess: async (_, id) => {
      await queryClient.invalidateQueries({ queryKey: ['email-history'] });
      await queryClient.invalidateQueries({ queryKey: ['email-jobs'] });
      await queryClient.invalidateQueries({ queryKey: ['recent-email-jobs'] });
      setSendNowConfirm(null);
      const fresh = await emailJobsApi.getOne(id);
      setSelectedJob((prev: any) => (prev?.id === id ? fresh : prev));
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.message ??
        (Array.isArray(err?.response?.data?.message) ? err.response.data.message[0] : null) ??
        err?.message ??
        'Failed to send';
      window.alert(msg);
    },
  });

  const {
    syncReplies,
    isSyncPending,
    progressLabel,
    banner: syncBanner,
    dismissBanner: dismissSyncBanner,
    backgroundState,
  } = useGmailReplySync({
    successBanner: true,
    backgroundOnMount: true,
  });

  const canSendNow = (job: any) => job?.status === 'SCHEDULED';

  const hasReplied = (job: any) => (job?.replyCount ?? 0) > 0 || job?.status === 'REPLIED';

  const canOpenGmailThread = (job: any) =>
    hasReplied(job) && !!job?.threadId && (job.status === 'SENT' || job.status === 'REPLIED');

  const openGmailThread = (jobId: string) => {
    setGmailThreadJobId(jobId);
    setGmailThreadOpen(true);
  };

  const clearFilters = () => {
    setStatus('all');
    setEmail('');
    setCompany('');
    setCampaignId('');
    setTemplateId('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {syncBanner && (
        <div
          className={`flex items-center gap-3 rounded-lg border p-3 text-sm ${
            syncBanner.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200'
              : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
          }`}
        >
          {syncBanner.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          )}
          <p className="flex-1">{syncBanner.msg}</p>
          <button
            type="button"
            className="text-xs underline opacity-70 hover:opacity-100 shrink-0"
            onClick={() => dismissSyncBanner()}
          >
            Dismiss
          </button>
        </div>
      )}
      {isSyncPending && (
        <p className="text-sm text-muted-foreground flex items-center gap-2 sm:hidden" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          {progressLabel}
        </p>
      )}
      <PageHeader
        title="Email History"
        description={`${total.toLocaleString()} emails`}
        actions={
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <Button
                size="sm"
                onClick={() => setReminderOpen(true)}
                className="gap-2"
              >
                <Bell className="h-4 w-4" />
                Send Reminder ({selectedIds.size})
              </Button>
            )}
            <Button
              variant={showFilters ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-2"
            >
              <Filter className="h-4 w-4" />
              Filters
              {hasFilters && (
                <span className="ml-1 rounded-full bg-primary/20 px-1.5 py-0.5 text-xs font-medium">
                  {[status !== 'all', email, company, campaignId, templateId, dateFrom, dateTo].filter(Boolean).length}
                </span>
              )}
            </Button>
            {backgroundState === 'syncing' && !isSyncPending && (
              <span
                className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground max-w-[11rem]"
                aria-live="polite"
              >
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                Checking Gmail…
              </span>
            )}
            {backgroundState === 'done' && !isSyncPending && (
              <span className="hidden sm:inline text-xs text-muted-foreground" aria-live="polite">
                Replies checked
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-2 max-sm:max-w-[10rem]"
              title="Fetch reply state from Gmail threads"
              disabled={isSyncPending}
              onClick={() => syncReplies()}
            >
              {isSyncPending ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 shrink-0" />
              )}
              <span className="truncate">{isSyncPending ? progressLabel : 'Sync replies'}</span>
            </Button>
          </div>
        }
      />

      {/* Filters panel */}
      {showFilters && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-wrap gap-3">
              <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); setSelectedIds(new Set()); }}>
                <SelectTrigger className="w-52">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="relative flex-1 min-w-40">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Filter by email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setPage(1); }}
                  className="pl-9"
                />
              </div>

              <Input
                placeholder="Company"
                value={company}
                onChange={(e) => { setCompany(e.target.value); setPage(1); }}
                className="w-40"
              />

              <Select value={campaignId} onValueChange={(v) => { setCampaignId(v === 'all' ? '' : v); setPage(1); }}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Campaign" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All campaigns</SelectItem>
                  {campaignList.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={templateId} onValueChange={(v) => { setTemplateId(v === 'all' ? '' : v); setPage(1); }}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All templates</SelectItem>
                  {templateList.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground whitespace-nowrap">Date from</label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                  className="w-40"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground whitespace-nowrap">to</label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                  className="w-40"
                />
              </div>
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
                  <X className="h-3.5 w-3.5" />
                  Clear all
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reminder hint for not-replied filter */}
      {(status === 'NOT_REPLIED' || selectedIds.size > 0) && eligibleJobs.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm">
          <span className="text-orange-700">
            {selectedIds.size > 0
              ? `${selectedIds.size} contact${selectedIds.size !== 1 ? 's' : ''} selected for reminder`
              : `${eligibleJobs.length} contact${eligibleJobs.length !== 1 ? 's' : ''} on this page have not replied`}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="border-orange-300 text-orange-700 hover:bg-orange-100"
            onClick={() => {
              if (selectedIds.size === 0) {
                setSelectedIds(new Set(eligibleJobs.map((j) => j.id)));
              } else {
                setReminderOpen(true);
              }
            }}
          >
            <Bell className="mr-1.5 h-3.5 w-3.5" />
            {selectedIds.size > 0 ? 'Send Reminder' : 'Select All & Remind'}
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <History className="mb-3 h-12 w-12 opacity-20" />
              <p className="text-lg font-medium">No emails found</p>
              <p className="text-sm">{hasFilters ? 'Try adjusting your filters' : 'Sent emails will appear here'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="p-4">
                      <Checkbox
                        checked={selectedIds.size === eligibleJobs.length && eligibleJobs.length > 0}
                        onCheckedChange={toggleAll}
                        disabled={eligibleJobs.length === 0}
                        title="Select all eligible for reminder"
                      />
                    </th>
                    <th className="p-4 text-left font-medium text-muted-foreground">Recipient</th>
                    <th className="p-4 text-left font-medium text-muted-foreground">Company</th>
                    <th className="p-4 text-left font-medium text-muted-foreground">Subject</th>
                    <th className="p-4 text-left font-medium text-muted-foreground">Campaign</th>
                    <th className="p-4 text-left font-medium text-muted-foreground">Template</th>
                    <th className="p-4 text-left font-medium text-muted-foreground">Status</th>
                    <th className="p-4 text-left font-medium text-muted-foreground">Reply</th>
                    <th className="p-4 text-left font-medium text-muted-foreground">Sent at</th>
                    <th className="p-4 text-left font-medium text-muted-foreground w-24">Thread</th>
                    <th className="p-4" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {jobs.map((job: any) => {
                    const canSelect = eligibleForReminder(job);
                    const isSelected = selectedIds.has(job.id);
                    const rowHasReplied = hasReplied(job);

                    return (
                      <tr
                        key={job.id}
                        className={`transition-colors hover:bg-muted/30 ${isSelected ? 'bg-primary/5' : ''}`}
                      >
                        <td className="p-4">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => canSelect && toggleSelect(job.id)}
                            disabled={!canSelect}
                            title={canSelect ? 'Select for reminder' : 'Cannot select: already replied or not sent'}
                          />
                        </td>
                        <td className="p-4">
                          <p className="font-medium">{job.contact?.email}</p>
                          <p className="text-xs text-muted-foreground">
                            {[job.contact?.firstName, job.contact?.lastName].filter(Boolean).join(' ')}
                          </p>
                        </td>
                        <td className="p-4 text-muted-foreground text-xs">{job.contact?.company || '—'}</td>
                        <td className="max-w-xs p-4">
                          <p className="truncate text-xs">{job.renderedSubject}</p>
                          {job.isReminder && (
                            <span className="text-xs text-blue-500 font-medium">Reminder</span>
                          )}
                        </td>
                        <td className="p-4 text-xs text-muted-foreground">{job.campaign?.name || '—'}</td>
                        <td className="p-4 text-xs text-muted-foreground">{job.template?.name || '—'}</td>
                        <td className="p-4">
                          <div className="flex flex-col gap-1">
                            <StatusBadge status={job.status} />
                            {job.status === 'SENT' && job.manualSendTriggeredAt && (
                              <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400">
                                Sent early (Send Now)
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-4">
                          {rowHasReplied ? (
                            <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                              <MessageSquare className="h-3 w-3" />
                              {job.replyCount} repl{job.replyCount !== 1 ? 'ies' : 'y'}
                            </span>
                          ) : job.status === 'SENT' ? (
                            <span className="text-xs text-muted-foreground">No reply</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                          {job.lastRepliedAt && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              <Calendar className="h-3 w-3 inline mr-0.5" />
                              {formatDate(job.lastRepliedAt)}
                            </p>
                          )}
                        </td>
                        <td className="p-4 text-xs text-muted-foreground">
                          {job.sentAt ? (
                            formatDate(job.sentAt)
                          ) : job.status === 'SCHEDULED' && job.scheduledAt ? (
                            <span>
                              <span className="text-blue-600 dark:text-blue-400">Scheduled</span>
                              <br />
                              {formatDate(job.scheduledAt)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="p-4">
                          {canOpenGmailThread(job) ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1 text-xs"
                              onClick={() => openGmailThread(job.id)}
                              title="View full Gmail conversation"
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                              View
                            </Button>
                          ) : rowHasReplied && !job.threadId ? (
                            <span className="text-[10px] text-muted-foreground leading-tight block max-w-[5rem]">
                              Sync to link thread
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-0.5">
                            {canSendNow(job) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:text-amber-400 dark:hover:bg-amber-950"
                                onClick={() => setSendNowConfirm(job)}
                                title="Send now (skip schedule)"
                                disabled={sendNowMutation.isPending}
                              >
                                <Zap className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setSelectedJob(job)}
                              title="View details"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t p-4">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages} · {total.toLocaleString()} total
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Email detail dialog */}
      <Dialog open={!!selectedJob} onOpenChange={() => setSelectedJob(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email Details
            </DialogTitle>
          </DialogHeader>
          {selectedJob && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div><p className="font-medium text-muted-foreground">To</p><p>{selectedJob.contact?.email}</p></div>
                <div><p className="font-medium text-muted-foreground">Company</p><p>{selectedJob.contact?.company || '—'}</p></div>
                <div><p className="font-medium text-muted-foreground">Campaign</p><p>{selectedJob.campaign?.name || '—'}</p></div>
                <div><p className="font-medium text-muted-foreground">Template</p><p>{selectedJob.template?.name || '—'}</p></div>
                <div>
                  <p className="font-medium text-muted-foreground">Planned send</p>
                  <p>{selectedJob.scheduledAt ? formatDate(selectedJob.scheduledAt) : '—'}</p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Sent</p>
                  <p>{selectedJob.sentAt ? formatDate(selectedJob.sentAt) : '—'}</p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Status</p>
                  <div className="flex flex-col gap-1">
                    <StatusBadge status={selectedJob.status} />
                    {selectedJob.status === 'SENT' && selectedJob.manualSendTriggeredAt && (
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                        Sent early via Send Now (before planned time)
                      </span>
                    )}
                  </div>
                </div>
                {hasReplied(selectedJob) && (
                  <>
                    <div>
                      <p className="font-medium text-muted-foreground">Replies</p>
                      <p className="flex items-center gap-1 text-green-600">
                        <MessageSquare className="h-3.5 w-3.5" />
                        {selectedJob.replyCount} repl{selectedJob.replyCount !== 1 ? 'ies' : 'y'}
                      </p>
                    </div>
                    {selectedJob.lastRepliedAt && (
                      <div>
                        <p className="font-medium text-muted-foreground">Last reply</p>
                        <p>{formatDate(selectedJob.lastRepliedAt)}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
              {canOpenGmailThread(selectedJob) && (
                <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                  <p className="font-medium text-sm">Gmail conversation</p>
                  <p className="text-xs text-muted-foreground">
                    Open the full thread with timestamps and everything the contact wrote.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    className="gap-2"
                    onClick={() => {
                      openGmailThread(selectedJob.id);
                    }}
                  >
                    <MessageSquare className="h-4 w-4" />
                    View full thread
                  </Button>
                </div>
              )}
              {hasReplied(selectedJob) && !selectedJob.threadId && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-900 p-3 text-xs text-amber-900 dark:text-amber-200">
                  Replies are detected, but this send is not linked to a Gmail thread yet. Connect Gmail and run{' '}
                  <strong>Sync replies</strong> in Settings, then open this record again.
                </div>
              )}
              <div>
                <p className="mb-1 font-medium text-muted-foreground">Subject</p>
                <p className="rounded-lg bg-muted/50 p-3">{selectedJob.renderedSubject}</p>
              </div>
              <div>
                <p className="mb-1 font-medium text-muted-foreground">Email Body</p>
                <div
                  className="max-h-64 overflow-y-auto rounded-xl border bg-white p-4 shadow-inner prose prose-sm"
                  dangerouslySetInnerHTML={{ __html: selectedJob.renderedBodyHtml }}
                />
              </div>
              {selectedJob.events?.length > 0 && (
                <div>
                  <p className="mb-2 font-medium text-muted-foreground">Delivery Events</p>
                  <div className="space-y-2">
                    {selectedJob.events.map((e: any) => (
                      <div key={e.id} className="flex items-center justify-between rounded-lg bg-muted/50 p-2">
                        <StatusBadge status={e.eventType} />
                        <span className="text-xs text-muted-foreground">{formatDate(e.occurredAt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {canSendNow(selectedJob) && (
                <div className="border-t pt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
                    onClick={() => {
                      setSendNowConfirm(selectedJob);
                      setSelectedJob(null);
                    }}
                    disabled={sendNowMutation.isPending}
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Send Now
                  </Button>
                  <p className="w-full text-xs text-muted-foreground">
                    Sends immediately and skips the scheduled time ({selectedJob.scheduledAt ? formatDate(selectedJob.scheduledAt) : ''}).
                  </p>
                </div>
              )}
              {eligibleForReminder(selectedJob) && (
                <div className="border-t pt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedIds(new Set([selectedJob.id]));
                      setSelectedJob(null);
                      setReminderOpen(true);
                    }}
                    className="gap-2"
                  >
                    <Bell className="h-3.5 w-3.5" />
                    Send Reminder to this contact
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <GmailThreadDialog
        jobId={gmailThreadJobId}
        open={gmailThreadOpen}
        onOpenChange={(next) => {
          setGmailThreadOpen(next);
          if (!next) setGmailThreadJobId(null);
        }}
      />

      <SendReminderModal
        open={reminderOpen}
        onOpenChange={setReminderOpen}
        selectedJobIds={[...selectedIds]}
        onSuccess={() => {
          setSelectedIds(new Set());
          queryClient.invalidateQueries({ queryKey: ['email-history'] });
        }}
      />

      <Dialog open={!!sendNowConfirm} onOpenChange={(open) => !open && setSendNowConfirm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-600" />
              Send this email now?
            </DialogTitle>
          </DialogHeader>
          {sendNowConfirm && (
            <div className="space-y-4 text-sm">
              <p>
                This message was planned for{' '}
                <strong>{sendNowConfirm.scheduledAt ? formatDate(sendNowConfirm.scheduledAt) : 'a later time'}</strong>.
                It will be sent immediately to <strong>{sendNowConfirm.contact?.email}</strong>.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setSendNowConfirm(null)} disabled={sendNowMutation.isPending}>
                  Cancel
                </Button>
                <Button
                  className="gap-2 bg-amber-600 hover:bg-amber-700"
                  onClick={() => sendNowMutation.mutate(sendNowConfirm.id)}
                  disabled={sendNowMutation.isPending}
                >
                  {sendNowMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4" />
                      Send now
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
