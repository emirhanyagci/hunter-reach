import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, gmail_v1 } from 'googleapis';
import { PrismaService } from '../prisma/prisma.service';
import { getGmailReplySyncConfig } from '../config/email-sending.config';
import { GmailAuthService } from './gmail-auth.service';

export interface GmailReplySyncStats {
  usersScanned: number;
  threadsFetched: number;
  jobsExamined: number;
  jobsUpdated: number;
  threadBackfills: number;
  /** New REPLIED email_event rows recorded this run (individual reply messages). */
  newReplyEventsCreated: number;
  errors: number;
}

type JobSyncRow = {
  id: string;
  contactId: string;
  contactEmail: string;
  providerMessageId: string | null;
  threadId: string | null;
  replyCount: number;
  lastRepliedAt: Date | null;
  status: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function emptyStats(): GmailReplySyncStats {
  return {
    usersScanned: 0,
    threadsFetched: 0,
    jobsExamined: 0,
    jobsUpdated: 0,
    threadBackfills: 0,
    newReplyEventsCreated: 0,
    errors: 0,
  };
}

function mergeStats(target: GmailReplySyncStats, part: Partial<GmailReplySyncStats>): void {
  if (part.usersScanned != null) target.usersScanned += part.usersScanned;
  if (part.threadsFetched != null) target.threadsFetched += part.threadsFetched;
  if (part.jobsExamined != null) target.jobsExamined += part.jobsExamined;
  if (part.jobsUpdated != null) target.jobsUpdated += part.jobsUpdated;
  if (part.threadBackfills != null) target.threadBackfills += part.threadBackfills;
  if (part.newReplyEventsCreated != null) target.newReplyEventsCreated += part.newReplyEventsCreated;
  if (part.errors != null) target.errors += part.errors;
}

function getHeader(msg: gmail_v1.Schema$Message, name: string): string | undefined {
  const headers = msg.payload?.headers;
  if (!headers) return undefined;
  const h = headers.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? undefined;
}

/** Extract bare email from a From header. */
function parseEmailFromFromHeader(from: string | undefined): string | null {
  if (!from) return null;
  const m = from.match(/<([^>]+)>/);
  const raw = (m ? m[1] : from).trim().toLowerCase();
  return raw || null;
}

/** Gmail users.messages.send returns opaque web-safe ids; SMTP uses angle-bracket Message-IDs. */
function isLikelyGmailApiMessageId(id: string | null | undefined): boolean {
  if (!id || id.length < 8) return false;
  if (id.trim().startsWith('<')) return false;
  return /^[a-zA-Z0-9_-]+$/.test(id.trim());
}

@Injectable()
export class GmailReplySyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GmailReplySyncService.name);
  private interval: ReturnType<typeof setInterval> | null = null;
  private readonly userLocks = new Map<string, Promise<GmailReplySyncStats>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly gmailAuth: GmailAuthService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    const { periodicIntervalMs } = getGmailReplySyncConfig(this.configService);
    if (periodicIntervalMs <= 0) {
      this.logger.log('Gmail reply sync periodic polling disabled (GMAIL_REPLY_SYNC_INTERVAL_MS=0)');
      return;
    }
    setImmediate(() => {
      this.syncAllConnectedUsers('startup').catch((err) =>
        this.logger.error(`Startup Gmail reply sync failed: ${err instanceof Error ? err.message : err}`),
      );
    });
    this.interval = setInterval(() => {
      this.syncAllConnectedUsers('periodic').catch((err) =>
        this.logger.error(`Periodic Gmail reply sync failed: ${err instanceof Error ? err.message : err}`),
      );
    }, periodicIntervalMs);
    this.logger.log(`Gmail reply sync every ${periodicIntervalMs}ms`);
  }

  onModuleDestroy(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /** Runs after OAuth; safe to call repeatedly — coalesces concurrent syncs per user. */
  async syncUserReplies(userId: string, reason: 'manual' | 'periodic' | 'startup' = 'manual'): Promise<GmailReplySyncStats> {
    const existing = this.userLocks.get(userId);
    if (existing) return existing;

    const run = this.runSyncForUser(userId, reason).finally(() => {
      this.userLocks.delete(userId);
    });
    this.userLocks.set(userId, run);
    return run;
  }

  async syncAllConnectedUsers(reason: 'startup' | 'periodic'): Promise<GmailReplySyncStats> {
    const tokens = await this.prisma.gmailToken.findMany({ select: { userId: true } });
    const aggregate = emptyStats();
    for (const t of tokens) {
      try {
        const s = await this.syncUserReplies(t.userId, reason);
        aggregate.usersScanned += 1;
        aggregate.threadsFetched += s.threadsFetched;
        aggregate.jobsExamined += s.jobsExamined;
        aggregate.jobsUpdated += s.jobsUpdated;
        aggregate.threadBackfills += s.threadBackfills;
        aggregate.newReplyEventsCreated += s.newReplyEventsCreated;
        aggregate.errors += s.errors;
      } catch (err) {
        aggregate.errors += 1;
        this.logger.warn(`syncAllConnectedUsers user ${t.userId}: ${err instanceof Error ? err.message : err}`);
      }
    }
    if (aggregate.usersScanned > 0 || reason === 'startup') {
      this.logger.log(
        `[${reason}] Gmail reply sync: users=${aggregate.usersScanned} threads=${aggregate.threadsFetched} ` +
          `jobs=${aggregate.jobsExamined} updated=${aggregate.jobsUpdated} backfills=${aggregate.threadBackfills} ` +
          `newReplies=${aggregate.newReplyEventsCreated} errors=${aggregate.errors}`,
      );
    }
    return aggregate;
  }

  private async runSyncForUser(userId: string, reason: 'manual' | 'periodic' | 'startup'): Promise<GmailReplySyncStats> {
    const stats = emptyStats();

    const auth = await this.gmailAuth.getAuthorizedClient(userId);
    if (!auth) {
      return stats;
    }

    const tokenRow = await this.prisma.gmailToken.findUnique({ where: { userId } });
    const mailboxEmail = tokenRow?.email?.trim().toLowerCase() ?? '';
    if (!mailboxEmail) {
      this.logger.warn(`Gmail reply sync: no mailbox email on token for user ${userId}`);
      return stats;
    }

    const gmail = google.gmail({ version: 'v1', auth });
    const {
      maxJobAgeDays,
      interThreadDelayMs,
      manualThreadConcurrency,
      manualInterBatchDelayMs,
      threadBackfillConcurrency,
    } = getGmailReplySyncConfig(this.configService);
    const minSentAt = new Date(Date.now() - maxJobAgeDays * 86_400_000);

    let jobs = await this.prisma.emailJob.findMany({
      where: {
        status: { in: ['SENT', 'REPLIED'] },
        sentAt: { gte: minSentAt },
        campaign: { userId },
      },
      select: {
        id: true,
        contactId: true,
        providerMessageId: true,
        threadId: true,
        replyCount: true,
        lastRepliedAt: true,
        status: true,
        contact: { select: { email: true } },
      },
    });

    const rows: JobSyncRow[] = jobs.map((j) => ({
      id: j.id,
      contactId: j.contactId,
      contactEmail: j.contact.email,
      providerMessageId: j.providerMessageId,
      threadId: j.threadId,
      replyCount: j.replyCount,
      lastRepliedAt: j.lastRepliedAt,
      status: j.status,
    }));

    const backfillRows = rows.filter((r) => !r.threadId && isLikelyGmailApiMessageId(r.providerMessageId));
    for (let i = 0; i < backfillRows.length; i += threadBackfillConcurrency) {
      const chunk = backfillRows.slice(i, i + threadBackfillConcurrency);
      await Promise.all(
        chunk.map(async (row) => {
          try {
            const tid = await this.backfillThreadId(gmail, row.id, row.providerMessageId!);
            if (tid) {
              row.threadId = tid;
              stats.threadBackfills += 1;
            }
          } catch {
            stats.errors += 1;
          }
        }),
      );
    }

    const withThread = rows.filter((r) => r.threadId && isLikelyGmailApiMessageId(r.providerMessageId));
    stats.jobsExamined = withThread.length;

    const byThread = new Map<string, JobSyncRow[]>();
    for (const r of withThread) {
      const tid = r.threadId!;
      const list = byThread.get(tid) ?? [];
      list.push(r);
      byThread.set(tid, list);
    }

    const jobIds = [...new Set(withThread.map((r) => r.id))];
    const existingReplied = await this.prisma.emailEvent.findMany({
      where: { emailJobId: { in: jobIds }, eventType: 'REPLIED' },
      select: { emailJobId: true, metadata: true },
    });
    const repliedGmailIdsByJob = new Map<string, Set<string>>();
    for (const e of existingReplied) {
      const gid = (e.metadata as { gmailMessageId?: string } | null)?.gmailMessageId;
      if (!gid) continue;
      let set = repliedGmailIdsByJob.get(e.emailJobId);
      if (!set) {
        set = new Set<string>();
        repliedGmailIdsByJob.set(e.emailJobId, set);
      }
      set.add(gid);
    }

    const threadEntries = [...byThread.entries()];
    const isManual = reason === 'manual';
    const concurrency = isManual ? manualThreadConcurrency : 1;
    const batchDelayMs = isManual ? manualInterBatchDelayMs : interThreadDelayMs;

    for (let i = 0; i < threadEntries.length; i += concurrency) {
      const batch = threadEntries.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(([threadId, threadJobs]) =>
          this.syncOneThread(gmail, threadId, threadJobs, mailboxEmail, repliedGmailIdsByJob, userId, reason),
        ),
      );
      for (const part of batchResults) {
        mergeStats(stats, part);
      }
      const more = i + concurrency < threadEntries.length;
      if (more && batchDelayMs > 0) {
        await sleep(batchDelayMs);
      }
    }

    return stats;
  }

  /** Fetch one Gmail thread and apply reply detection for all jobs on that thread. */
  private async syncOneThread(
    gmail: gmail_v1.Gmail,
    threadId: string,
    threadJobs: JobSyncRow[],
    mailboxEmail: string,
    repliedGmailIdsByJob: Map<string, Set<string>>,
    userId: string,
    reason: string,
  ): Promise<Partial<GmailReplySyncStats>> {
    const part: Partial<GmailReplySyncStats> = {};
    try {
      const res = await gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'metadata',
        metadataHeaders: ['From'],
      });
      part.threadsFetched = 1;

      const messages = res.data.messages ?? [];
      type ParsedMsg = {
        id: string;
        internalMs: number;
        fromEmail: string | null;
        labelIds: string[];
      };
      const parsed: ParsedMsg[] = messages
        .filter((m): m is gmail_v1.Schema$Message & { id: string } => !!m.id)
        .map((m) => ({
          id: m.id,
          internalMs: parseInt(m.internalDate || '0', 10),
          fromEmail: parseEmailFromFromHeader(getHeader(m, 'From')),
          labelIds: m.labelIds ?? [],
        }))
        .sort((a, b) => a.internalMs - b.internalMs);

      const local = emptyStats();
      for (const job of threadJobs) {
        const prevSet = repliedGmailIdsByJob.get(job.id) ?? new Set<string>();
        await this.applyJobThreadAnalysis(job, parsed, mailboxEmail, local, prevSet);
        repliedGmailIdsByJob.set(job.id, prevSet);
      }
      part.jobsUpdated = local.jobsUpdated;
      part.newReplyEventsCreated = local.newReplyEventsCreated;
    } catch (err: any) {
      const code = err?.code;
      const msg = err instanceof Error ? err.message : String(err);
      if (code === 403 || /insufficient/i.test(msg)) {
        this.logger.warn(
          `Gmail reply sync: missing gmail.readonly for user ${userId} — reconnect Gmail in Settings. (${reason})`,
        );
      } else if (code !== 404) {
        part.errors = 1;
        this.logger.debug(`Thread ${threadId} sync: ${msg}`);
      }
    }
    return part;
  }

  private async backfillThreadId(
    gmail: gmail_v1.Gmail,
    emailJobId: string,
    providerMessageId: string,
  ): Promise<string | null> {
    const res = await gmail.users.messages.get({
      userId: 'me',
      id: providerMessageId,
      format: 'minimal',
    });
    const tid = res.data.threadId;
    if (tid) {
      await this.prisma.emailJob.update({
        where: { id: emailJobId },
        data: { threadId: tid },
      });
      return tid;
    }
    return null;
  }

  private async applyJobThreadAnalysis(
    job: JobSyncRow,
    parsed: { id: string; internalMs: number; fromEmail: string | null; labelIds: string[] }[],
    mailboxEmail: string,
    stats: GmailReplySyncStats,
    prevRepliedGmailIds: Set<string>,
  ): Promise<void> {
    const mailboxNorm = mailboxEmail.toLowerCase();
    const contactNorm = job.contactEmail.trim().toLowerCase();
    const anchor = parsed.find((m) => m.id === job.providerMessageId);
    if (!anchor) {
      return;
    }

    const replyMsgs = parsed.filter(
      (m) =>
        m.internalMs > anchor.internalMs &&
        m.fromEmail === contactNorm &&
        m.fromEmail !== mailboxNorm &&
        !m.labelIds.includes('DRAFT'),
    );

    const newCount = replyMsgs.length;
    const lastMs = replyMsgs.length ? Math.max(...replyMsgs.map((m) => m.internalMs)) : 0;
    const lastRepliedAt = lastMs > 0 ? new Date(lastMs) : null;

    for (const m of replyMsgs) {
      if (!prevRepliedGmailIds.has(m.id)) {
        await this.prisma.emailEvent.create({
          data: {
            emailJobId: job.id,
            eventType: 'REPLIED',
            metadata: {
              source: 'gmail_thread_sync',
              gmailMessageId: m.id,
              threadId: job.threadId,
            },
          },
        });
        prevRepliedGmailIds.add(m.id);
        stats.newReplyEventsCreated += 1;
      }
    }

    const nextStatus = newCount > 0 ? 'REPLIED' : 'SENT';
    const lastChanged =
      (lastRepliedAt?.getTime() ?? 0) !== (job.lastRepliedAt?.getTime() ?? 0);
    const statusChanged = nextStatus !== job.status;

    if (newCount !== job.replyCount || lastChanged || statusChanged) {
      await this.prisma.emailJob.update({
        where: { id: job.id },
        data: {
          replyCount: newCount,
          lastRepliedAt,
          status: nextStatus as 'SENT' | 'REPLIED',
        },
      });
      stats.jobsUpdated += 1;
    }

    job.replyCount = newCount;
    job.lastRepliedAt = lastRepliedAt;
    job.status = nextStatus;
  }
}
