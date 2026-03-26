import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyNoteDto, UpdateCompanyNoteDto, CompanyNotesFilterDto } from './company-notes.dto';

@Injectable()
export class CompanyNotesService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string, filter: CompanyNotesFilterDto) {
    const { page = 1, limit = 50, search } = filter;
    const skip = (page - 1) * limit;

    const where: any = { userId };
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
      }),
      this.prisma.companyNote.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string, userId: string) {
    const note = await this.prisma.companyNote.findFirst({ where: { id, userId } });
    if (!note) throw new NotFoundException('Company note not found');
    return note;
  }

  async create(userId: string, dto: CreateCompanyNoteDto) {
    return this.prisma.companyNote.create({
      data: {
        userId,
        companyName: dto.companyName,
        content: dto.content ?? '',
        links: (dto.links ?? []) as any,
      },
    });
  }

  async update(id: string, userId: string, dto: UpdateCompanyNoteDto) {
    await this.findOne(id, userId);
    return this.prisma.companyNote.update({
      where: { id },
      data: {
        ...(dto.companyName !== undefined && { companyName: dto.companyName }),
        ...(dto.content !== undefined && { content: dto.content }),
        ...(dto.links !== undefined && { links: dto.links as any }),
      },
    });
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);
    await this.prisma.companyNote.delete({ where: { id } });
    return { success: true };
  }
}
