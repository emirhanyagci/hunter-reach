'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { emailJobsApi } from '@/lib/api';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/email-jobs/status-badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatDate } from '@/lib/utils';
import { Clock, XCircle, RefreshCw, Eye, Mail } from 'lucide-react';

export default function ScheduledPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('SCHEDULED');
  const [page, setPage] = useState(1);
  const [selectedJob, setSelectedJob] = useState<any>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['email-jobs', { status: statusFilter, page }],
    queryFn: () => emailJobsApi.getAll({ status: statusFilter || undefined, page, limit: 25 }),
    refetchInterval: 10_000, // auto-refresh every 10s
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

  const STATUS_OPTIONS = ['', 'SCHEDULED', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED'];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scheduled Emails"
        description="Monitor and manage all email jobs"
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        }
      />

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s || 'all'}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              statusFilter === s ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

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
                {statusFilter ? `No emails with status "${statusFilter.toLowerCase()}"` : 'No emails yet'}
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
                    <tr key={job.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-4">
                        <p className="font-medium">{job.contact?.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {[job.contact?.firstName, job.contact?.lastName].filter(Boolean).join(' ')}
                          {job.contact?.company ? ` · ${job.contact.company}` : ''}
                        </p>
                      </td>
                      <td className="p-4 text-muted-foreground text-xs">
                        {job.campaign?.name}
                      </td>
                      <td className="max-w-xs p-4">
                        <p className="truncate text-xs">{job.renderedSubject}</p>
                      </td>
                      <td className="p-4">
                        <StatusBadge status={job.status} />
                        {job.errorMessage && (
                          <p className="mt-1 text-xs text-red-500 max-w-xs truncate" title={job.errorMessage}>
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
              <p className="text-sm text-muted-foreground">Page {page} of {totalPages} · {total.toLocaleString()} total</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
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
                  className="rounded-xl border bg-white p-4 text-sm shadow-inner max-h-64 overflow-y-auto prose prose-sm"
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
