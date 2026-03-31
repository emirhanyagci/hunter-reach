import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getFollowUpConfig } from '../config/follow-up.config';

export type FollowUpUiStatus = 'none' | 'suggested' | 'suppressed';

export interface ContactFollowUpHint {
  status: FollowUpUiStatus;
  /** 1 = first, 2 = second, 3 = final — only when status === 'suggested' */
  tier?: 1 | 2 | 3;
  /** Short badge label */
  badgeLabel?: string;
  reason:
    | 'eligible'
    | 'replied'
    | 'never_sent'
    | 'scheduled_only'
    | 'too_soon'
    | 'max_followups_sent'
    | 'company_replies';
  /** Extra copy for suppressed / context */
  detailMessage?: string;
  daysSinceFirstSent?: number;
  reminderCount?: number;
  companyMessagedContacts?: number;
  companyRepliedContacts?: number;
  companyReplyRatio?: number;
  /** Email job id for POST /email-jobs/remind (same thread when threadId exists) */
  eligibleEmailJobId?: string | null;
}

type JobLite = {
  id: string;
  status: string;
  replyCount: number;
  sentAt: Date | null;
  scheduledAt: Date;
  isReminder: boolean;
  createdAt: Date;
};

function normalizeCompanyKey(company: string | null | undefined, contactId: string): string {
  const t = company?.trim();
  if (!t) return `__solo_${contactId}`;
  return t.toLowerCase();
}

function jobIndicatesReply(j: JobLite): boolean {
  return j.replyCount > 0 || j.status === 'REPLIED';
}

function isOutboundSent(j: JobLite): boolean {
  return !!j.sentAt && (j.status === 'SENT' || j.status === 'REPLIED');
}

@Injectable()
export class FollowUpRecommendationService {
  constructor(private prisma: PrismaService) {}

  /**
   * Mutates each contact object in place with `followUp: ContactFollowUpHint`.
   */
  async attachHints(userId: string, contacts: any[], now = new Date()): Promise<void> {
    if (!contacts.length) return;

    const cfg = getFollowUpConfig();
    const keysForQuery = [
      ...new Set(
        contacts
          .map((c) => {
            const k = normalizeCompanyKey(c.company, c.id);
            return k.startsWith('__solo_') ? null : k;
          })
          .filter((k): k is string => k != null),
      ),
    ];

    const companyStats = await this.loadCompanyStats(userId, keysForQuery);

    for (const c of contacts) {
      c.followUp = this.computeHintForContact(c, companyStats, cfg, now);
    }
  }

  private async loadCompanyStats(
    userId: string,
    normalizedKeys: string[],
  ): Promise<Map<string, { messaged: number; replied: number }>> {
    const map = new Map<string, { messaged: number; replied: number }>();
    if (!normalizedKeys.length) return map;

    const rows = await this.prisma.$queryRaw<
      { norm_key: string; messaged: number; replied: number }[]
    >(Prisma.sql`
      SELECT
        LOWER(TRIM(BOTH FROM c.company)) AS norm_key,
        COUNT(DISTINCT c.id) FILTER (WHERE EXISTS (
          SELECT 1 FROM email_jobs ej
          WHERE ej.contact_id = c.id
            AND ej.sent_at IS NOT NULL
            AND (ej.status = 'SENT'::"EmailJobStatus" OR ej.status = 'REPLIED'::"EmailJobStatus")
        ))::int AS messaged,
        COUNT(DISTINCT c.id) FILTER (WHERE EXISTS (
          SELECT 1 FROM email_jobs ej
          WHERE ej.contact_id = c.id
            AND (
              ej.reply_count > 0
              OR ej.status = 'REPLIED'::"EmailJobStatus"
            )
        ))::int AS replied
      FROM contacts c
      WHERE c.user_id = ${userId}
        AND c.company IS NOT NULL
        AND TRIM(BOTH FROM c.company) <> ''
        AND LOWER(TRIM(BOTH FROM c.company)) IN (${Prisma.join(
          normalizedKeys.map((k) => Prisma.sql`${k}`),
        )})
      GROUP BY 1
    `);

    for (const r of rows) {
      map.set(r.norm_key, { messaged: r.messaged, replied: r.replied });
    }
    return map;
  }

  private soloCompanyStats(jobs: JobLite[]): { messaged: number; replied: number } {
    const messaged = jobs.some(isOutboundSent) ? 1 : 0;
    const replied = jobs.some(jobIndicatesReply) ? 1 : 0;
    return { messaged, replied };
  }

  private companySuppressesFollowUps(
    messaged: number,
    replied: number,
    cfg: ReturnType<typeof getFollowUpConfig>,
  ): boolean {
    if (messaged <= 0 || replied <= 0) return false;
    if (cfg.companySuppressMinRatio == null) {
      return true;
    }
    const ratio = replied / messaged;
    return ratio >= cfg.companySuppressMinRatio;
  }

  private computeHintForContact(
    contact: { id: string; company?: string | null; emailJobs?: JobLite[] },
    companyStats: Map<string, { messaged: number; replied: number }>,
    cfg: ReturnType<typeof getFollowUpConfig>,
    now: Date,
  ): ContactFollowUpHint {
    const jobs = (contact.emailJobs ?? []) as JobLite[];
    const key = normalizeCompanyKey(contact.company, contact.id);

    const stats =
      key.startsWith('__solo_') ? this.soloCompanyStats(jobs) : companyStats.get(key) ?? { messaged: 0, replied: 0 };

    const hasReplied = jobs.some(jobIndicatesReply);
    const hasSent = jobs.some((j) => j.status === 'SENT' || j.status === 'REPLIED');
    const hasScheduledOnly =
      !hasSent &&
      !hasReplied &&
      jobs.some((j) => j.status === 'SCHEDULED' || j.status === 'PROCESSING');

    if (hasReplied) {
      return {
        status: 'none',
        reason: 'replied',
        companyMessagedContacts: stats.messaged,
        companyRepliedContacts: stats.replied,
        companyReplyRatio: stats.messaged > 0 ? stats.replied / stats.messaged : undefined,
        eligibleEmailJobId: null,
      };
    }

    if (!hasSent) {
      return {
        status: 'none',
        reason: hasScheduledOnly ? 'scheduled_only' : 'never_sent',
        companyMessagedContacts: stats.messaged,
        companyRepliedContacts: stats.replied,
        companyReplyRatio: stats.messaged > 0 ? stats.replied / stats.messaged : undefined,
        eligibleEmailJobId: null,
      };
    }

    const outboundSent = jobs.filter(isOutboundSent);
    const firstSentMs = Math.min(
      ...outboundSent.map((j) => new Date(j.sentAt!).getTime()).filter((n) => Number.isFinite(n)),
    );
    const daysSinceFirst =
      Number.isFinite(firstSentMs) && firstSentMs < Infinity
        ? (now.getTime() - firstSentMs) / 86_400_000
        : 0;

    const reminderCount = jobs.filter((j) => j.isReminder && j.sentAt).length;
    if (reminderCount >= 3) {
      return {
        status: 'none',
        reason: 'max_followups_sent',
        daysSinceFirstSent: Math.floor(daysSinceFirst),
        reminderCount,
        companyMessagedContacts: stats.messaged,
        companyRepliedContacts: stats.replied,
        companyReplyRatio: stats.messaged > 0 ? stats.replied / stats.messaged : undefined,
        eligibleEmailJobId: null,
      };
    }

    const need = reminderCount + 1;
    let tier: 1 | 2 | 3 | null = null;
    if (need === 1 && daysSinceFirst >= cfg.daysFirst) tier = 1;
    else if (need === 2 && daysSinceFirst >= cfg.daysSecond) tier = 2;
    else if (need === 3 && daysSinceFirst >= cfg.daysFinal) tier = 3;

    if (!tier) {
      return {
        status: 'none',
        reason: 'too_soon',
        daysSinceFirstSent: Math.floor(daysSinceFirst),
        reminderCount,
        companyMessagedContacts: stats.messaged,
        companyRepliedContacts: stats.replied,
        companyReplyRatio: stats.messaged > 0 ? stats.replied / stats.messaged : undefined,
        eligibleEmailJobId: null,
      };
    }

    const suppress = this.companySuppressesFollowUps(stats.messaged, stats.replied, cfg);
    const ratio = stats.messaged > 0 ? stats.replied / stats.messaged : 0;

    if (suppress && !hasReplied) {
      return {
        status: 'suppressed',
        tier,
        reason: 'company_replies',
        badgeLabel: 'Company replied',
        detailMessage: 'Replies already received from this company — follow-up not suggested for other contacts.',
        daysSinceFirstSent: Math.floor(daysSinceFirst),
        reminderCount,
        companyMessagedContacts: stats.messaged,
        companyRepliedContacts: stats.replied,
        companyReplyRatio: ratio,
        eligibleEmailJobId: null,
      };
    }

    const eligibleEmailJobId = this.pickEligibleReminderJobId(jobs);
    const tierLabel =
      tier === 1 ? 'First follow-up' : tier === 2 ? 'Second follow-up' : 'Final follow-up';

    return {
      status: 'suggested',
      tier,
      badgeLabel: 'Follow-up suggested',
      reason: 'eligible',
      detailMessage: tierLabel,
      daysSinceFirstSent: Math.floor(daysSinceFirst),
      reminderCount,
      companyMessagedContacts: stats.messaged,
      companyRepliedContacts: stats.replied,
      companyReplyRatio: ratio,
      eligibleEmailJobId,
    };
  }

  private pickEligibleReminderJobId(jobs: JobLite[]): string | null {
    const eligible = jobs.filter(
      (j) => j.sentAt && j.status === 'SENT' && j.replyCount === 0,
    );
    if (!eligible.length) return null;
    const prefer = eligible.filter((j) => !j.isReminder);
    const pool = prefer.length ? prefer : eligible;
    pool.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return pool[0].id;
  }
}
