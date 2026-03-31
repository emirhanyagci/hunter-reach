import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { addDays } from 'date-fns';
import { CompanyTrackerStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Polls for due company-tracker reminders and emails the account owner via the configured provider.
 * Recurring reminders reschedule `reminderAt` until cleared or `reminderStopOnApplied` + APPLIED.
 */
@Injectable()
export class CompanyNoteReminderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CompanyNoteReminderService.name);
  private interval: ReturnType<typeof setInterval> | null = null;
  private tickRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const ms = this.config.get<number>('COMPANY_REMINDER_SCAN_MS', 60_000);
    if (!ms || ms < 5_000) {
      this.logger.warn(
        `Company reminder scan disabled or interval too small (${ms}); set COMPANY_REMINDER_SCAN_MS >= 5000`,
      );
      return;
    }

    setImmediate(() => {
      this.runDueReminders().catch((err) =>
        this.logger.error(
          `Initial company reminder scan failed: ${err instanceof Error ? err.message : err}`,
        ),
      );
    });

    this.interval = setInterval(() => {
      this.runDueReminders().catch((err) =>
        this.logger.error(
          `Company reminder scan failed: ${err instanceof Error ? err.message : err}`,
        ),
      );
    }, ms);
    this.logger.log(`Company reminder scan every ${ms}ms`);
  }

  onModuleDestroy(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private nextReminderAt(
    status: CompanyTrackerStatus,
    recurrenceDays: number | null,
    stopOnApplied: boolean,
    now: Date,
  ): Date | null {
    if (!recurrenceDays || recurrenceDays < 1) return null;
    if (stopOnApplied && status === CompanyTrackerStatus.APPLIED) return null;
    return addDays(now, recurrenceDays);
  }

  async runDueReminders(): Promise<void> {
    if (this.tickRunning) return;
    this.tickRunning = true;
    const now = new Date();
    const baseUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000').replace(/\/$/, '');

    try {
      const due = await this.prisma.companyNote.findMany({
        where: {
          reminderAt: { lte: now, not: null },
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              gmailToken: { select: { email: true } },
            },
          },
        },
        take: 50,
        orderBy: { reminderAt: 'asc' },
      });

      for (const note of due) {
        const stillDue = await this.prisma.companyNote.findFirst({
          where: { id: note.id, reminderAt: { lte: now, not: null } },
        });
        if (!stillDue) continue;

        const subject = `[HunterReach] Reminder: ${note.companyName}`;
        const noteSnippet = note.content?.trim()
          ? escapeHtml(note.content.trim()).slice(0, 500)
          : '<em>No note text</em>';
        const trackerUrl = `${baseUrl}/dashboard/company-notes`;
        const html = `
<p>You asked to be reminded about <strong>${escapeHtml(note.companyName)}</strong>.</p>
<p style="white-space:pre-wrap">${noteSnippet}</p>
<p><a href="${trackerUrl}">Open company tracker</a></p>
<p style="font-size:12px;color:#666">Status: ${note.status}</p>
`.trim();

        const gmailConnected = note.user.gmailToken?.email?.trim();
        const smtpMailbox = this.config.get<string>('GMAIL_USER')?.trim();
        /** Prefer the mailbox that actually sends (OAuth Gmail or SMTP account) so "address not found" does not use a stale login email. */
        const to = gmailConnected || smtpMailbox || note.user.email?.trim() || '';
        const fromAddress = gmailConnected || smtpMailbox || undefined;

        if (!to) {
          this.logger.warn(
            `Company reminder skipped for note ${note.id}: no recipient (connect Gmail in Settings or set GMAIL_USER).`,
          );
          continue;
        }

        try {
          await this.emailService.send({
            to,
            subject,
            html,
            userId: note.user.id,
            fromAddress,
          });

          const nextAt = this.nextReminderAt(
            note.status,
            note.reminderRecurrenceDays,
            note.reminderStopOnApplied,
            now,
          );

          await this.prisma.companyNote.update({
            where: { id: note.id },
            data: {
              lastReminderSentAt: now,
              reminderAt: nextAt,
            },
          });

          this.logger.log(`Company reminder sent for note ${note.id} (${note.companyName})`);
        } catch (err) {
          this.logger.warn(
            `Company reminder failed for ${note.id}: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
    } finally {
      this.tickRunning = false;
    }
  }
}
