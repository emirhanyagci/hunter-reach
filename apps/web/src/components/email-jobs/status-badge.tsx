import { cn, STATUS_COLORS } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const key = status.toLowerCase() as keyof typeof STATUS_COLORS;
  const colorClass = STATUS_COLORS[key] || 'bg-gray-100 text-gray-800';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize',
        colorClass,
        className,
      )}
    >
      {status.toLowerCase()}
    </span>
  );
}
