'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { emailJobsApi } from '@/lib/api';

const BG_SYNC_STORAGE_KEY = 'hr_gmail_reply_sync_ts';
const BG_SYNC_MIN_INTERVAL_MS = 120_000;

export type GmailReplySyncStats = {
  usersScanned?: number;
  threadsFetched?: number;
  jobsExamined?: number;
  jobsUpdated?: number;
  threadBackfills?: number;
  newReplyEventsCreated?: number;
  errors?: number;
};

export function formatGmailReplySyncSuccess(data: GmailReplySyncStats): string {
  const replies = data.newReplyEventsCreated ?? 0;
  const updated = data.jobsUpdated ?? 0;
  const examined = data.jobsExamined ?? 0;
  const threads = data.threadsFetched ?? 0;
  const errs = data.errors ?? 0;

  if (examined === 0) {
    return 'Sync complete. No sent emails with Gmail threads to check yet (or connect Gmail in Settings).';
  }
  if (errs > 0 && threads === 0) {
    return 'Sync finished but threads could not be read. Reconnect Gmail in Settings if this keeps happening.';
  }
  if (replies > 0) {
    return `${replies} new repl${replies !== 1 ? 'ies' : 'y'} found. Updated ${updated} record${updated !== 1 ? 's' : ''}.`;
  }
  if (updated > 0) {
    return `Sync complete. Updated ${updated} email record${updated !== 1 ? 's' : ''}.`;
  }
  return 'Sync complete. No new replies detected.';
}

function useSyncProgressLabel(isPending: boolean): string {
  const [label, setLabel] = useState('Syncing emails…');
  useEffect(() => {
    if (!isPending) return;
    setLabel('Syncing emails…');
    const t1 = window.setTimeout(() => setLabel('Checking Gmail threads…'), 1000);
    const t2 = window.setTimeout(() => setLabel('Looking for replies…'), 2800);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [isPending]);
  return isPending ? label : '';
}

export type GmailReplySyncBanner = { type: 'success' | 'error'; msg: string };

export function useGmailReplySync(options?: {
  /** When set, called after caches are invalidated (Settings can drive `notice` here). */
  onAfterSuccess?: (data: GmailReplySyncStats) => void;
  onAfterError?: (err: unknown) => void;
  /** History: show dismissible banner on manual sync result. */
  successBanner?: boolean;
  /** Throttled background sync when the component mounts (e.g. Email History). */
  backgroundOnMount?: boolean;
}) {
  const {
    onAfterSuccess,
    onAfterError,
    successBanner = false,
    backgroundOnMount = false,
  } = options ?? {};

  const queryClient = useQueryClient();
  const [banner, setBanner] = useState<GmailReplySyncBanner | null>(null);
  const [backgroundState, setBackgroundState] = useState<'idle' | 'syncing' | 'done'>('idle');

  const invalidateReplyQueries = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['email-history'] });
    await queryClient.invalidateQueries({ queryKey: ['email-jobs-analytics'] });
    await queryClient.invalidateQueries({ queryKey: ['contacts'] });
    await queryClient.invalidateQueries({ queryKey: ['contact-activity'] });
  }, [queryClient]);

  const dismissBanner = useCallback(() => setBanner(null), []);

  const runClientBackgroundSync = useCallback(
    (successMsgForReplies: (n: number) => string) => {
      setBackgroundState('syncing');
      return emailJobsApi
        .syncReplies()
        .then(async (data: GmailReplySyncStats) => {
          await invalidateReplyQueries();
          const replies = data?.newReplyEventsCreated ?? 0;
          if (replies > 0) {
            setBanner({ type: 'success', msg: successMsgForReplies(replies) });
            window.setTimeout(() => setBanner(null), 7000);
          }
          setBackgroundState('done');
          window.setTimeout(() => setBackgroundState('idle'), 2000);
        })
        .catch(() => setBackgroundState('idle'));
    },
    [invalidateReplyQueries],
  );

  const mutation = useMutation({
    mutationFn: () => emailJobsApi.syncReplies() as Promise<GmailReplySyncStats>,
    onSuccess: async (data) => {
      await invalidateReplyQueries();
      onAfterSuccess?.(data);
      if (successBanner) {
        setBanner({ type: 'success', msg: formatGmailReplySyncSuccess(data) });
        window.setTimeout(() => setBanner(null), 8000);
      }
    },
    onError: (err) => {
      onAfterError?.(err);
      if (successBanner) {
        const msg =
          (err as any)?.response?.data?.message ||
          (err as Error)?.message ||
          'Reply sync failed.';
        setBanner({ type: 'error', msg: String(msg) });
      }
    },
  });

  const progressLabel = useSyncProgressLabel(mutation.isPending);

  const bgStartedRef = useRef(false);
  useEffect(() => {
    if (!backgroundOnMount) return;
    if (bgStartedRef.current) return;
    const last = parseInt(sessionStorage.getItem(BG_SYNC_STORAGE_KEY) || '0', 10);
    const now = Date.now();
    if (now - last < BG_SYNC_MIN_INTERVAL_MS) return;
    bgStartedRef.current = true;
    sessionStorage.setItem(BG_SYNC_STORAGE_KEY, String(now));
    void runClientBackgroundSync(
      (n) => `${n} new repl${n !== 1 ? 'ies' : 'y'} found since your last visit.`,
    );
  }, [backgroundOnMount, runClientBackgroundSync]);

  useEffect(() => {
    const onFocus = () => {
      if (!backgroundOnMount) return;
      const last = parseInt(sessionStorage.getItem(BG_SYNC_STORAGE_KEY) || '0', 10);
      if (Date.now() - last < BG_SYNC_MIN_INTERVAL_MS) return;
      sessionStorage.setItem(BG_SYNC_STORAGE_KEY, String(Date.now()));
      void runClientBackgroundSync(
        (n) => `${n} new repl${n !== 1 ? 'ies' : 'y'} found.`,
      );
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [backgroundOnMount, runClientBackgroundSync]);

  return {
    syncReplies: mutation.mutate,
    isSyncPending: mutation.isPending,
    progressLabel,
    banner,
    dismissBanner,
    backgroundState,
  };
}
