import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—';
  return format(new Date(date), 'MMM d, yyyy HH:mm');
}

export function formatRelative(date: string | Date | null | undefined): string {
  if (!date) return '—';
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function truncate(str: string, length = 50): string {
  if (!str) return '';
  return str.length > length ? str.slice(0, length) + '…' : str;
}

export const STATUS_COLORS = {
  scheduled: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  processing: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  sent: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  draft: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  sending: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  done: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
} as const;
