import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { EmailService } from './email.service';
import { TemplateRendererService } from '../templates/template-renderer.service';

class SendReminderDto {
  @IsArray()
  emailJobIds: string[];

  @IsString()
  templateId: string;

  @IsOptional()
  @IsString()
  customSubject?: string;

  @IsOptional()
  @IsString()
  customBodyHtml?: string;
}

@ApiTags('email-jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('email-jobs')
export class EmailJobsController {
  constructor(
    private prisma: PrismaService,
    private schedulerService: SchedulerService,
    private emailService: EmailService,
    private renderer: TemplateRendererService,
  ) {}

  @Get()
  async findAll(
    @Query('status') status: string,
    @Query('campaignId') campaignId: string,
    @Query('email') email: string,
    @Query('company') company: string,
    @Query('templateId') templateId: string,
    @Query('replied') replied: string,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Request() req,
  ) {
    const p = parseInt(page, 10);
    const l = parseInt(limit, 10);
    const skip = (p - 1) * l;

    const where: any = {
      campaign: { userId: req.user.sub },
    };

    if (status && status !== 'all') {
      if (status === 'NOT_REPLIED') {
        where.status = 'SENT';
        where.replyCount = 0;
      } else {
        where.status = status.toUpperCase();
      }
    }

    if (campaignId) where.campaignId = campaignId;
    if (templateId) where.templateId = templateId;

    if (replied === 'true') {
      where.replyCount = { gt: 0 };
    } else if (replied === 'false') {
      where.status = 'SENT';
      where.replyCount = 0;
    }

    if (email) {
      where.contact = { email: { contains: email, mode: 'insensitive' } };
    }
    if (company) {
      where.contact = { ...where.contact, company: { contains: company, mode: 'insensitive' } };
    }

    if (dateFrom || dateTo) {
      where.sentAt = {};
      if (dateFrom) where.sentAt.gte = new Date(dateFrom);
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        where.sentAt.lte = to;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.emailJob.findMany({
        where,
        skip,
        take: l,
        include: {
          contact: true,
          campaign: { include: { template: true } },
          template: { select: { id: true, name: true } },
        },
        orderBy: { scheduledAt: 'desc' },
      }),
      this.prisma.emailJob.count({ where }),
    ]);

    return { data, total, page: p, limit: l, totalPages: Math.ceil(total / l) };
  }

  @Get('contact/:contactId')
  async getContactActivity(
    @Param('contactId') contactId: string,
    @Request() req,
  ) {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, userId: req.user.sub },
    });
    if (!contact) throw new BadRequestException('Contact not found');

    const jobs = await this.prisma.emailJob.findMany({
      where: { contactId },
      include: {
        campaign: { select: { id: true, name: true } },
        template: { select: { id: true, name: true } },
        events: { orderBy: { occurredAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Determine aggregate contact email status
    const hasReplied = jobs.some((j) => j.replyCount > 0 || (j as any).status === 'REPLIED');
    const hasSent = jobs.some((j) => j.status === 'SENT' || (j as any).status === 'REPLIED');
    const hasScheduled = jobs.some((j) => j.status === 'SCHEDULED');

    let contactEmailStatus: 'never_contacted' | 'scheduled' | 'sent' | 'replied' = 'never_contacted';
    if (hasReplied) contactEmailStatus = 'replied';
    else if (hasSent) contactEmailStatus = 'sent';
    else if (hasScheduled) contactEmailStatus = 'scheduled';

    return { contact, jobs, emailStatus: contactEmailStatus };
  }

  /** Static path before @Get(':id') so "send-now" is never captured as an id. */
  @Post('send-now/:id')
  async sendNow(@Param('id') id: string, @Request() req) {
    const job = await this.prisma.emailJob.findFirst({
      where: { id, campaign: { userId: req.user.sub } },
      select: { id: true, status: true },
    });
    if (!job) throw new NotFoundException('Email job not found');
    if (job.status !== 'SCHEDULED') {
      throw new BadRequestException('Only scheduled emails can be sent immediately');
    }
    return this.schedulerService.sendNow(id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.prisma.emailJob.findUnique({
      where: { id },
      include: {
        contact: true,
        campaign: { include: { template: true } },
        template: { select: { id: true, name: true } },
        events: { orderBy: { occurredAt: 'desc' } },
      },
    });
  }

  @Patch(':id/cancel')
  async cancel(@Param('id') id: string) {
    return this.schedulerService.cancelJob(id);
  }

  @Patch(':id/retry')
  async retry(@Param('id') id: string) {
    return this.schedulerService.retryJob(id);
  }

  @Post('remind')
  async sendReminders(@Body() dto: SendReminderDto, @Request() req) {
    const userId = req.user.sub;

    // Load template
    const template = await this.prisma.template.findFirst({
      where: { id: dto.templateId, userId },
      include: { attachments: true },
    });
    if (!template) throw new BadRequestException('Template not found');

    // Load the original email jobs — only sent, unreplied jobs owned by this user
    const originalJobs = await this.prisma.emailJob.findMany({
      where: {
        id: { in: dto.emailJobIds },
        campaign: { userId },
        status: 'SENT',
        replyCount: 0,
      },
      include: {
        contact: true,
        campaign: true,
      },
    });

    if (originalJobs.length === 0) {
      throw new BadRequestException('No eligible jobs found. Only sent, un-replied jobs can receive reminders.');
    }

    const results: { jobId: string; contactEmail: string; success: boolean; error?: string }[] = [];

    for (const originalJob of originalJobs) {
      const contact = originalJob.contact;

      // Build merge context from contact
      const mergeContext: Record<string, string> = {
        firstName: contact.firstName ?? '',
        lastName: contact.lastName ?? '',
        email: contact.email,
        company: contact.company ?? '',
        jobTitle: contact.jobTitle ?? '',
        ...(contact.extraFields as Record<string, string> ?? {}),
      };

      // Pick gender-specific template fields
      const gender = contact.gender;
      const useSubject = gender === 'male' && template.maleSubject
        ? template.maleSubject
        : gender === 'female' && template.femaleSubject
        ? template.femaleSubject
        : template.subject;
      const useBodyHtml = gender === 'male' && template.maleBodyHtml
        ? template.maleBodyHtml
        : gender === 'female' && template.femaleBodyHtml
        ? template.femaleBodyHtml
        : template.bodyHtml;

      const renderedSubject = dto.customSubject
        ? this.renderer.render(dto.customSubject, mergeContext)
        : this.renderer.render(useSubject, mergeContext);
      const renderedBodyHtml = dto.customBodyHtml
        ? this.renderer.render(dto.customBodyHtml, mergeContext)
        : this.renderer.render(useBodyHtml, mergeContext);

      try {
        const sendResult = await this.emailService.send({
          to: contact.email,
          subject: renderedSubject,
          html: renderedBodyHtml,
          userId,
          // Send as reply in the same Gmail thread if threadId is available
          threadId: (originalJob as any).threadId ?? undefined,
        });

        // Create a new EmailJob row for tracking
        await this.prisma.emailJob.create({
          data: {
            campaignId: originalJob.campaignId,
            contactId: contact.id,
            templateId: template.id,
            renderedSubject,
            renderedBodyHtml,
            status: 'SENT',
            scheduledAt: new Date(),
            sentAt: new Date(),
            providerMessageId: sendResult.id,
            threadId: sendResult.threadId ?? (originalJob as any).threadId ?? null,
            isReminder: true,
            parentJobId: originalJob.id,
          } as any,
        });

        results.push({ jobId: originalJob.id, contactEmail: contact.email, success: true });
      } catch (err: any) {
        results.push({ jobId: originalJob.id, contactEmail: contact.email, success: false, error: err.message });
      }
    }

    const sent = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return { sent, failed, results };
  }
}
