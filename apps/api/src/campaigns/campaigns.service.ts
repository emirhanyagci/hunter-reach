import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TemplateRendererService } from '../templates/template-renderer.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { CreateCampaignDto } from './campaigns.dto';
import { fromZonedTime } from 'date-fns-tz';
import {
  computeMinStaggerIntervalMs,
  computeStaggeredSchedule,
  getEmailSendingConfig,
} from '../config/email-sending.config';
import { EmailSendingPolicyService } from './email-sending-policy.service';
import { mergeTemplateContext } from '../templates/template-merge-context';

const GENDERIZE_BATCH_SIZE = 10;
const GENDER_CONFIDENCE_THRESHOLD = 0.70;

// Common Turkish male names
const TR_MALE_NAMES = new Set([
  'mutlu','furkan','nurettin','onur','kerem','sezgin','gokhan','gökhan','necmettin','tufan',
  'sinan','faruk','ertan','ilkay','mert','emre','burak','can','cem','deniz','ege','eren',
  'erhan','erkan','ersin','ertugrul','ertuğrul','ethem','fatih','ferit','ferhat','firat',
  'fırat','gürkan','hakan','haluk','hamit','harun','hasan','hayri','hikmet','huseyin',
  'hüseyin','ibrahim','ibrahim','ilhan','ilhan','ismail','kadir','kamil','kasim','kasım',
  'kemal','koray','korhan','korkut','levent','mahmut','mehmet','metin','mevlut','mevlüt',
  'murat','mustafa','naci','nail','namik','namık','nuri','oguz','oğuz','oktay','osman',
  'ozcan','özcan','ozgur','özgür','ramazan','recep','sami','selcuk','selçuk','sercan',
  'serdar','serhat','seven','suat','süleyman','suleyman','tahsin','tarik','tarık','tayfun',
  'timur','tolga','tuncer','turgay','turgut','türker','turker','ugur','uğur','uluc','uluç',
  'umut','ufuk','veli','volkan','yalcin','yalçın','yavuz','yigit','yiğit','yilmaz','yılmaz',
  'yuksel','yüksel','zafer','zeki','alp','alper','alpay','alphan','altan','altay','anil',
  'anıl','arif','arman','arslan','asim','aşım','atakan','atalay','atilla','attila','aydin',
  'aydın','aykut','baris','barış','bahadir','bahadır','berk','berkay','bilal','bilge',
  'bilgehan','bulent','bülent','caner','cagatay','çağatay','celal','cengiz','cenk','cuneyt',
  'cüneyt','dogan','doğan','doruk','dursun','edip','ekrem','elvan','engin','enis','ercument',
  'ercüment','erdem','erdogan','erdoğan','ergün','ergun','erkan','erol','eray',
]);

// Common Turkish female names
const TR_FEMALE_NAMES = new Set([
  'bahtisan','bahtişan','sinem','ayse','ayşe','fatma','zeynep','emine','hatice','meryem',
  'elif','esra','merve','ozlem','özlem','gulsen','gülşen','gonul','gönül','nuray','nurten',
  'mehtap','meltem','semra','serap','sevgi','sevil','sevim','seyma','şeyma','sibel','sule',
  'şule','sultan','suna','tuba','tugba','tuğba','tugce','tuğçe','turkan','türkan','ulku',
  'ülkü','umran','yasemin','yeliz','yelda','yesim','yeşim','yildiz','yıldız','zeliha',
  'zuhal','zubeyde','zübeyde','arzu','asli','aslı','asuman','aydan','aylin','aysegul',
  'ayşegül','ayten','bahar','belgin','berrin','beste','bilge','bircan','buket','burcu',
  'canan','cigdem','çiğdem','damla','defne','derya','duygu','ebru','ece','ecem','eda',
  'elvan','filiz','fulya','gamze','gulden','gülden','guler','güler','gulnur','gülnur',
  'gulsen','gülşen','gulsun','gülsün','guzide','güzide','habibe','hacer','hadiye','hafize',
  'hanife','hulya','hülya','huriye','inci','inci','ipek','kadriye','kamile','kamuran',
  'kubra','kübra','lamia','latife','leyla','lale','makbule','melike','melisa','mine',
  'mukaddes','nazan','nazli','nazlı','neriman','nevin','nevzat','nihal','nilufer','nilüfer',
  'nisa','nuran','nurdan','nur','ozge','özge','pinar','pınar','rahime','raziye','rukiye',
  'sabriye','safiye','sedef','selma','senay','şenay','sengul','şengül','serpil','sidika',
  'sıdıka','sunay','suzan','tuncay','vesile','vildan','zehra','zerrin','zumrut','zümrüt',
]);

function lookupTurkishGender(firstName: string): { gender: 'male' | 'female'; probability: number } | null {
  const name = firstName.trim().toLowerCase()
    .replace(/İ/g, 'i').replace(/I/g, 'ı');
  if (TR_MALE_NAMES.has(name)) return { gender: 'male', probability: 0.95 };
  if (TR_FEMALE_NAMES.has(name)) return { gender: 'female', probability: 0.95 };
  return null;
}

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    private prisma: PrismaService,
    private renderer: TemplateRendererService,
    private scheduler: SchedulerService,
    private configService: ConfigService,
    private emailSendingPolicy: EmailSendingPolicyService,
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

    // First pass: resolve from local Turkish name dictionary
    const namesToFetch: string[] = [];
    for (const name of uniqueNames) {
      const local = lookupTurkishGender(name);
      if (local) {
        genderByName.set(name, local);
      } else {
        namesToFetch.push(name);
      }
    }

    // Second pass: fetch remaining names from genderize.io with TR locale
    for (let i = 0; i < namesToFetch.length; i += GENDERIZE_BATCH_SIZE) {
      const batch = namesToFetch.slice(i, i + GENDERIZE_BATCH_SIZE);
      try {
        const params = batch.map((n, idx) => `name[${idx}]=${encodeURIComponent(n)}`).join('&');
        const apiKey = process.env.GENDERIZE_API_KEY;
        const baseUrl = `https://api.genderize.io/?${params}&country_id=TR`;
        const url = apiKey ? `${baseUrl}&apikey=${apiKey}` : baseUrl;

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
    let campaignStartUtc: Date;
    if (dto.scheduledAt) {
      campaignStartUtc = fromZonedTime(new Date(dto.scheduledAt), timezone);
    } else {
      campaignStartUtc = new Date();
    }

    const sendingCfg = getEmailSendingConfig(this.configService);
    const staggeredSendTimes = computeStaggeredSchedule(campaignStartUtc, contacts.length, sendingCfg);

    this.emailSendingPolicy.assertCampaignPolicies(contacts.length, staggeredSendTimes, sendingCfg);
    await this.emailSendingPolicy.assertDailyQuotaWithExisting(userId, staggeredSendTimes, sendingCfg);

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
        scheduledAt: campaignStartUtc,
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

    // Pre-render and create email jobs (each row gets its own staggered scheduledAt)
    const emailJobsData = contacts.map((contact, index) => {
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

      const perContactOverrides = dto.contactVariableOverrides?.[contact.id];
      const ctx = mergeTemplateContext(contact, perContactOverrides);

      return {
        campaignId: campaign.id,
        contactId: contact.id,
        templateId: template.id,
        renderedSubject: this.renderer.render(subject, ctx as any),
        renderedBodyHtml: this.renderer.render(bodyHtml, ctx as any),
        renderedBodyText: bodyText ? this.renderer.render(bodyText, ctx as any) : null,
        scheduledAt: staggeredSendTimes[index],
        status: 'SCHEDULED' as const,
      };
    }).filter((j): j is NonNullable<typeof j> => j !== null);

    await this.prisma.emailJob.createMany({ data: emailJobsData });

    const createdJobs = await this.prisma.emailJob.findMany({
      where: { campaignId: campaign.id },
      orderBy: { scheduledAt: 'asc' },
    });
    for (const job of createdJobs) {
      await this.scheduler.scheduleJob(job.id, job.scheduledAt);
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

  async getSendingLimits(userId: string) {
    const cfg = getEmailSendingConfig(this.configService);
    const snapshot = await this.emailSendingPolicy.getSnapshot(userId);
    return {
      ...snapshot,
      minStaggerIntervalMs: computeMinStaggerIntervalMs(cfg),
      queue: {
        limiterMaxPerWindow: cfg.queueLimiterMax,
        limiterWindowMs: cfg.queueLimiterDurationMs,
        concurrency: cfg.queueConcurrency,
      },
    };
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
