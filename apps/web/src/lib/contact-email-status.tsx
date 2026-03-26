'use client';

import type { MouseEvent } from 'react';
import { Calendar, Clock, Mail, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

export const EMAIL_STATUS_CONFIG = {
  never_contacted: { label: 'Never contacted', icon: Clock, color: 'text-muted-foreground', dot: 'bg-muted-foreground/40' },
  scheduled: { label: 'Scheduled', icon: Calendar, color: 'text-blue-600', dot: 'bg-blue-500' },
  sent: { label: 'Sent', icon: Mail, color: 'text-orange-600', dot: 'bg-orange-500' },
  replied: { label: 'Replied', icon: MessageSquare, color: 'text-green-600', dot: 'bg-green-500' },
} as const;

export function ContactEmailStatusLabel({
  emailStatus,
  className,
  onClick,
}: {
  emailStatus?: string | null;
  className?: string;
  onClick?: (e: MouseEvent) => void;
}) {
  const status = (emailStatus ?? 'never_contacted') as keyof typeof EMAIL_STATUS_CONFIG;
  const cfg = EMAIL_STATUS_CONFIG[status] ?? EMAIL_STATUS_CONFIG.never_contacted;
  const Icon = cfg.icon;
  const inner = (
    <>
      <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
      <Icon className="h-3 w-3" />
      {cfg.label}
    </>
  );
  const cls = cn('inline-flex items-center gap-1.5 text-xs font-medium', cfg.color, onClick && 'hover:underline', className);
  if (onClick) {
    return (
      <button type="button" title="View email history" onClick={onClick} className={cls}>
        {inner}
      </button>
    );
  }
  return <span className={cls}>{inner}</span>;
}
