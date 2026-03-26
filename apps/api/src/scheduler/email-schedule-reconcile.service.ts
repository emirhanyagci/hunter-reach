import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { getScheduleReconcileConfig } from '../config/email-sending.config';
import { SchedulerService } from './scheduler.service';

export interface ScheduleReconcileStats {
  scanned: number;
  ok: number;
  recreated: number;
  skippedOverdueFailed: number;
  skippedOverdueNoQueue: number;
  errors: number;
}

/**
 * Restores Bull queue entries from DB after Redis/backend restarts. DB is the source of truth;
 * Redis is the execution layer. Idempotent: uses queue.getJob(emailJobId) before enqueueing.
 */
@Injectable()
export class EmailScheduleReconcileService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailScheduleReconcileService.name);
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: SchedulerService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    setImmediate(() => {
      this.runReconcile('startup').catch((err) =>
        this.logger.error(`Startup schedule reconcile failed: ${err instanceof Error ? err.message : err}`),
      );
    });

    const { periodicIntervalMs } = getScheduleReconcileConfig(this.configService);
    if (periodicIntervalMs > 0) {
      this.interval = setInterval(() => {
        this.runReconcile('periodic').catch((err) =>
          this.logger.error(`Periodic schedule reconcile failed: ${err instanceof Error ? err.message : err}`),
        );
      }, periodicIntervalMs);
      this.logger.log(`Periodic email schedule reconcile every ${periodicIntervalMs}ms`);
    }
  }

  onModuleDestroy(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /** Re-scan SCHEDULED email jobs and ensure each has a matching Bull job (by email job id). */
  async runReconcile(reason: 'startup' | 'periodic' | 'manual' = 'manual'): Promise<ScheduleReconcileStats> {
    const { overduePolicy } = getScheduleReconcileConfig(this.configService);

    const stats: ScheduleReconcileStats = {
      scanned: 0,
      ok: 0,
      recreated: 0,
      skippedOverdueFailed: 0,
      skippedOverdueNoQueue: 0,
      errors: 0,
    };

    const jobs = await this.prisma.emailJob.findMany({
      where: {
        status: 'SCHEDULED',
        campaign: { status: { not: 'CANCELLED' } },
      },
      select: {
        id: true,
        scheduledAt: true,
        manualSendTriggeredAt: true,
      },
    });

    stats.scanned = jobs.length;

    for (const job of jobs) {
      try {
        const result = await this.scheduler.ensureScheduledQueueJob(job.id, job.scheduledAt, {
          manualSendTriggered: job.manualSendTriggeredAt != null,
          overduePolicy,
        });
        switch (result) {
          case 'ok':
            stats.ok += 1;
            break;
          case 'recreated':
            stats.recreated += 1;
            break;
          case 'skipped_overdue_failed':
            stats.skippedOverdueFailed += 1;
            break;
          case 'skipped_overdue_no_queue':
            stats.skippedOverdueNoQueue += 1;
            break;
          default:
            break;
        }
      } catch (err) {
        stats.errors += 1;
        this.logger.warn(
          `Reconcile failed for email job ${job.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    if (stats.scanned > 0 || reason === 'startup') {
      this.logger.log(
        `[${reason}] Schedule reconcile: scanned=${stats.scanned} ok=${stats.ok} recreated=${stats.recreated} ` +
          `overdueFailed=${stats.skippedOverdueFailed} overdueNoQueue=${stats.skippedOverdueNoQueue} errors=${stats.errors}`,
      );
    }

    return stats;
  }
}
