import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../prisma/prisma.service';
import type { OverdueScheduledEmailPolicy } from '../config/email-sending.config';

export type EnsureScheduledQueueResult =
  | 'ok'
  | 'recreated'
  | 'skipped_overdue_failed'
  | 'skipped_overdue_no_queue';

const OVERDUE_FAIL_MESSAGE =
  'Scheduled time passed while the system was unavailable (EMAIL_OVERDUE_SCHEDULED_POLICY=fail).';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @InjectQueue('email-queue') private emailQueue: Queue,
    private prisma: PrismaService,
  ) {}

  private getSendEmailOpts(emailJobId: string, delayMs: number) {
    return {
      jobId: emailJobId,
      delay: Math.max(0, delayMs),
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 60_000 },
      removeOnComplete: false,
      removeOnFail: false,
    };
  }

  /** Bull states where a job is still queued for execution (not finished / lost from “pending” perspective). */
  private isValidPendingBullState(state: string): boolean {
    return state === 'delayed' || state === 'waiting' || state === 'active' || state === 'paused';
  }

  /**
   * Ensures a delayed/waiting job exists for this emailJobId. Idempotent: skips if a valid pending job exists.
   * Removes stale completed/failed jobs and re-adds. Uses emailJobId as Bull jobId.
   */
  async ensureDelayedQueueJob(emailJobId: string, delayMs: number): Promise<'ok' | 'recreated'> {
    const bullJob = await this.emailQueue.getJob(emailJobId);
    if (bullJob) {
      const state = await bullJob.getState();
      if (this.isValidPendingBullState(state)) {
        return 'ok';
      }
      try {
        await bullJob.remove();
      } catch {
        /* ignore */
      }
    }

    await this.addSendEmailJob(emailJobId, delayMs);
    return 'recreated';
  }

  private async addSendEmailJob(emailJobId: string, delayMs: number): Promise<void> {
    const opts = this.getSendEmailOpts(emailJobId, delayMs);
    try {
      await this.emailQueue.add('send-email', { emailJobId }, opts);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/already exists|duplicate/i.test(msg)) {
        const j = await this.emailQueue.getJob(emailJobId);
        if (j && this.isValidPendingBullState(await j.getState())) {
          this.logger.debug(`addSendEmailJob: concurrent add for ${emailJobId}, job present`);
          return;
        }
      }
      throw err;
    }
  }

  /**
   * DB is source of truth: align Bull with a SCHEDULED row (startup / periodic reconciliation).
   */
  async ensureScheduledQueueJob(
    emailJobId: string,
    scheduledAt: Date,
    options: { manualSendTriggered: boolean; overduePolicy: OverdueScheduledEmailPolicy },
  ): Promise<EnsureScheduledQueueResult> {
    if (options.manualSendTriggered) {
      const imm = await this.ensureImmediateOrPromoted(emailJobId, false);
      return imm === 'ok' ? 'ok' : 'recreated';
    }

    const now = Date.now();
    const scheduledMs = scheduledAt.getTime();
    const isOverdue = scheduledMs < now;

    if (isOverdue) {
      if (options.overduePolicy === 'fail') {
        const updated = await this.prisma.emailJob.updateMany({
          where: { id: emailJobId, status: 'SCHEDULED' },
          data: { status: 'FAILED', errorMessage: OVERDUE_FAIL_MESSAGE },
        });
        if (updated.count > 0) {
          const bullJob = await this.emailQueue.getJob(emailJobId);
          if (bullJob) {
            try {
              await bullJob.remove();
            } catch {
              /* ignore */
            }
          }
        }
        return 'skipped_overdue_failed';
      }
      if (options.overduePolicy === 'skip_queue') {
        return 'skipped_overdue_no_queue';
      }
      const r = await this.ensureDelayedQueueJob(emailJobId, 0);
      return r === 'ok' ? 'ok' : 'recreated';
    }

    const delayMs = scheduledMs - now;
    const r = await this.ensureDelayedQueueJob(emailJobId, delayMs);
    return r === 'ok' ? 'ok' : 'recreated';
  }

  async scheduleJob(emailJobId: string, scheduledAt: Date): Promise<void> {
    const delayMs = Math.max(0, scheduledAt.getTime() - Date.now());
    const result = await this.ensureDelayedQueueJob(emailJobId, delayMs);
    this.logger.log(
      `Scheduled email job ${emailJobId} with delay ${delayMs}ms (${result === 'ok' ? 'already queued' : 'enqueued'})`,
    );
  }

  async cancelJob(emailJobId: string) {
    const job = await this.prisma.emailJob.findUnique({ where: { id: emailJobId } });
    if (!job) throw new NotFoundException('Email job not found');

    if (job.status === 'SENT') {
      return { success: false, message: 'Cannot cancel a sent email' };
    }

    const bullJob = await this.emailQueue.getJob(emailJobId);
    if (bullJob) {
      await bullJob.remove();
    }

    await this.prisma.emailJob.update({
      where: { id: emailJobId },
      data: { status: 'CANCELLED' },
    });

    return { success: true, message: 'Email job cancelled' };
  }

  async retryJob(emailJobId: string) {
    const job = await this.prisma.emailJob.findUnique({ where: { id: emailJobId } });
    if (!job) throw new NotFoundException('Email job not found');

    if (job.status !== 'FAILED') {
      return { success: false, message: 'Only failed jobs can be retried' };
    }

    await this.prisma.emailJob.update({
      where: { id: emailJobId },
      data: { status: 'SCHEDULED', errorMessage: null, manualSendTriggeredAt: null },
    });

    await this.ensureDelayedQueueJob(emailJobId, 0);

    return { success: true, message: 'Email job queued for retry' };
  }

  /**
   * Promotes or re-queues the Bull job so the email sends immediately.
   * Uses a DB claim (manualSendTriggeredAt) so concurrent Send Now / scheduled fire do not double-send.
   */
  async sendNow(emailJobId: string): Promise<{ success: boolean; message: string }> {
    const claim = await this.prisma.emailJob.updateMany({
      where: { id: emailJobId, status: 'SCHEDULED', manualSendTriggeredAt: null },
      data: { manualSendTriggeredAt: new Date() },
    });

    if (claim.count === 0) {
      const job = await this.prisma.emailJob.findUnique({ where: { id: emailJobId } });
      if (!job) throw new NotFoundException('Email job not found');
      if (job.status !== 'SCHEDULED') {
        throw new BadRequestException(`Cannot send now: email is ${job.status}`);
      }
      if (job.manualSendTriggeredAt) {
        return { success: true, message: 'Already queued for immediate send' };
      }
      throw new BadRequestException('Cannot send now');
    }

    try {
      await this.ensureImmediateOrPromoted(emailJobId, true);
    } catch (err: unknown) {
      await this.prisma.emailJob.updateMany({
        where: { id: emailJobId, status: 'SCHEDULED' },
        data: { manualSendTriggeredAt: null },
      });
      throw err;
    }

    return { success: true, message: 'Queued for immediate send' };
  }

  /**
   * Same jobId as DB row: promote delayed jobs, or add/replace when missing or terminal in Redis.
   * @param failIfActive when true (user “Send now”), concurrent active send is an error.
   */
  private async ensureImmediateOrPromoted(
    emailJobId: string,
    failIfActive: boolean,
  ): Promise<'ok' | 'recreated'> {
    const bullJob = await this.emailQueue.getJob(emailJobId);

    if (!bullJob) {
      await this.addSendEmailJob(emailJobId, 0);
      this.logger.log(`sendNow: queued new job ${emailJobId} (no existing Bull job)`);
      return 'recreated';
    }

    const state = await bullJob.getState();

    if (state === 'delayed') {
      try {
        await bullJob.promote();
        this.logger.log(`sendNow: promoted delayed job ${emailJobId}`);
      } catch {
        const after = await bullJob.getState();
        if (after === 'waiting' || after === 'active') {
          this.logger.log(`sendNow: promote raced for ${emailJobId}, now ${after}`);
          return 'ok';
        }
        throw new Error(`Could not promote job ${emailJobId} from delayed state`);
      }
      return 'recreated';
    }

    if (state === 'waiting' || state === 'paused') {
      this.logger.log(`sendNow: job ${emailJobId} already waiting (${state})`);
      return 'ok';
    }

    if (state === 'active') {
      if (failIfActive) {
        throw new ConflictException('This email is already being sent');
      }
      return 'ok';
    }

    if (state === 'completed' || state === 'failed') {
      await bullJob.remove();
      await this.addSendEmailJob(emailJobId, 0);
      this.logger.log(`sendNow: re-queued after removing stale ${state} job ${emailJobId}`);
      return 'recreated';
    }

    this.logger.warn(`sendNow: unexpected Bull state "${state}" for ${emailJobId}, removing and re-adding`);
    try {
      await bullJob.remove();
    } catch {
      /* ignore */
    }
    await this.addSendEmailJob(emailJobId, 0);
    return 'recreated';
  }
}
