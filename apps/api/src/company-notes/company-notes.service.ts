import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CompanyTrackerStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCompanyNoteDto,
  UpdateCompanyNoteDto,
  CompanyNotesFilterDto,
} from './company-notes.dto';

type NoteLink = { label: string; url: string };

@Injectable()
export class CompanyNotesService {
  constructor(private prisma: PrismaService) {}

  private coerceLinks(raw: unknown): NoteLink[] {
    if (!Array.isArray(raw)) return [];
    const out: NoteLink[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const url = typeof o.url === 'string' ? o.url.trim() : '';
      if (!url) continue;
      const label = typeof o.label === 'string' && o.label.trim() ? o.label.trim() : url;
      out.push({ label, url });
    }
    return out;
  }

  async findAll(userId: string, filter: CompanyNotesFilterDto) {
    const { page = 1, limit = 50, search, status, hideArchived } = filter;
    const skip = (page - 1) * limit;

    const where: Prisma.CompanyNoteWhereInput = { userId };
    if (status) {
      where.status = status;
    } else if (hideArchived === true) {
      where.status = { not: CompanyTrackerStatus.ARCHIVED };
    }
    if (search) {
      where.OR = [
        { companyName: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.companyNote.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          userId: true,
          companyName: true,
          content: true,
          links: true,
          status: true,
          sourceContactId: true,
          appliedAt: true,
          reminderAt: true,
          reminderTimezone: true,
          reminderRecurrenceDays: true,
          reminderStopOnApplied: true,
          lastReminderSentAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.companyNote.count({ where }),
    ]);

    return {
      data: data.map((row) => ({
        ...row,
        links: this.coerceLinks(row.links),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, userId: string) {
    const note = await this.prisma.companyNote.findFirst({
      where: { id, userId },
    });
    if (!note) throw new NotFoundException('Company note not found');
    return { ...note, links: this.coerceLinks(note.links) };
  }

  async getContactCompanySuggestions(userId: string, q?: string, limit = 40) {
    const take = Math.min(Math.max(limit, 1), 100);
    const where: Prisma.ContactWhereInput = {
      userId,
      company: { not: null },
    };
    const qt = q?.trim();
    if (qt) {
      where.company = { contains: qt, mode: 'insensitive' };
    }

    const rows = await this.prisma.contact.findMany({
      where,
      select: { id: true, company: true },
      take: 600,
      orderBy: { createdAt: 'desc' },
    });

    const seen = new Map<string, string>();
    for (const r of rows) {
      const name = (r.company ?? '').trim();
      if (!name) continue;
      if (!seen.has(name)) seen.set(name, r.id);
    }

    const data = [...seen.entries()].slice(0, take).map(([companyName, sampleContactId]) => ({
      companyName,
      sampleContactId,
    }));

    return { data };
  }

  async create(userId: string, dto: CreateCompanyNoteDto) {
    let companyName = dto.companyName?.trim() ?? '';
    let sourceContactId: string | null = dto.sourceContactId ?? null;

    if (sourceContactId) {
      const contact = await this.prisma.contact.findFirst({
        where: { id: sourceContactId, userId },
      });
      if (!contact) throw new NotFoundException('Contact not found');
      const fromContact = (contact.company ?? '').trim();
      if (!fromContact) {
        throw new BadRequestException('Selected contact has no company name');
      }
      if (!companyName) companyName = fromContact;
    }

    if (!companyName) {
      throw new BadRequestException('Company name is required (or pick a contact with a company)');
    }

    const reminderAt =
      dto.reminderAt && dto.reminderAt.trim() ? new Date(dto.reminderAt) : null;
    if (reminderAt && Number.isNaN(reminderAt.getTime())) {
      throw new BadRequestException('Invalid reminderAt');
    }

    return this.prisma.companyNote.create({
      data: {
        userId,
        companyName,
        content: dto.content ?? '',
        links: (dto.links ?? []) as unknown as Prisma.InputJsonValue,
        status: dto.status ?? CompanyTrackerStatus.INTERESTED,
        sourceContactId,
        appliedAt:
          dto.status === CompanyTrackerStatus.APPLIED ? new Date() : null,
        reminderAt,
        reminderTimezone: dto.reminderTimezone?.trim() || 'UTC',
        reminderRecurrenceDays: dto.reminderRecurrenceDays ?? null,
        reminderStopOnApplied: dto.reminderStopOnApplied ?? true,
      },
    }).then((row) => ({ ...row, links: this.coerceLinks(row.links) }));
  }

  async update(id: string, userId: string, dto: UpdateCompanyNoteDto) {
    const prev = await this.prisma.companyNote.findFirst({ where: { id, userId } });
    if (!prev) throw new NotFoundException('Company note not found');

    const data: Prisma.CompanyNoteUpdateInput = {};

    if (dto.companyName !== undefined) data.companyName = dto.companyName.trim();
    if (dto.content !== undefined) data.content = dto.content;
    if (dto.links !== undefined) {
      data.links = dto.links as unknown as Prisma.InputJsonValue;
    }

    if (dto.sourceContactId !== undefined) {
      if (dto.sourceContactId === null) {
        data.sourceContact = { disconnect: true };
      } else {
        const contact = await this.prisma.contact.findFirst({
          where: { id: dto.sourceContactId, userId },
        });
        if (!contact) throw new NotFoundException('Contact not found');
        data.sourceContact = { connect: { id: dto.sourceContactId } };
      }
    }

    if (dto.status !== undefined) {
      data.status = dto.status;
      if (dto.status === CompanyTrackerStatus.APPLIED) {
        data.appliedAt = new Date();
      } else if (prev.status === CompanyTrackerStatus.APPLIED) {
        data.appliedAt = null;
      }
    }

    if (dto.reminderAt !== undefined) {
      if (dto.reminderAt === null || dto.reminderAt === '') {
        data.reminderAt = null;
      } else {
        const d = new Date(dto.reminderAt);
        if (Number.isNaN(d.getTime())) throw new BadRequestException('Invalid reminderAt');
        data.reminderAt = d;
      }
    }

    if (dto.reminderTimezone !== undefined) {
      data.reminderTimezone = dto.reminderTimezone.trim() || 'UTC';
    }

    if (dto.reminderRecurrenceDays !== undefined) {
      data.reminderRecurrenceDays = dto.reminderRecurrenceDays;
    }

    if (dto.reminderStopOnApplied !== undefined) {
      data.reminderStopOnApplied = dto.reminderStopOnApplied;
    }

    const row = await this.prisma.companyNote.update({
      where: { id },
      data,
    });
    return { ...row, links: this.coerceLinks(row.links) };
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);
    await this.prisma.companyNote.delete({ where: { id } });
    return { success: true };
  }
}
