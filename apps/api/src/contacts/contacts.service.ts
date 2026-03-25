import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ContactsFilterDto } from './contacts.dto';

@Injectable()
export class ContactsService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string, filter: ContactsFilterDto) {
    const { page = 1, limit = 50, importId, search, jobTitle, company, verificationStatus, scoreMin, scoreMax, tags } = filter;
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (importId) where.importId = importId;
    if (verificationStatus) where.verificationStatus = verificationStatus;
    if (jobTitle) where.jobTitle = { contains: jobTitle, mode: 'insensitive' };
    if (company) where.company = { contains: company, mode: 'insensitive' };
    if (scoreMin !== undefined) where.score = { ...where.score, gte: scoreMin };
    if (scoreMax !== undefined) where.score = { ...where.score, lte: scoreMax };
    if (tags?.length) where.tags = { hasSome: tags };
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.contact.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.contact.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string, userId: string) {
    const contact = await this.prisma.contact.findFirst({ where: { id, userId } });
    if (!contact) throw new NotFoundException('Contact not found');
    return contact;
  }

  async update(id: string, userId: string, data: Partial<{ tags: string[]; firstName: string; company: string }>) {
    await this.findOne(id, userId);
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
