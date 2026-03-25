import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
  UseGuards, Request, UseInterceptors, UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TemplatesService } from './templates.service';
import {
  CreateTemplateDto, UpdateTemplateDto, PreviewTemplateDto,
  CreateCategoryDto, SendTestEmailDto, SendToContactDto,
} from './templates.dto';

const UPLOADS_DIR = join(process.cwd(), 'uploads');

const attachmentStorage = diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname);
    cb(null, `${randomUUID()}${ext}`);
  },
});

@ApiTags('templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('templates')
export class TemplatesController {
  constructor(private templatesService: TemplatesService) {}

  @Get('categories')
  getCategories() {
    return this.templatesService.getCategories();
  }

  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.templatesService.createCategory(dto);
  }

  @Get()
  findAll(@Query('categoryId') categoryId: string, @Request() req) {
    return this.templatesService.findAll(req.user.sub, categoryId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.templatesService.findOne(id, req.user.sub);
  }

  @Post()
  create(@Body() dto: CreateTemplateDto, @Request() req) {
    return this.templatesService.create(req.user.sub, dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTemplateDto, @Request() req) {
    return this.templatesService.update(id, req.user.sub, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.templatesService.remove(id, req.user.sub);
  }

  @Post(':id/preview')
  preview(@Param('id') id: string, @Body() dto: PreviewTemplateDto, @Request() req) {
    return this.templatesService.preview(id, dto.contactId, req.user.sub);
  }

  @Post('test-email')
  sendTestEmail(@Body() dto: SendTestEmailDto, @Request() req) {
    return this.templatesService.sendTestEmail(dto, req.user.sub);
  }

  @Post('send-to-contact')
  sendToContact(@Body() dto: SendToContactDto, @Request() req) {
    return this.templatesService.sendToContact(dto, req.user.sub);
  }

  // ── Attachment endpoints ───────────────────────────────────────────────────
  @Post(':id/attachments')
  @UseInterceptors(FilesInterceptor('files', 10, { storage: attachmentStorage }))
  addAttachments(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req,
  ) {
    return this.templatesService.addAttachments(id, req.user.sub, files);
  }

  @Delete(':id/attachments/:attachmentId')
  deleteAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Request() req,
  ) {
    return this.templatesService.deleteAttachment(id, attachmentId, req.user.sub);
  }
}
