'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { emailJobsApi } from '@/lib/api';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/email-jobs/status-badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatDate } from '@/lib/utils';
import { History, Eye, Mail, Search } from 'lucide-react';

export default function HistoryPage() {
  const [page, setPage] = useState(1);
  const [selectedJob, setSelectedJob] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['email-history', { page }],
    queryFn: () => emailJobsApi.getAll({ status: 'SENT', page, limit: 50 }),
  });

  const jobs = data?.data || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email History"
        description={`${total.toLocaleString()} emails sent`}
      />

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
              <p className="text-lg font-medium">No sent emails yet</p>
              <p className="text-sm">Sent emails will appear here</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="p-4 text-left font-medium text-muted-foreground">Recipient</th>
                    <th className="p-4 text-left font-medium text-muted-foreground">Company</th>
                    <th className="p-4 text-left font-medium text-muted-foreground">Subject</th>
                    <th className="p-4 text-left font-medium text-muted-foreground">Campaign</th>
                    <th className="p-4 text-left font-medium text-muted-foreground">Status</th>
                    <th className="p-4 text-left font-medium text-muted-foreground">Sent at</th>
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
                        </p>
                      </td>
                      <td className="p-4 text-muted-foreground">{job.contact?.company || '—'}</td>
                      <td className="max-w-xs p-4">
                        <p className="truncate text-xs">{job.renderedSubject}</p>
                      </td>
                      <td className="p-4 text-xs text-muted-foreground">{job.campaign?.name}</td>
                      <td className="p-4">
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="p-4 text-xs text-muted-foreground">
                        {job.sentAt ? formatDate(job.sentAt) : '—'}
                      </td>
                      <td className="p-4">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedJob(job)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t p-4">
              <p className="text-sm text-muted-foreground">Page {page} of {totalPages} · {total.toLocaleString()} sent</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedJob} onOpenChange={() => setSelectedJob(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Sent Email Details
            </DialogTitle>
          </DialogHeader>
          {selectedJob && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div><p className="font-medium text-muted-foreground">To</p><p>{selectedJob.contact?.email}</p></div>
                <div><p className="font-medium text-muted-foreground">Company</p><p>{selectedJob.contact?.company || '—'}</p></div>
                <div><p className="font-medium text-muted-foreground">Sent</p><p>{formatDate(selectedJob.sentAt)}</p></div>
                <div><p className="font-medium text-muted-foreground">Provider ID</p><p className="font-mono text-xs break-all">{selectedJob.providerMessageId || '—'}</p></div>
              </div>
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
