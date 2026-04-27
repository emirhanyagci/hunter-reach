'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { emailJobsApi, campaignsApi, templatesApi } from '@/lib/api';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/email-jobs/status-badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatDate } from '@/lib/utils';
import { Clock, XCircle, RefreshCw, Eye, Mail, Search, Filter, X } from 'lucide-react';

const DEFAULT_STATUS = 'SCHEDULED';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'SENT', label: 'Sent' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'NOT_REPLIED', label: 'Sent — Not replied' },
  { value: 'REPLIED', label: 'Replied' },
];

export default function ScheduledPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState(DEFAULT_STATUS);
  const [email, setEmail] = useState('');
  const [contactName, setContactName] = useState('');
  const [company, setCompany] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [scheduledDateFrom, setScheduledDateFrom] = useState('');
  const [scheduledDateTo, setScheduledDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedJob, setSelectedJob] = useState<any>(null);

  const statusIsDefault = status === DEFAULT_STATUS;
  const hasFilters =
    !statusIsDefault ||
    !!email ||
    !!contactName ||
    !!company ||
    !!campaignId ||
    !!templateId ||
    !!scheduledDateFrom ||
    !!scheduledDateTo;

  const activeFilterCount = [
    !statusIsDefault,
    email,
    contactName,
    company,
    campaignId,
    templateId,
    scheduledDateFrom,
    scheduledDateTo,
  ].filter(Boolean).length;

  const { data, isLoading, refetch } = useQuery({
    queryKey: [
      'email-jobs',
      {
        status,
        email,
        contactName,
        company,
        campaignId,
        templateId,
        scheduledDateFrom,
        scheduledDateTo,
        page,
      },
    ],
    queryFn: () =>
      emailJobsApi.getAll({
        status: status === 'all' ? undefined : status,
        email: email || undefined,
        contactName: contactName || undefined,
        company: company || undefined,
        campaignId: campaignId || undefined,
        templateId: templateId || undefined,
        scheduledDateFrom: scheduledDateFrom || undefined,
        scheduledDateTo: scheduledDateTo || undefined,
        page,
        limit: 25,
      }),
    refetchInterval: 10_000,
  });

  const { data: campaigns } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => campaignsApi.getAll(),
  });

  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: () => templatesApi.getAll(),
  });

  const cancelMutation = useMutation({
    mutationFn: emailJobsApi.cancel,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['email-jobs'] }),
  });

  const retryMutation = useMutation({
    mutationFn: emailJobsApi.retry,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['email-jobs'] }),
  });

  const jobs = data?.data || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;
  const campaignList: any[] = campaigns ?? [];
  const templateList: any[] = templates ?? [];

  const clearFilters = () => {
    setStatus(DEFAULT_STATUS);
    setEmail('');
    setContactName('');
    setCompany('');
    setCampaignId('');
    setTemplateId('');
    setScheduledDateFrom('');
    setScheduledDateTo('');
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scheduled Emails"
        description={`${total.toLocaleString()} jobs · monitor and manage email jobs`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
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
                  {activeFilterCount}
                </span>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        }
      />

      {showFilters && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap gap-3">
              <Select
                value={status}
                onValueChange={(v) => {
                  setStatus(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-52">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="relative min-w-40 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setPage(1);
                  }}
                  className="pl-9"
                />
              </div>

              <Input
                placeholder="Contact name"
                value={contactName}
                onChange={(e) => {
                  setContactName(e.target.value);
                  setPage(1);
                }}
                className="min-w-36 w-44"
              />

              <Input
                placeholder="Company"
                value={company}
                onChange={(e) => {
                  setCompany(e.target.value);
                  setPage(1);
                }}
                className="w-40"
              />

              <Select
                value={campaignId || 'all'}
                onValueChange={(v) => {
                  setCampaignId(v === 'all' ? '' : v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Campaign" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All campaigns</SelectItem>
                  {campaignList.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={templateId || 'all'}
                onValueChange={(v) => {
                  setTemplateId(v === 'all' ? '' : v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All templates</SelectItem>
                  {templateList.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="whitespace-nowrap text-sm text-muted-foreground">Scheduled from</label>
                <Input
                  type="date"
                  value={scheduledDateFrom}
                  onChange={(e) => {
                    setScheduledDateFrom(e.target.value);
                    setPage(1);
                  }}
                  className="w-40"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="whitespace-nowrap text-sm text-muted-foreground">to</label>
                <Input
                  type="date"
                  value={scheduledDateTo}
                  onChange={(e) => {
                    setScheduledDateTo(e.target.value);
                    setPage(1);
                  }}
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

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Clock className="mb-3 h-12 w-12 opacity-20" />
              <p className="text-lg font-medium">No email jobs found</p>
              <p className="text-sm">
                {hasFilters ? 'Try adjusting your filters' : 'No emails match the current view'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="p-4 text-left font-medium text-muted-foreground">Recipient</th>
                    <th className="p-4 text-left font-medium text-muted-foreground">Campaign</th>
                    <th className="p-4 text-left font-medium text-muted-foreground">Subject</th>
                    <th className="p-4 text-left font-medium text-muted-foreground">Status</th>
                    <th className="p-4 text-left font-medium text-muted-foreground">Scheduled</th>
                    <th className="p-4 text-left font-medium text-muted-foreground">Sent</th>
                    <th className="p-4" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {jobs.map((job: any) => (
                    <tr key={job.id} className="transition-colors hover:bg-muted/30">
                      <td className="p-4">
                        <p className="font-medium">{job.contact?.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {[job.contact?.firstName, job.contact?.lastName].filter(Boolean).join(' ')}
                          {job.contact?.company ? ` · ${job.contact.company}` : ''}
                        </p>
                      </td>
                      <td className="p-4 text-xs text-muted-foreground">{job.campaign?.name}</td>
                      <td className="max-w-xs p-4">
                        <p className="truncate text-xs">{job.renderedSubject}</p>
                      </td>
                      <td className="p-4">
                        <StatusBadge status={job.status} />
                        {job.errorMessage && (
                          <p className="mt-1 max-w-xs truncate text-xs text-red-500" title={job.errorMessage}>
                            {job.errorMessage}
                          </p>
                        )}
                      </td>
                      <td className="p-4 text-xs text-muted-foreground">{formatDate(job.scheduledAt)}</td>
                      <td className="p-4 text-xs text-muted-foreground">
                        {job.sentAt ? formatDate(job.sentAt) : '—'}
                      </td>
                      <td className="p-4">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedJob(job)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {job.status === 'SCHEDULED' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => cancelMutation.mutate(job.id)}
                              disabled={cancelMutation.isPending}
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {job.status === 'FAILED' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-primary"
                              onClick={() => retryMutation.mutate(job.id)}
                              disabled={retryMutation.isPending}
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
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
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedJob} onOpenChange={() => setSelectedJob(null)}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email Details
            </DialogTitle>
          </DialogHeader>
          {selectedJob && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-medium text-muted-foreground">To</p>
                  <p>{selectedJob.contact?.email}</p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Status</p>
                  <StatusBadge status={selectedJob.status} />
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Scheduled</p>
                  <p>{formatDate(selectedJob.scheduledAt)}</p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Sent</p>
                  <p>{selectedJob.sentAt ? formatDate(selectedJob.sentAt) : '—'}</p>
                </div>
              </div>
              <div>
                <p className="mb-1 text-sm font-medium text-muted-foreground">Subject</p>
                <p className="rounded-lg bg-muted/50 p-3 text-sm">{selectedJob.renderedSubject}</p>
              </div>
              {selectedJob.errorMessage && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <strong>Error:</strong> {selectedJob.errorMessage}
                </div>
              )}
              <div>
                <p className="mb-1 text-sm font-medium text-muted-foreground">Email Body</p>
                <div
                  className="prose prose-sm max-h-64 overflow-y-auto rounded-xl border bg-white p-4 text-sm shadow-inner"
                  dangerouslySetInnerHTML={{ __html: selectedJob.renderedBodyHtml }}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
