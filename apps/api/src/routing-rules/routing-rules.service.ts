import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoutingRuleDto, UpdateRoutingRuleDto, PreviewRoutingDto } from './routing-rules.dto';

export interface RoutingAssignment {
  contactId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  assignedTemplateId: string | null;
  assignedTemplateName: string | null;
  matchedCategory: string | null;
  routingSource: 'auto' | 'manual' | 'unmatched';
}

@Injectable()
export class RoutingRulesService {
  constructor(private prisma: PrismaService) {}

  findAll(userId: string) {
    return this.prisma.routingRule.findMany({
      where: { userId },
      include: { template: { select: { id: true, name: true, subject: true } } },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async create(userId: string, dto: CreateRoutingRuleDto) {
    const keywords = (dto.keywords ?? []).map((k) => k.trim()).filter(Boolean);
    const exactPhrases = (dto.exactPhrases ?? []).map((k) => k.trim()).filter(Boolean);
    if (!keywords.length && !exactPhrases.length) {
      throw new BadRequestException('Add at least one keyword (contains) or exact job-title phrase');
    }
    return this.prisma.routingRule.create({
      data: {
        userId,
        categoryName: dto.categoryName,
        keywords,
        exactPhrases,
        templateId: dto.templateId ?? null,
        priority: dto.priority ?? 0,
      },
      include: { template: { select: { id: true, name: true, subject: true } } },
    });
  }

  async update(id: string, userId: string, dto: UpdateRoutingRuleDto) {
    await this.findOne(id, userId);
    return this.prisma.routingRule.update({
      where: { id },
      data: {
        ...(dto.categoryName !== undefined && { categoryName: dto.categoryName }),
        ...(dto.keywords !== undefined && {
          keywords: dto.keywords.map((k) => k.trim()).filter(Boolean),
        }),
        ...(dto.exactPhrases !== undefined && {
          exactPhrases: dto.exactPhrases.map((k) => k.trim()).filter(Boolean),
        }),
        ...(dto.templateId !== undefined && { templateId: dto.templateId }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
      },
      include: { template: { select: { id: true, name: true, subject: true } } },
    });
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);
    return this.prisma.routingRule.delete({ where: { id } });
  }

  async findOne(id: string, userId: string) {
    const rule = await this.prisma.routingRule.findFirst({
      where: { id, userId },
      include: { template: { select: { id: true, name: true, subject: true } } },
    });
    if (!rule) throw new NotFoundException('Routing rule not found');
    return rule;
  }

  // ── Core routing logic ───────────────────────────────────────────────────────
  resolveTemplateForJobTitle(
    jobTitle: string | null,
    rules: {
      categoryName: string;
      keywords: string[];
      exactPhrases?: string[];
      templateId: string | null;
      priority: number;
    }[],
  ): { templateId: string | null; categoryName: string | null } {
    if (!jobTitle) return { templateId: null, categoryName: null };

    const lower = jobTitle.toLowerCase().trim();

    // Sort rules by priority descending so higher priority wins
    const sorted = [...rules].sort((a, b) => b.priority - a.priority);

    for (const rule of sorted) {
      const exactList = rule.exactPhrases ?? [];
      const exactMatch = exactList.some((p) => lower === p.toLowerCase().trim());
      const partialMatch = rule.keywords.some((kw) => lower.includes(kw.toLowerCase().trim()));
      if (exactMatch || partialMatch) {
        return { templateId: rule.templateId, categoryName: rule.categoryName };
      }
    }

    return { templateId: null, categoryName: null };
  }

  async previewRouting(userId: string, dto: PreviewRoutingDto): Promise<RoutingAssignment[]> {
    const [contacts, rules] = await Promise.all([
      this.prisma.contact.findMany({
        where: { id: { in: dto.contactIds }, userId },
        select: { id: true, email: true, firstName: true, lastName: true, jobTitle: true },
      }),
      this.prisma.routingRule.findMany({
        where: { userId },
        include: { template: { select: { id: true, name: true } } },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      }),
    ]);

    let fallbackTemplate: { id: string; name: string } | null = null;
    if (dto.fallbackTemplateId) {
      const t = await this.prisma.template.findFirst({
        where: { id: dto.fallbackTemplateId, userId },
        select: { id: true, name: true },
      });
      fallbackTemplate = t;
    }

    const contactMap = new Map(contacts.map((c) => [c.id, c]));

    return dto.contactIds.map((contactId) => {
      const contact = contactMap.get(contactId);
      if (!contact) {
        return {
          contactId,
          email: '',
          firstName: null,
          lastName: null,
          jobTitle: null,
          assignedTemplateId: fallbackTemplate?.id ?? null,
          assignedTemplateName: fallbackTemplate?.name ?? null,
          matchedCategory: null,
          routingSource: fallbackTemplate ? ('auto' as const) : ('unmatched' as const),
        };
      }

      const { templateId, categoryName } = this.resolveTemplateForJobTitle(contact.jobTitle, rules);

      if (templateId) {
        const rule = rules.find((r) => r.templateId === templateId && r.categoryName === categoryName);
        return {
          contactId,
          email: contact.email,
          firstName: contact.firstName,
          lastName: contact.lastName,
          jobTitle: contact.jobTitle,
          assignedTemplateId: templateId,
          assignedTemplateName: rule?.template?.name ?? null,
          matchedCategory: categoryName,
          routingSource: 'auto' as const,
        };
      }

      // No rule matched — fall back
      return {
        contactId,
        email: contact.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
        jobTitle: contact.jobTitle,
        assignedTemplateId: fallbackTemplate?.id ?? null,
        assignedTemplateName: fallbackTemplate?.name ?? null,
        matchedCategory: null,
        routingSource: fallbackTemplate ? ('auto' as const) : ('unmatched' as const),
      };
    });
  }
}
