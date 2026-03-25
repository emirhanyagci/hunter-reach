import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TemplateRendererService } from '../templates/template-renderer.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { CreateCampaignDto } from './campaigns.dto';
import { fromZonedTime } from 'date-fns-tz';

const GENDERIZE_BATCH_SIZE = 10;
const GENDER_CONFIDENCE_THRESHOLD = 0.75;

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    private prisma: PrismaService,
    private renderer: TemplateRendererService,
    private scheduler: SchedulerService,
  ) {}

  async findAll(userId: string) {
    return this.prisma.campaign.findMany({
      where: { userId },
      include: {
        template: { include: { category: true } },
        _count: { select: { emailJobs: true, campaignContacts: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, userId },
      include: {
        template: { include: { category: true } },
        campaignContacts: {
          include: {
            contact: true,
            assignedTemplate: { select: { id: true, name: true } },
          },
        },
        _count: { select: { emailJobs: true } },
      },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  // ── Gender detection via genderize.io ───────────────────────────────────────
  async detectGenders(contactIds: string[], userId: string) {
    const contacts = await this.prisma.contact.findMany({
      where: { id: { in: contactIds }, userId },
      select: { id: true, firstName: true },
    });

    const nameToContactIds = new Map<string, string[]>();
    for (const c of contacts) {
      const name = c.firstName?.trim().toLowerCase();
      if (name) {
        if (!nameToContactIds.has(name)) nameToContactIds.set(name, []);
        nameToContactIds.get(name)!.push(c.id);
      }
    }

    const uniqueNames = [...nameToContactIds.keys()];
    const genderByName = new Map<string, { gender: 'male' | 'female'; probability: number }>();

    for (let i = 0; i < uniqueNames.length; i += GENDERIZE_BATCH_SIZE) {
      const batch = uniqueNames.slice(i, i + GENDERIZE_BATCH_SIZE);
      try {
        const params = batch.map((n, idx) => `name[${idx}]=${encodeURIComponent(n)}`).join('&');
        const apiKey = process.env.GENDERIZE_API_KEY;
        const url = apiKey
          ? `https://api.genderize.io/?${params}&apikey=${apiKey}`
          : `https://api.genderize.io/?${params}`;

        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (res.ok) {
          const data = await res.json();
          const results: any[] = Array.isArray(data) ? data : [data];
          for (const r of results) {
            if (r.gender && r.probability != null) {
              genderByName.set(r.name.toLowerCase(), {
                gender: r.gender as 'male' | 'female',
                probability: r.probability,
              });
            }
          }
        }
      } catch (err) {
        this.logger.warn(`genderize.io batch ${i / GENDERIZE_BATCH_SIZE + 1} failed: ${err}`);
      }
    }

    const contactMap = new Map(contacts.map((c) => [c.id, c]));

    return contactIds.map((contactId) => {
      const contact = contactMap.get(contactId);
      const name = contact?.firstName?.trim().toLowerCase();
      const detection = name ? genderByName.get(name) : null;

      return {
        contactId,
        firstName: contact?.firstName ?? null,
        gender: detection?.gender ?? null,
        probability: detection?.probability ?? 0,
        autoAssigned: detection != null && detection.probability >= GENDER_CONFIDENCE_THRESHOLD,
      };
    });
  }

  // ── Campaign creation ────────────────────────────────────────────────────────
  async create(userId: string, dto: CreateCampaignDto) {
    const isRoutingMode = !!(dto.contactTemplateAssignments?.length);

    // In single-template mode, templateId is required
    if (!isRoutingMode && !dto.templateId) {
      throw new BadRequestException('templateId is required when not using routing mode');
    }

    if (!dto.contactIds?.length) throw new BadRequestException('At least one contact is required');

    const contacts = await this.prisma.contact.findMany({
      where: { id: { in: dto.contactIds }, userId, isValid: true },
    });
    if (!contacts.length) throw new BadRequestException('No valid contacts found');

    const timezone = dto.timezone || 'UTC';
    let scheduledAt: Date;
    if (dto.scheduledAt) {
      scheduledAt = fromZonedTime(new Date(dto.scheduledAt), timezone);
    } else {
      scheduledAt = new Date();
    }

    const contactGenders: Record<string, 'male' | 'female'> = dto.contactGenders ?? {};

    // Build per-contact template assignment map
    const assignmentMap = new Map<string, { templateId: string; routingSource: string }>();
    if (isRoutingMode) {
      for (const a of dto.contactTemplateAssignments!) {
        assignmentMap.set(a.contactId, { templateId: a.templateId, routingSource: a.routingSource });
      }
    }

    // Collect all template IDs we need to fetch
    const templateIdsNeeded = new Set<string>();
    if (dto.templateId) templateIdsNeeded.add(dto.templateId);
    for (const a of dto.contactTemplateAssignments ?? []) {
      if (a.templateId) templateIdsNeeded.add(a.templateId);
    }

    const templateList = await this.prisma.template.findMany({
      where: { id: { in: [...templateIdsNeeded] }, userId },
    });
    const templateById = new Map(templateList.map((t) => [t.id, t]));

    // Validate default template
    const defaultTemplate = dto.templateId ? templateById.get(dto.templateId) : null;
    if (!isRoutingMode && !defaultTemplate) {
      throw new NotFoundException('Template not found');
    }

    // Create campaign; templateId is the default/fallback
    const campaign = await this.prisma.campaign.create({
      data: {
        userId,
        name: dto.name,
        templateId: dto.templateId ?? null,
        scheduledAt,
        timezone,
        customSubject: dto.customSubject || null,
        customBodyHtml: dto.customBodyHtml || null,
        customBodyText: dto.customBodyText || null,
        status: dto.scheduledAt ? 'SCHEDULED' : 'SENDING',
        campaignContacts: {
          create: contacts.map((c) => {
            const assignment = assignmentMap.get(c.id);
            return {
              contactId: c.id,
              gender: contactGenders[c.id] ?? null,
              assignedTemplateId: assignment?.templateId ?? dto.templateId ?? null,
              routingSource: assignment?.routingSource ?? (dto.templateId ? 'auto' : null),
            };
          }),
        },
      },
    });

    // Pre-render and create email jobs
    const emailJobsData = contacts.map((contact) => {
      const assignment = assignmentMap.get(contact.id);
      const resolvedTemplateId = assignment?.templateId ?? dto.templateId;
      const template = resolvedTemplateId ? templateById.get(resolvedTemplateId) : null;

      if (!template) {
        // Contact has no template assigned — skip (shouldn't happen if frontend validates)
        this.logger.warn(`Contact ${contact.id} has no template assigned, skipping email job`);
        return null;
      }

      const gender = contactGenders[contact.id];
      const defaultSubject = dto.customSubject || template.subject;
      const defaultBodyHtml = dto.customBodyHtml || template.bodyHtml;
      const defaultBodyText = dto.customBodyText || template.bodyText;

      let subject = defaultSubject;
      let bodyHtml = defaultBodyHtml;
      let bodyText = defaultBodyText;

      if (gender === 'male') {
        subject = template.maleSubject || defaultSubject;
        bodyHtml = template.maleBodyHtml || defaultBodyHtml;
        bodyText = template.maleBodyText || defaultBodyText;
      } else if (gender === 'female') {
        subject = template.femaleSubject || defaultSubject;
        bodyHtml = template.femaleBodyHtml || defaultBodyHtml;
        bodyText = template.femaleBodyText || defaultBodyText;
      }

      const ctx = {
        ...contact,
        first_name: contact.firstName,
        last_name: contact.lastName,
        job_title: contact.jobTitle,
        phone_number: contact.phoneNumber,
        verification_status: contact.verificationStatus,
        ...(typeof contact.extraFields === 'object' ? contact.extraFields : {}),
      };

      return {
        campaignId: campaign.id,
        contactId: contact.id,
        templateId: template.id,
        renderedSubject: this.renderer.render(subject, ctx as any),
        renderedBodyHtml: this.renderer.render(bodyHtml, ctx as any),
        renderedBodyText: bodyText ? this.renderer.render(bodyText, ctx as any) : null,
        scheduledAt,
        status: 'SCHEDULED' as const,
      };
    }).filter((j): j is NonNullable<typeof j> => j !== null);

    await this.prisma.emailJob.createMany({ data: emailJobsData });

    const createdJobs = await this.prisma.emailJob.findMany({ where: { campaignId: campaign.id } });
    for (const job of createdJobs) {
      await this.scheduler.scheduleJob(job.id, scheduledAt);
    }

    return this.findOne(campaign.id, userId);
  }

  async cancel(id: string, userId: string) {
    const campaign = await this.findOne(id, userId);
    if (campaign.status === 'DONE') throw new BadRequestException('Campaign already completed');

    const jobs = await this.prisma.emailJob.findMany({
      where: { campaignId: id, status: { in: ['SCHEDULED', 'PROCESSING'] } },
    });
    for (const job of jobs) {
      await this.scheduler.cancelJob(job.id);
    }

    return this.prisma.campaign.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  async getStats(userId: string) {
    const [total, scheduled, sending, done, cancelled] = await Promise.all([
      this.prisma.campaign.count({ where: { userId } }),
      this.prisma.campaign.count({ where: { userId, status: 'SCHEDULED' } }),
      this.prisma.campaign.count({ where: { userId, status: 'SENDING' } }),
      this.prisma.campaign.count({ where: { userId, status: 'DONE' } }),
      this.prisma.campaign.count({ where: { userId, status: 'CANCELLED' } }),
    ]);

    const emailStats = await this.prisma.emailJob.groupBy({
      by: ['status'],
      where: { campaign: { userId } },
      _count: true,
    });

    return { campaigns: { total, scheduled, sending, done, cancelled }, emails: emailStats };
  }
}
