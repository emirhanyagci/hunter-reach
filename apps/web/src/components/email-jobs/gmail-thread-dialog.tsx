'use client';

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { emailJobsApi } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, ArrowDown, User, Building2 } from 'lucide-react';

export type GmailThreadMessageView = {
  gmailMessageId: string;
  internalMs: number;
  dateIso: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  bodyText: string | null;
  bodyHtml: string | null;
  direction: 'outbound' | 'inbound' | 'other';
  isJobOutboundMessage: boolean;
};

export type GmailThreadViewResult = {
  threadId: string;
  mailboxEmail: string;
  contactEmail: string;
  jobSubject: string;
  messages: GmailThreadMessageView[];
};

type GmailThreadDialogProps = {
  jobId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function directionLabel(d: GmailThreadMessageView['direction']): string {
  if (d === 'outbound') return 'You (sent from Gmail)';
  if (d === 'inbound') return 'Contact';
  return 'Other';
}

function directionStyles(d: GmailThreadMessageView['direction']): string {
  if (d === 'outbound') return 'border-l-4 border-l-primary bg-primary/5';
  if (d === 'inbound') return 'border-l-4 border-l-green-600 bg-green-50/80 dark:bg-green-950/30 dark:border-l-green-500';
  return 'border-l-4 border-l-muted-foreground/40 bg-muted/30';
}

export function GmailThreadDialog({ jobId, open, onOpenChange }: GmailThreadDialogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['email-job-gmail-thread', jobId],
    queryFn: () => emailJobsApi.getGmailThread(jobId!) as Promise<GmailThreadViewResult>,
    enabled: open && !!jobId,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (open && data?.messages?.length) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [open, data?.messages?.length]);

  const lastInboundIdx = data?.messages
    ? [...data.messages].map((m, i) => (m.direction === 'inbound' ? i : -1)).filter((i) => i >= 0).pop()
    : undefined;

  const errMsg =
    (error as any)?.response?.data?.message ??
    (Array.isArray((error as any)?.response?.data?.message)
      ? (error as any).response.data.message[0]
      : null) ??
    (error as Error)?.message ??
    'Could not load thread.';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 pr-8">
            Email thread
            {isFetching && !isLoading && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
            )}
          </DialogTitle>
          <DialogDescription className="text-left space-y-1">
            {data ? (
              <>
                <span className="block text-foreground/90 font-medium">{data.jobSubject}</span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="inline-flex items-center gap-1">
                    <User className="h-3.5 w-3.5" />
                    {data.contactEmail}
                  </span>
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5" />
                    Your mailbox: {data.mailboxEmail}
                  </span>
                </span>
              </>
            ) : (
              'Messages are loaded from Gmail in chronological order.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-[200px]">
          {isLoading && (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm">Loading conversation from Gmail…</p>
            </div>
          )}

          {isError && !isLoading && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <div className="flex gap-2">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="text-destructive font-medium">Could not load thread</p>
                  <p className="text-muted-foreground">{String(errMsg)}</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
                    Try again
                  </Button>
                </div>
              </div>
            </div>
          )}

          {!isLoading && !isError && data && data.messages.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No messages in this thread.</p>
          )}

          {!isLoading && !isError && data && data.messages.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <ArrowDown className="h-3 w-3" />
                Oldest at top — scroll for the latest reply
              </p>
              <ol className="space-y-3 list-none">
                {data.messages.map((msg, idx) => {
                  const isLatestInbound = idx === lastInboundIdx;
                  return (
                    <li key={msg.gmailMessageId}>
                      <article
                        className={`rounded-lg border p-4 shadow-sm ${directionStyles(msg.direction)} ${
                          isLatestInbound ? 'ring-2 ring-green-500/30' : ''
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {directionLabel(msg.direction)}
                              {msg.isJobOutboundMessage && (
                                <span className="ml-2 font-normal normal-case text-primary">
                                  · This send is linked to this history record
                                </span>
                              )}
                              {isLatestInbound && (
                                <span className="ml-2 text-green-700 dark:text-green-400 font-semibold">
                                  · Latest reply
                                </span>
                              )}
                            </p>
                            <p className="text-sm font-medium mt-1">{msg.from}</p>
                            {msg.to ? (
                              <p className="text-xs text-muted-foreground mt-0.5">To: {msg.to}</p>
                            ) : null}
                          </div>
                          <time
                            className="text-xs text-muted-foreground whitespace-nowrap"
                            dateTime={msg.dateIso}
                          >
                            {formatDate(msg.dateIso)}
                          </time>
                        </div>
                        {msg.subject && msg.subject !== data.jobSubject ? (
                          <p className="text-xs font-medium text-muted-foreground mb-2">Subject: {msg.subject}</p>
                        ) : null}
                        {msg.bodyText ? (
                          <pre className="text-sm whitespace-pre-wrap font-sans text-foreground/90 leading-relaxed">
                            {msg.bodyText}
                          </pre>
                        ) : msg.bodyHtml ? (
                          <iframe
                            title={`Email body ${msg.gmailMessageId}`}
                            sandbox=""
                            className="w-full min-h-[160px] rounded-md border bg-white text-black"
                            srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
                              body{font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;line-height:1.5;margin:12px;word-break:break-word;color:#111;}
                              img{max-width:100%;height:auto;}
                            </style></head><body>${msg.bodyHtml}</body></html>`}
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground italic">
                            {msg.snippet || 'No body text available for this message.'}
                          </p>
                        )}
                      </article>
                    </li>
                  );
                })}
              </ol>
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
