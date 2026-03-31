'use client';

import type { ContactFollowUpHint } from '@hunterreach/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Bell } from 'lucide-react';

type Props = {
  followUp?: ContactFollowUpHint | null;
  onSendFollowUp?: (emailJobId: string) => void;
  /** e.g. stop row click from toggling selection */
  onActionClick?: (e: React.MouseEvent) => void;
};

export function ContactFollowUpCompanyNote({ followUp }: { followUp?: ContactFollowUpHint | null }) {
  if (followUp?.status !== 'suppressed') return null;
  return (
    <p className="mt-1 max-w-xs text-xs leading-snug text-muted-foreground">
      {followUp.detailMessage ?? 'Replies already received from this company'}
    </p>
  );
}

export function ContactFollowUpEmailStatusExtras({ followUp }: { followUp?: ContactFollowUpHint | null }) {
  if (followUp?.status !== 'suggested') return null;
  const tip = [
    followUp.detailMessage,
    followUp.daysSinceFirstSent != null ? `${followUp.daysSinceFirstSent} days since first outbound email.` : null,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <Badge variant="warning" className="cursor-default font-medium" title={tip || undefined}>
        {followUp.badgeLabel ?? 'Follow-up suggested'}
      </Badge>
    </div>
  );
}

export function ContactFollowUpActionButton({
  followUp,
  onSendFollowUp,
  onActionClick,
}: Props) {
  if (followUp?.status !== 'suggested') return null;
  const jobId = followUp.eligibleEmailJobId;
  const enabled = !!jobId && !!onSendFollowUp;
  const disabledTitle =
    'No eligible sent email to attach this follow-up to. Check email history and sync replies from Gmail.';

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 w-8 p-0 text-amber-700 hover:bg-amber-50 hover:text-amber-900 disabled:opacity-40"
      title={enabled ? 'Send follow-up (same thread if available)' : disabledTitle}
      disabled={!enabled}
      onClick={(e) => {
        onActionClick?.(e);
        if (jobId && onSendFollowUp) onSendFollowUp(jobId);
      }}
    >
      <Bell className="h-4 w-4" />
    </Button>
  );
}
