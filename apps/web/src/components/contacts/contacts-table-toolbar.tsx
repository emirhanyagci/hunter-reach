'use client';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export const CONTACT_PAGE_SIZE_OPTIONS = [25, 50, 100, 150, 250] as const;
export type ContactPageSize = (typeof CONTACT_PAGE_SIZE_OPTIONS)[number];

type Props = {
  className?: string;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  visibleCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: ContactPageSize) => void;
  loading?: boolean;
  selectedCount: number;
  /** When true, every row matching current filters is selected. */
  allMatchingSelected: boolean;
  onClearSelection?: () => void;
  onSelectAllMatching?: () => void;
  selectAllMatchingLoading?: boolean;
  /** Query params for filtered-ids (no page/limit). */
  entityLabel?: string;
};

export function ContactsTableToolbar({
  className,
  total,
  page,
  pageSize,
  totalPages,
  visibleCount,
  onPageChange,
  onPageSizeChange,
  loading,
  selectedCount,
  allMatchingSelected,
  onClearSelection,
  onSelectAllMatching,
  selectAllMatchingLoading,
  entityLabel = 'contacts',
}: Props) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = total === 0 ? 0 : Math.min(page * pageSize, total);

  return (
    <div className={cn('space-y-3 border-t bg-muted/20 px-4 py-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">{total.toLocaleString()}</span>{' '}
            matching {entityLabel}
            {loading ? ' · Loading…' : ''}
          </p>
          {total > 0 && (
            <p className="text-xs">
              Showing rows {start.toLocaleString()}–{end.toLocaleString()} · {visibleCount.toLocaleString()} on this page
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Rows per page</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange(Number(v) as ContactPageSize)}
            disabled={loading}
          >
            <SelectTrigger className="h-8 w-[76px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONTACT_PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {total > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {selectedCount > 0 && (
            <div
              className={cn(
                'rounded-md border px-2.5 py-1.5 text-xs font-medium',
                allMatchingSelected
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border bg-background text-foreground',
              )}
            >
              {allMatchingSelected ? (
                <>All {total.toLocaleString()} matching {entityLabel} selected</>
              ) : (
                <>
                  {selectedCount.toLocaleString()} selected
                  {total > visibleCount ? (
                    <span className="font-normal text-muted-foreground"> (not all pages)</span>
                  ) : null}
                </>
              )}
            </div>
          )}
          {onSelectAllMatching && total > 0 && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8"
              disabled={loading || selectAllMatchingLoading || allMatchingSelected}
              onClick={onSelectAllMatching}
            >
              {selectAllMatchingLoading ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Loading…
                </>
              ) : (
                `Select all ${total.toLocaleString()} matching`
              )}
            </Button>
          )}
          {onClearSelection && selectedCount > 0 && (
            <Button type="button" variant="ghost" size="sm" className="h-8" onClick={onClearSelection}>
              Clear selection
            </Button>
          )}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => onPageChange(page - 1)}>
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => onPageChange(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
