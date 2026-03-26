import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  EmailSendingConfig,
  countJobsScheduledOnUtcDay,
  getEmailSendingConfig,
  utcDayBounds,
  utcHourBounds,
} from '../config/email-sending.config';

export interface SendingLimitsSnapshot {
  maxRecipientsPerCampaign: number;
  maxEmailsPerDay: number;
  maxEmailsPerHour: number;
  maxEmailsPerMinute: number;
  staggerJitterMs: number;
  sentTodayUtc: number;
  pendingScheduledTodayUtc: number;
  remainingQuotaTodayUtc: number;
  /** Sent in the current UTC hour (same window as hourly cap). */
  sentThisHourUtc: number;
  /** Jobs not yet sent that are planned for this UTC hour. */
  pendingScheduledThisHourUtc: number;
  remainingQuotaHourUtc: number;
}

@Injectable()
export class EmailSendingPolicyService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  private cfg(): EmailSendingConfig {
    return getEmailSendingConfig(this.configService);
  }

  async countSentTodayUtc(userId: string): Promise<number> {
    const { start, end } = utcDayBounds(new Date());
    return this.prisma.emailJob.count({
      where: {
        status: 'SENT',
        sentAt: { gte: start, lte: end },
        campaign: { userId },
      },
    });
  }

  /** Jobs not yet sent that are still planned for today (UTC calendar day). */
  async countPendingScheduledTodayUtc(userId: string): Promise<number> {
    const { start, end } = utcDayBounds(new Date());
    return this.prisma.emailJob.count({
      where: {
        status: { in: ['SCHEDULED', 'PROCESSING'] },
        scheduledAt: { gte: start, lte: end },
        campaign: { userId },
      },
    });
  }

  async countSentThisHourUtc(userId: string): Promise<number> {
    const { start, end } = utcHourBounds(new Date());
    return this.prisma.emailJob.count({
      where: {
        status: 'SENT',
        sentAt: { gte: start, lte: end },
        campaign: { userId },
      },
    });
  }

  async countPendingScheduledThisHourUtc(userId: string): Promise<number> {
    const { start, end } = utcHourBounds(new Date());
    return this.prisma.emailJob.count({
      where: {
        status: { in: ['SCHEDULED', 'PROCESSING'] },
        scheduledAt: { gte: start, lte: end },
        campaign: { userId },
      },
    });
  }

  /**
   * Enforce campaign size and daily quota for this user's UTC day.
   * `newJobTimes` must be the per-recipient scheduled times (after stagger).
   */
  assertCampaignPolicies(contactCount: number, newJobTimes: Date[], cfg: EmailSendingConfig): void {
    if (contactCount > cfg.maxRecipientsPerCampaign) {
      throw new BadRequestException({
        message: `This campaign exceeds the maximum of ${cfg.maxRecipientsPerCampaign} recipients. Reduce the list or raise EMAIL_MAX_RECIPIENTS_PER_CAMPAIGN.`,
        code: 'MAX_RECIPIENTS_PER_CAMPAIGN',
        maxRecipientsPerCampaign: cfg.maxRecipientsPerCampaign,
      });
    }

    const newJobsTodayUtc = countJobsScheduledOnUtcDay(newJobTimes, new Date());
    if (newJobsTodayUtc > cfg.maxEmailsPerDay) {
      throw new BadRequestException({
        message: `This campaign would schedule ${newJobsTodayUtc} emails for today (UTC), but the per-day limit is ${cfg.maxEmailsPerDay}. Schedule fewer recipients, pick a later start so more sends fall on later days, or raise EMAIL_MAX_PER_DAY.`,
        code: 'MAX_EMAILS_PER_DAY_SINGLE_CAMPAIGN',
        wouldScheduleToday: newJobsTodayUtc,
        maxEmailsPerDay: cfg.maxEmailsPerDay,
      });
    }
  }

  async assertDailyQuotaWithExisting(
    userId: string,
    newJobTimes: Date[],
    cfg: EmailSendingConfig,
  ): Promise<void> {
    const sentToday = await this.countSentTodayUtc(userId);
    const pendingToday = await this.countPendingScheduledTodayUtc(userId);
    const newToday = countJobsScheduledOnUtcDay(newJobTimes, new Date());
    const total = sentToday + pendingToday + newToday;

    if (total > cfg.maxEmailsPerDay) {
      throw new BadRequestException({
        message: `Daily sending limit reached for UTC today: ${sentToday} already sent, ${pendingToday} queued for today, this campaign adds ${newToday} (limit ${cfg.maxEmailsPerDay}). Try again tomorrow, reduce recipients, or increase EMAIL_MAX_PER_DAY.`,
        code: 'MAX_EMAILS_PER_DAY',
        sentTodayUtc: sentToday,
        pendingScheduledTodayUtc: pendingToday,
        newJobsTodayUtc: newToday,
        maxEmailsPerDay: cfg.maxEmailsPerDay,
      });
    }
  }

  async getSnapshot(userId: string): Promise<SendingLimitsSnapshot> {
    const cfg = this.cfg();
    const [
      sentTodayUtc,
      pendingScheduledTodayUtc,
      sentThisHourUtc,
      pendingScheduledThisHourUtc,
    ] = await Promise.all([
      this.countSentTodayUtc(userId),
      this.countPendingScheduledTodayUtc(userId),
      this.countSentThisHourUtc(userId),
      this.countPendingScheduledThisHourUtc(userId),
    ]);
    const usedDay = sentTodayUtc + pendingScheduledTodayUtc;
    const remainingQuotaTodayUtc = Math.max(0, cfg.maxEmailsPerDay - usedDay);
    const usedHour = sentThisHourUtc + pendingScheduledThisHourUtc;
    const remainingQuotaHourUtc = Math.max(0, cfg.maxEmailsPerHour - usedHour);

    return {
      maxRecipientsPerCampaign: cfg.maxRecipientsPerCampaign,
      maxEmailsPerDay: cfg.maxEmailsPerDay,
      maxEmailsPerHour: cfg.maxEmailsPerHour,
      maxEmailsPerMinute: cfg.maxEmailsPerMinute,
      staggerJitterMs: cfg.staggerJitterMs,
      sentTodayUtc,
      pendingScheduledTodayUtc,
      remainingQuotaTodayUtc,
      sentThisHourUtc,
      pendingScheduledThisHourUtc,
      remainingQuotaHourUtc,
    };
  }
}
