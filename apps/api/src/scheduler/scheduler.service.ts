import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @InjectQueue('email-queue') private emailQueue: Queue,
    private prisma: PrismaService,
  ) {}

  async scheduleJob(emailJobId: string, scheduledAt: Date): Promise<void> {
    const delayMs = Math.max(0, scheduledAt.getTime() - Date.now());

    await this.emailQueue.add(
      'send-email',
      { emailJobId },
      {
        jobId: emailJobId,
        delay: delayMs,
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: false,
        removeOnFail: false,
      },
    );

    this.logger.log(`Scheduled email job ${emailJobId} with delay ${delayMs}ms`);
  }

  async cancelJob(emailJobId: string) {
    const job = await this.prisma.emailJob.findUnique({ where: { id: emailJobId } });
    if (!job) throw new NotFoundException('Email job not found');

    if (job.status === 'SENT') {
      return { success: false, message: 'Cannot cancel a sent email' };
    }

    // Remove from Bull queue
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
      data: { status: 'SCHEDULED', errorMessage: null },
    });

    // Re-enqueue immediately
    await this.emailQueue.add(
      'send-email',
      { emailJobId },
      {
        jobId: `${emailJobId}-retry-${Date.now()}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
      },
    );

    return { success: true, message: 'Email job queued for retry' };
  }
}
