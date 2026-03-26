import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ContactsFilterDto, CreateContactDto, UpdateContactDto } from './contacts.dto';

/** Mirrors emailStatus derivation in findAll / findOne (emailJobs ordered by createdAt desc). */
function emailStatusWhere(
  status: 'never_contacted' | 'scheduled' | 'sent' | 'replied' | 'not_replied',
): Prisma.ContactWhereInput {
  const jobIndicatesReplied: Prisma.EmailJobWhereInput = {
    OR: [{ replyCount: { gt: 0 } }, { status: 'REPLIED' }],
  };
  switch (status) {
    case 'not_replied':
      return { NOT: { emailJobs: { some: jobIndicatesReplied } } };
    case 'replied':
      return { emailJobs: { some: jobIndicatesReplied } };
    case 'sent':
      return {
        AND: [
          { NOT: { emailJobs: { some: jobIndicatesReplied } } },
          { emailJobs: { some: { status: 'SENT' } } },
        ],
      };
    case 'scheduled':
      return {
        AND: [
          { emailJobs: { some: { status: 'SCHEDULED' } } },
          {
            NOT: {
              emailJobs: {
                some: {
                  OR: [{ status: 'SENT' }, { status: 'REPLIED' }, { replyCount: { gt: 0 } }],
                },
              },
            },
          },
        ],
      };
    case 'never_contacted':
      return {
        NOT: {
          emailJobs: {
            some: {
              OR: [
                { replyCount: { gt: 0 } },
                { status: 'REPLIED' },
                { status: 'SENT' },
                { status: 'SCHEDULED' },
              ],
            },
          },
        },
      };
    default:
      return {};
  }
}

@Injectable()
export class ContactsService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string, filter: ContactsFilterDto) {
    const {
      page = 1,
      limit = 50,
      importId,
      search,
      jobTitle,
      company,
      verificationStatus,
      scoreMin,
      scoreMax,
      tags,
      tag,
      gender,
      hasLinkedin,
      emailStatus,
    } = filter;
    const skip = (page - 1) * limit;

    const where: Prisma.ContactWhereInput = { userId };
    if (importId) where.importId = importId;
    if (verificationStatus) where.verificationStatus = verificationStatus;
    if (jobTitle) where.jobTitle = { contains: jobTitle, mode: 'insensitive' };
    if (company) where.company = { contains: company, mode: 'insensitive' };
    if (scoreMin !== undefined || scoreMax !== undefined) {
      where.score = {};
      if (scoreMin !== undefined) where.score.gte = scoreMin;
      if (scoreMax !== undefined) where.score.lte = scoreMax;
    }

    const andParts: Prisma.ContactWhereInput[] = [];
    if (emailStatus) andParts.push(emailStatusWhere(emailStatus));
    if (search) {
      andParts.push({
        OR: [
          { email: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { company: { contains: search, mode: 'insensitive' } },
        ],
      });
    }
    if (tags?.length) andParts.push({ tags: { hasSome: tags } });
    if (tag?.trim()) andParts.push({ tags: { has: tag.trim() } });
    if (gender) {
      if (gender === '_unset') {
        andParts.push({ OR: [{ gender: null }, { gender: '' }] });
      } else {
        andParts.push({ gender: { equals: gender, mode: 'insensitive' } });
      }
    }
    if (hasLinkedin === true) {
      andParts.push({
        AND: [{ linkedin: { not: null } }, { NOT: { linkedin: '' } }],
      });
    }
    if (hasLinkedin === false) {
      andParts.push({ OR: [{ linkedin: null }, { linkedin: '' }] });
    }
    if (andParts.length) {
      const existingAnd = (where.AND as Prisma.ContactWhereInput[] | undefined) ?? [];
      where.AND = [...existingAnd, ...andParts];
    }

    const [contacts, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          emailJobs: {
            select: { status: true, replyCount: true, sentAt: true, scheduledAt: true },
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
      this.prisma.contact.count({ where }),
    ]);

    const data = contacts.map((c) => {
      const jobs = c.emailJobs ?? [];
      const hasReplied = jobs.some((j) => j.replyCount > 0 || j.status === 'REPLIED');
      const hasSent = jobs.some((j) => j.status === 'SENT' || j.status === 'REPLIED');
      const hasScheduled = jobs.some((j) => j.status === 'SCHEDULED');

      let emailStatus: 'never_contacted' | 'scheduled' | 'sent' | 'replied' = 'never_contacted';
      if (hasReplied) emailStatus = 'replied';
      else if (hasSent) emailStatus = 'sent';
      else if (hasScheduled) emailStatus = 'scheduled';

      const lastJob = jobs[0];
      return {
        ...c,
        emailStatus,
        lastEmailSentAt: lastJob?.sentAt ?? null,
        emailJobCount: jobs.length,
      };
    });

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string, userId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, userId },
      include: {
        emailJobs: {
          include: {
            campaign: { select: { id: true, name: true } },
            template: { select: { id: true, name: true } },
            events: { orderBy: { occurredAt: 'desc' } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!contact) throw new NotFoundException('Contact not found');

    const jobs = contact.emailJobs ?? [];
    const hasReplied = jobs.some((j) => j.replyCount > 0 || j.status === 'REPLIED');
    const hasSent = jobs.some((j) => j.status === 'SENT' || j.status === 'REPLIED');
    const hasScheduled = jobs.some((j) => j.status === 'SCHEDULED');

    let emailStatus: 'never_contacted' | 'scheduled' | 'sent' | 'replied' = 'never_contacted';
    if (hasReplied) emailStatus = 'replied';
    else if (hasSent) emailStatus = 'sent';
    else if (hasScheduled) emailStatus = 'scheduled';

    return { ...contact, emailStatus };
  }

  async create(userId: string, dto: CreateContactDto) {
    const email = dto.email.trim().toLowerCase();

    const existing = await this.prisma.contact.findFirst({
      where: { userId, email },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(
        `A contact with email "${email}" already exists in your account.`,
      );
    }

    return this.prisma.contact.create({
      data: {
        userId,
        email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        company: dto.company,
        jobTitle: dto.jobTitle,
        linkedin: dto.linkedin,
        phoneNumber: dto.phoneNumber,
        tags: dto.tags ?? [],
        isValid: true,
      } as any,
    });
  }

  async update(id: string, userId: string, dto: UpdateContactDto) {
    await this.findOne(id, userId);

    const data: typeof dto = { ...dto };
    if (data.email) {
      data.email = data.email.trim().toLowerCase();
      const conflict = await this.prisma.contact.findFirst({
        where: { userId, email: data.email, NOT: { id } },
        select: { id: true },
      });
      if (conflict) {
        throw new ConflictException(
          `A contact with email "${data.email}" already exists in your account.`,
        );
      }
    }

    return this.prisma.contact.update({ where: { id }, data });
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);
    await this.prisma.contact.delete({ where: { id } });
    return { success: true };
  }

  async bulkDelete(ids: string[], userId: string) {
    await this.prisma.contact.deleteMany({ where: { id: { in: ids }, userId } });
    return { deleted: ids.length };
  }

  async getStats(userId: string) {
    const [total, valid, invalid] = await Promise.all([
      this.prisma.contact.count({ where: { userId } }),
      this.prisma.contact.count({ where: { userId, isValid: true } }),
      this.prisma.contact.count({ where: { userId, isValid: false } }),
    ]);

    const byStatus = await this.prisma.contact.groupBy({
      by: ['verificationStatus'],
      where: { userId },
      _count: true,
    });

    return { total, valid, invalid, byStatus };
  }
}
