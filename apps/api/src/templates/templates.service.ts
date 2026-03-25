import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { TemplateRendererService } from './template-renderer.service';
import { EmailService } from '../email/email.service';
import { CreateTemplateDto, UpdateTemplateDto, CreateCategoryDto, SendTestEmailDto, SendToContactDto } from './templates.dto';

const INCLUDE_ATTACHMENTS = { attachments: true, category: true } as const;

const GENDER_VARIANT_FIELDS = [
  'maleSubject', 'maleBodyHtml', 'maleBodyText',
  'femaleSubject', 'femaleBodyHtml', 'femaleBodyText',
] as const;

@Injectable()
export class TemplatesService {
  constructor(
    private prisma: PrismaService,
    private renderer: TemplateRendererService,
    private emailService: EmailService,
  ) {}

  // ── Categories ──────────────────────────────────────────────────────────────
  async getCategories() {
    return this.prisma.templateCategory.findMany({ orderBy: { name: 'asc' } });
  }

  async createCategory(dto: CreateCategoryDto) {
    return this.prisma.templateCategory.create({ data: { name: dto.name } });
  }

  // ── Templates ───────────────────────────────────────────────────────────────
  async findAll(userId: string, categoryId?: string) {
    return this.prisma.template.findMany({
      where: { userId, ...(categoryId ? { categoryId } : {}) },
      include: INCLUDE_ATTACHMENTS,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string) {
    const template = await this.prisma.template.findFirst({
      where: { id, userId },
      include: INCLUDE_ATTACHMENTS,
    });
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  private extractAllVariables(dto: {
    subject: string;
    bodyHtml: string;
    maleSubject?: string | null;
    maleBodyHtml?: string | null;
    femaleSubject?: string | null;
    femaleBodyHtml?: string | null;
  }): string[] {
    const texts = [
      dto.subject, dto.bodyHtml,
      dto.maleSubject, dto.maleBodyHtml,
      dto.femaleSubject, dto.femaleBodyHtml,
    ].filter(Boolean) as string[];

    return texts
      .flatMap((t) => this.renderer.extractVariables(t))
      .filter((v, i, a) => a.indexOf(v) === i);
  }

  async create(userId: string, dto: CreateTemplateDto) {
    const variables = this.extractAllVariables(dto);

    return this.prisma.template.create({
      data: {
        userId,
        name: dto.name,
        subject: dto.subject,
        bodyHtml: dto.bodyHtml,
        bodyText: dto.bodyText,
        maleSubject: dto.maleSubject || null,
        maleBodyHtml: dto.maleBodyHtml || null,
        maleBodyText: dto.maleBodyText || null,
        femaleSubject: dto.femaleSubject || null,
        femaleBodyHtml: dto.femaleBodyHtml || null,
        femaleBodyText: dto.femaleBodyText || null,
        categoryId: dto.categoryId || null,
        variables,
      },
      include: INCLUDE_ATTACHMENTS,
    });
  }

  async update(id: string, userId: string, dto: UpdateTemplateDto) {
    const existing = await this.findOne(id, userId);

    const merged = {
      subject: dto.subject ?? existing.subject,
      bodyHtml: dto.bodyHtml ?? existing.bodyHtml,
      maleSubject: dto.maleSubject !== undefined ? dto.maleSubject : existing.maleSubject,
      maleBodyHtml: dto.maleBodyHtml !== undefined ? dto.maleBodyHtml : existing.maleBodyHtml,
      femaleSubject: dto.femaleSubject !== undefined ? dto.femaleSubject : existing.femaleSubject,
      femaleBodyHtml: dto.femaleBodyHtml !== undefined ? dto.femaleBodyHtml : existing.femaleBodyHtml,
    };

    const variables = this.extractAllVariables(merged);

    return this.prisma.template.update({
      where: { id },
      data: {
        ...dto,
        // Normalise empty strings to null for optional gender fields
        maleSubject: dto.maleSubject || null,
        maleBodyHtml: dto.maleBodyHtml || null,
        maleBodyText: dto.maleBodyText || null,
        femaleSubject: dto.femaleSubject || null,
        femaleBodyHtml: dto.femaleBodyHtml || null,
        femaleBodyText: dto.femaleBodyText || null,
        variables,
      },
      include: INCLUDE_ATTACHMENTS,
    });
  }

  async remove(id: string, userId: string) {
    const template = await this.findOne(id, userId);
    for (const att of (template as any).attachments ?? []) {
      try { fs.unlinkSync(att.storagePath); } catch { /* ignore */ }
    }
    await this.prisma.template.delete({ where: { id } });
    return { success: true };
  }

  // ── Attachments ─────────────────────────────────────────────────────────────
  async addAttachments(templateId: string, userId: string, files: Express.Multer.File[]) {
    await this.findOne(templateId, userId);
    return Promise.all(
      files.map((file) =>
        this.prisma.templateAttachment.create({
          data: {
            templateId,
            filename: file.filename,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            storagePath: file.path,
          },
        }),
      ),
    );
  }

  async deleteAttachment(templateId: string, attachmentId: string, userId: string) {
    await this.findOne(templateId, userId);
    const attachment = await this.prisma.templateAttachment.findFirst({
      where: { id: attachmentId, templateId },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');
    try { fs.unlinkSync(attachment.storagePath); } catch { /* ignore */ }
    await this.prisma.templateAttachment.delete({ where: { id: attachmentId } });
    return { success: true };
  }

  // ── Test email ───────────────────────────────────────────────────────────────
  async sendTestEmail(dto: SendTestEmailDto, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const toEmail = dto.toEmail || user!.email;

    let ctx: Record<string, unknown> = {
      first_name: 'John', last_name: 'Doe', email: toEmail,
      company: 'Acme Corp', domain: 'acme.com', job_title: 'CTO',
      score: 90, verification_status: 'valid',
    };

    if (dto.contactId) {
      const contact = await this.prisma.contact.findFirst({ where: { id: dto.contactId, userId } });
      if (contact) {
        ctx = {
          ...contact,
          first_name: contact.firstName,
          last_name: contact.lastName,
          job_title: contact.jobTitle,
          phone_number: contact.phoneNumber,
          verification_status: contact.verificationStatus,
          ...(typeof contact.extraFields === 'object' ? contact.extraFields as object : {}),
        };
      }
    }

    if (dto.customData && typeof dto.customData === 'object') {
      ctx = { ...ctx, ...dto.customData };
    }

    const renderedSubject = this.renderer.render(dto.subject, ctx);
    const renderedHtml = this.renderer.render(dto.bodyHtml, ctx);
    const renderedText = dto.bodyText ? this.renderer.render(dto.bodyText, ctx) : undefined;

    let attachments: Array<{ filename: string; path: string; contentType?: string }> = [];
    if (dto.templateId) {
      const template = await this.prisma.template.findFirst({
        where: { id: dto.templateId, userId },
        include: { attachments: true },
      });
      if (template) {
        attachments = template.attachments
          .filter((a) => fs.existsSync(a.storagePath))
          .map((a) => ({ filename: a.originalName, path: a.storagePath, contentType: a.mimeType }));
      }
    }

    await this.emailService.send({
      to: toEmail,
      subject: renderedSubject,
      html: renderedHtml,
      text: renderedText,
      userId,
      attachments,
    });

    return { success: true, sentTo: toEmail, renderedSubject };
  }

  // ── Direct send to contact ───────────────────────────────────────────────────
  async sendToContact(dto: SendToContactDto, userId: string) {
    const contact = await this.prisma.contact.findFirst({ where: { id: dto.contactId, userId } });
    if (!contact) throw new NotFoundException('Contact not found');

    const template = await this.prisma.template.findFirst({
      where: { id: dto.templateId, userId },
      include: { attachments: true },
    });
    if (!template) throw new NotFoundException('Template not found');

    // Choose gender variant, then apply custom overrides on top
    let subject = template.subject;
    let bodyHtml = template.bodyHtml;
    let bodyText = template.bodyText;

    if (dto.gender === 'male') {
      subject = template.maleSubject || template.subject;
      bodyHtml = template.maleBodyHtml || template.bodyHtml;
      bodyText = template.maleBodyText || template.bodyText;
    } else if (dto.gender === 'female') {
      subject = template.femaleSubject || template.subject;
      bodyHtml = template.femaleBodyHtml || template.bodyHtml;
      bodyText = template.femaleBodyText || template.bodyText;
    }

    if (dto.customSubject) subject = dto.customSubject;
    if (dto.customBodyHtml) bodyHtml = dto.customBodyHtml;
    if (dto.customBodyText) bodyText = dto.customBodyText ?? null;

    const ctx = {
      ...contact,
      first_name: contact.firstName,
      last_name: contact.lastName,
      job_title: contact.jobTitle,
      phone_number: contact.phoneNumber,
      verification_status: contact.verificationStatus,
      ...(typeof contact.extraFields === 'object' ? (contact.extraFields as object) : {}),
    };

    const renderedSubject = this.renderer.render(subject, ctx as any);
    const renderedHtml = this.renderer.render(bodyHtml, ctx as any);
    const renderedText = bodyText ? this.renderer.render(bodyText, ctx as any) : undefined;

    const attachments = (template as any).attachments
      .filter((a: any) => fs.existsSync(a.storagePath))
      .map((a: any) => ({ filename: a.originalName, path: a.storagePath, contentType: a.mimeType }));

    await this.emailService.send({
      to: contact.email,
      subject: renderedSubject,
      html: renderedHtml,
      text: renderedText,
      userId,
      attachments,
    });

    return { success: true, sentTo: contact.email, renderedSubject };
  }

  async preview(templateId: string, contactId: string, userId: string) {
    const template = await this.findOne(templateId, userId);
    const contact = await this.prisma.contact.findFirst({ where: { id: contactId, userId } });
    if (!contact) throw new NotFoundException('Contact not found');

    const ctx = {
      ...contact,
      first_name: contact.firstName,
      last_name: contact.lastName,
      job_title: contact.jobTitle,
      phone_number: contact.phoneNumber,
      verification_status: contact.verificationStatus,
    };

    return {
      subject: this.renderer.render(template.subject, ctx as any),
      bodyHtml: this.renderer.render(template.bodyHtml, ctx as any),
      bodyText: template.bodyText ? this.renderer.render(template.bodyText, ctx as any) : null,
    };
  }
}
