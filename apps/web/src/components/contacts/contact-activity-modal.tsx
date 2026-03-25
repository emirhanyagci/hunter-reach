'use client';
import { useQuery } from '@tanstack/react-query';
import { emailJobsApi } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/email-jobs/status-badge';
import { formatDate } from '@/lib/utils';
import { Mail, Calendar, MessageSquare, Clock, ExternalLink } from 'lucide-react';

interface ContactActivityModalProps {
  contactId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EMAIL_STATUS_CONFIG = {
  never_contacted: { label: 'Never contacted', color: 'text-muted-foreground', bg: 'bg-muted/50' },
  scheduled: { label: 'Email scheduled', color: 'text-blue-600', bg: 'bg-blue-50' },
  sent: { label: 'Email sent', color: 'text-orange-600', bg: 'bg-orange-50' },
  replied: { label: 'Replied', color: 'text-green-600', bg: 'bg-green-50' },
} as const;

export function ContactActivityModal({ contactId, open, onOpenChange }: ContactActivityModalProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['contact-activity', contactId],
    queryFn: () => emailJobsApi.getContactActivity(contactId!),
    enabled: !!contactId && open,
  });

  const contact = data?.contact;
  const jobs: any[] = data?.jobs ?? [];
  const emailStatus = data?.emailStatus ?? 'never_contacted';
  const statusConfig = EMAIL_STATUS_CONFIG[emailStatus as keyof typeof EMAIL_STATUS_CONFIG];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Activity
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Contact header */}
            {contact && (
              <div className="rounded-lg border p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{contact.email}</p>
                    {(contact.firstName || contact.lastName) && (
                      <p className="text-sm text-muted-foreground">
                        {[contact.firstName, contact.lastName].filter(Boolean).join(' ')}
                      </p>
                    )}
                    {contact.company && (
                      <p className="text-sm text-muted-foreground">{contact.company}</p>
                    )}
                  </div>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${statusConfig.bg} ${statusConfig.color}`}>
                    {emailStatus === 'replied' && <MessageSquare className="h-3 w-3" />}
                    {emailStatus === 'sent' && <Mail className="h-3 w-3" />}
                    {emailStatus === 'scheduled' && <Calendar className="h-3 w-3" />}
                    {emailStatus === 'never_contacted' && <Clock className="h-3 w-3" />}
                    {statusConfig.label}
                  </span>
                </div>
              </div>
            )}

            {/* Email activity list */}
            {jobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <Mail className="mb-2 h-10 w-10 opacity-20" />
                <p className="text-sm">No email activity yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-medium text-muted-foreground">{jobs.length} email{jobs.length !== 1 ? 's' : ''} in history</p>
                {jobs.map((job: any) => (
                  <div key={job.id} className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{job.renderedSubject}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                          {job.campaign && <span>Campaign: <span className="text-foreground">{job.campaign.name}</span></span>}
                          {job.template && <span>Template: <span className="text-foreground">{job.template.name}</span></span>}
                          {job.isReminder && <span className="text-blue-600 font-medium">Reminder</span>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <StatusBadge status={job.status} />
                        {job.replyCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                            <MessageSquare className="h-3 w-3" />
                            {job.replyCount} repl{job.replyCount !== 1 ? 'ies' : 'y'}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {job.scheduledAt && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Scheduled: {formatDate(job.scheduledAt)}
                        </span>
                      )}
                      {job.sentAt && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          Sent: {formatDate(job.sentAt)}
                        </span>
                      )}
                      {job.lastRepliedAt && (
                        <span className="flex items-center gap-1 text-green-600">
                          <MessageSquare className="h-3 w-3" />
                          Last reply: {formatDate(job.lastRepliedAt)}
                        </span>
                      )}
                      {job.threadId && (
                        <span className="flex items-center gap-1 font-mono">
                          <ExternalLink className="h-3 w-3" />
                          Thread: {job.threadId.slice(0, 12)}…
                        </span>
                      )}
                    </div>

                    {job.events?.length > 0 && (
                      <div className="border-t pt-2">
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">Events</p>
                        <div className="flex flex-wrap gap-2">
                          {job.events.map((e: any) => (
                            <div key={e.id} className="flex items-center gap-1.5 text-xs">
                              <StatusBadge status={e.eventType} />
                              <span className="text-muted-foreground">{formatDate(e.occurredAt)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
