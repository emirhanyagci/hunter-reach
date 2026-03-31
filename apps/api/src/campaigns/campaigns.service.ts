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
const GENDERIZE_REQUEST_TIMEOUT_MS = 8000;
const GENDERIZE_TRANSIENT_RETRY_DELAY_MS = 1500;
const GENDER_CONFIDENCE_THRESHOLD = 0.70;

const GENDERIZE_LIMIT_USER_MESSAGE =
  'Gender detection limit reached — automatic detection could not continue. Please assign genders manually.';

const GENDERIZE_TIMEOUT_USER_MESSAGE =
  'Gender detection timed out — please choose the template variant manually.';

export type DetectGendersResultRow = {
  contactId: string;
  firstName: string | null;
  gender: 'male' | 'female' | null;
  probability: number;
  autoAssigned: boolean;
};

export type DetectGendersResponse = {
  results: DetectGendersResultRow[];
  externalDetectionBlocked?: boolean;
  externalDetectionMessage?: string;
};

type GenderizeExternalCtx = {
  stopped: boolean;
  message?: string;
};

/** genderize.io quota / rate limit / subscription signals — fail fast (no batch splitting or 429 backoff). */
function isGenderizeLimitOrQuotaSignal(status: number, bodyText: string, jsonError?: string | null): boolean {
  if (status === 429 || status === 402) return true;
  const combined = `${bodyText}\n${jsonError ?? ''}`;
  if (
    /\b(quota|rate limit|too many requests|request limit|daily limit|monthly limit|api limit|usage limit|throttl)\b/i.test(
      combined,
    )
  ) {
    return true;
  }
  if (
    /\b(limit reached|exceeded your|exceeded the|subscription|upgrade your|not enough credits|insufficient)\b/i.test(
      combined,
    )
  ) {
    return true;
  }
  if (status === 403 && /\b(limit|quota|api)\b/i.test(combined)) return true;
  return false;
}

function isAbortOrTimeoutError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
}

/** Stable key for dedupe + map lookup: trim, collapse spaces, strip BOM/ZWSP, NFC, Turkish lowercase. */
function normalizeFirstNameKey(raw: string): string {
  const collapsed = raw
    .trim()
    .replace(/[\uFEFF\u200B-\u200D]/g, '')
    .replace(/\s+/g, ' ');
  if (!collapsed) return '';
  return collapsed.normalize('NFC').toLocaleLowerCase('tr-TR');
}

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
  'yuksel','yüksel','zafer','zeki','efe','yusuf','alp','alper','alpay','alphan','altan','altay','anil',
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
  const name = normalizeFirstNameKey(firstName);
  if (!name) return null;
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
      const name = normalizeFirstNameKey(c.firstName ?? '');
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

    const genderDetectDebug =
      process.env.GENDER_DETECT_DEBUG === 'true' || process.env.GENDER_DETECT_DEBUG === '1';

    const mergeGenderizeResults = (batch: string[], results: any[]) => {
      if (results.length !== batch.length) {
        this.logger.warn(
          `genderize.io batch length mismatch: sent ${batch.length}, got ${results.length}`,
        );
      }
      const n = Math.min(results.length, batch.length);
      for (let idx = 0; idx < n; idx++) {
        const r = results[idx];
        const requestedKey = batch[idx];
        if (genderDetectDebug) {
          this.logger.log(
            `genderize row[${idx}] normalizedInput=${JSON.stringify(requestedKey)} api.name=${JSON.stringify(r?.name)} gender=${r?.gender} probability=${r?.probability}`,
          );
        }
        if (r?.gender && r.probability != null) {
          const detection = {
            gender: r.gender as 'male' | 'female',
            probability: r.probability,
          };
          genderByName.set(requestedKey, detection);
          const apiKeyNorm = r.name != null ? normalizeFirstNameKey(String(r.name)) : '';
          if (apiKeyNorm && apiKeyNorm !== requestedKey) {
            genderByName.set(apiKeyNorm, detection);
          }
        } else if (genderDetectDebug) {
          this.logger.log(
            `genderize no prediction for normalizedInput=${JSON.stringify(requestedKey)} (gender=${r?.gender}, count=${r?.count})`,
          );
        }
      }
    };

    const externalCtx: GenderizeExternalCtx = { stopped: false };

    const fetchGenderizeBatch = async (
      batch: string[],
      countryId: string | null,
      allowTransientRetry: boolean,
    ): Promise<void> => {
      if (batch.length === 0 || externalCtx.stopped) return;

      const params = batch.map((n, idx) => `name[${idx}]=${encodeURIComponent(n)}`).join('&');
      const apiKey = process.env.GENDERIZE_API_KEY;
      let baseUrl = `https://api.genderize.io/?${params}`;
      if (countryId) baseUrl += `&country_id=${countryId}`;
      const url = apiKey ? `${baseUrl}&apikey=${encodeURIComponent(apiKey)}` : baseUrl;

      if (genderDetectDebug) {
        this.logger.log(
          `genderize request batchSize=${batch.length} countryId=${countryId ?? 'none'} names=${JSON.stringify(batch)}`,
        );
      }

      const doFetch = () =>
        fetch(url, { signal: AbortSignal.timeout(GENDERIZE_REQUEST_TIMEOUT_MS) });

      try {
        const res = await doFetch();
        const bodyText = await res.text();

        if (!res.ok) {
          this.logger.warn(
            `genderize.io HTTP ${res.status} (countryId=${countryId ?? 'none'}): ${bodyText.slice(0, 500)}`,
          );
          if (isGenderizeLimitOrQuotaSignal(res.status, bodyText, null)) {
            externalCtx.stopped = true;
            externalCtx.message = GENDERIZE_LIMIT_USER_MESSAGE;
          }
          return;
        }

        let data: unknown;
        try {
          data = JSON.parse(bodyText);
        } catch {
          this.logger.warn(`genderize.io invalid JSON: ${bodyText.slice(0, 400)}`);
          return;
        }

        if (genderDetectDebug) {
          this.logger.log(`genderize raw response: ${bodyText.slice(0, 2500)}`);
        }

        if (data && typeof data === 'object' && !Array.isArray(data) && 'error' in data) {
          const msg = String((data as { error?: string }).error ?? JSON.stringify(data));
          this.logger.warn(`genderize.io error payload: ${msg}`);
          if (isGenderizeLimitOrQuotaSignal(200, bodyText, msg)) {
            externalCtx.stopped = true;
            externalCtx.message = GENDERIZE_LIMIT_USER_MESSAGE;
          }
          return;
        }

        const results: any[] = Array.isArray(data) ? data : [data];
        mergeGenderizeResults(batch, results);
      } catch (err) {
        this.logger.warn(
          `genderize.io request failed (countryId=${countryId ?? 'none'}, batchSize=${batch.length}): ${err}`,
        );
        if (isAbortOrTimeoutError(err)) {
          externalCtx.stopped = true;
          externalCtx.message = GENDERIZE_TIMEOUT_USER_MESSAGE;
          return;
        }
        if (allowTransientRetry) {
          await new Promise((r) => setTimeout(r, GENDERIZE_TRANSIENT_RETRY_DELAY_MS));
          await fetchGenderizeBatch(batch, countryId, false);
        }
      }
    };

    // Second pass: genderize.io with TR (then global fallback for still-unknown names)
    for (let i = 0; i < namesToFetch.length; i += GENDERIZE_BATCH_SIZE) {
      if (externalCtx.stopped) break;
      const batch = namesToFetch.slice(i, i + GENDERIZE_BATCH_SIZE);
      await fetchGenderizeBatch(batch, 'TR', true);
    }

    const stillMissing = namesToFetch.filter((n) => !genderByName.has(n));
    if (stillMissing.length && !externalCtx.stopped) {
      if (genderDetectDebug) {
        this.logger.log(
          `genderize global fallback for ${stillMissing.length} name(s) still missing after TR`,
        );
      }
      for (let i = 0; i < stillMissing.length; i += GENDERIZE_BATCH_SIZE) {
        if (externalCtx.stopped) break;
        const batch = stillMissing.slice(i, i + GENDERIZE_BATCH_SIZE);
        await fetchGenderizeBatch(batch, null, true);
      }
    }

    const contactMap = new Map(contacts.map((c) => [c.id, c]));

    const results: DetectGendersResultRow[] = contactIds.map((contactId) => {
      const contact = contactMap.get(contactId);
      const name = contact?.firstName ? normalizeFirstNameKey(contact.firstName) : '';
      const detection = name ? genderByName.get(name) : null;

      return {
        contactId,
        firstName: contact?.firstName ?? null,
        gender: detection?.gender ?? null,
        probability: detection?.probability ?? 0,
        autoAssigned: detection != null && detection.probability >= GENDER_CONFIDENCE_THRESHOLD,
      };
    });

    const out: DetectGendersResponse = { results };
    if (externalCtx.stopped) {
      out.externalDetectionBlocked = true;
      out.externalDetectionMessage = externalCtx.message ?? GENDERIZE_LIMIT_USER_MESSAGE;
    }
    return out;
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
