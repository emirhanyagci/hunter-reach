import { Process, Processor, OnQueueFailed } from '@nestjs/bull';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { Job } from 'bull';
import * as fs from 'fs';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

@Processor('email-queue')
export class EmailProcessor {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => EmailService)) private emailService: EmailService,
  ) {}

  @Process('send-email')
  async handle(job: Job<{ emailJobId: string }>) {
    const { emailJobId } = job.data;
    this.logger.log(`Processing email job ${emailJobId}`);

    const emailJob = await this.prisma.emailJob.findUnique({
      where: { id: emailJobId },
      include: {
        contact: true,
        campaign: true,
        // Load the template with its attachments so we can include them in the email
        template: { include: { attachments: true } },
      },
    });

    if (!emailJob) {
      this.logger.warn(`Email job ${emailJobId} not found`);
      return;
    }

    if (emailJob.status === 'CANCELLED') {
      this.logger.log(`Email job ${emailJobId} was cancelled, skipping`);
      return;
    }

    if (emailJob.status === 'SENT') {
      this.logger.log(`Email job ${emailJobId} already sent, skipping`);
      return;
    }

    await this.prisma.emailJob.update({
      where: { id: emailJobId },
      data: { status: 'PROCESSING' },
    });

    try {
      // Resolve template attachments that still exist on disk
      const attachments = (emailJob.template?.attachments ?? [])
        .filter((a) => fs.existsSync(a.storagePath))
        .map((a) => ({
          filename: a.originalName,
          path: a.storagePath,
          contentType: a.mimeType,
        }));

      const result = await this.emailService.send({
        to: emailJob.contact.email,
        subject: emailJob.renderedSubject,
        html: emailJob.renderedBodyHtml,
        text: emailJob.renderedBodyText || undefined,
        userId: emailJob.campaign.userId,
        attachments,
        threadId: (emailJob as any).threadId ?? undefined,
      });

      await this.prisma.emailJob.update({
        where: { id: emailJobId },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          providerMessageId: result.id,
          threadId: result.threadId ?? null,
        },
      });

      this.logger.log(`✅ Email job ${emailJobId} sent to ${emailJob.contact.email}`);

      await this.markCampaignDoneIfComplete(emailJob.campaignId);
    } catch (err: any) {
      this.logger.error(`❌ Email job ${emailJobId} failed: ${err.message}`);

      await this.prisma.emailJob.update({
        where: { id: emailJobId },
        data: {
          status: 'FAILED',
          errorMessage: err.message,
          retryCount: { increment: 1 },
        },
      });

      throw err; // Re-throw so Bull retries
    }
  }

  @OnQueueFailed()
  async onJobFailed(job: Job<{ emailJobId: string }>, _err: Error) {
    const maxAttempts = job.opts.attempts ?? 1;
    const isFinalAttempt = job.attemptsMade >= maxAttempts;
    if (!isFinalAttempt) return;

    const { emailJobId } = job.data;
    const emailJob = await this.prisma.emailJob.findUnique({
      where: { id: emailJobId },
      select: { campaignId: true },
    });
    if (emailJob) {
      await this.markCampaignDoneIfComplete(emailJob.campaignId);
    }
  }

  private async markCampaignDoneIfComplete(campaignId: string) {
    const pendingCount = await this.prisma.emailJob.count({
      where: { campaignId, status: { in: ['SCHEDULED', 'PROCESSING'] } },
    });

    if (pendingCount === 0) {
      await this.prisma.campaign.updateMany({
        where: { id: campaignId, status: { in: ['SCHEDULED', 'SENDING'] } },
        data: { status: 'DONE' },
      });
      this.logger.log(`Campaign ${campaignId} marked as DONE`);
    }
  }
}
