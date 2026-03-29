import {
  Controller, Post, Get, Param, UseGuards, Request,
  UseInterceptors, UploadedFiles, BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CsvService } from './csv.service';

const MAX_CSV_BYTES = 10 * 1024 * 1024;
const MAX_FILES_PER_UPLOAD = 25;

@ApiTags('csv')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('csv')
export class CsvController {
  constructor(private csvService: CsvService) {}

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', MAX_FILES_PER_UPLOAD))
  upload(@UploadedFiles() files: Express.Multer.File[], @Request() req) {
    if (!files?.length) {
      throw new BadRequestException('At least one CSV file is required');
    }
    for (const f of files) {
      if (f.size > MAX_CSV_BYTES) {
        throw new BadRequestException(`File exceeds 10MB limit: ${f.originalname}`);
      }
    }
    return this.csvService.processUploads(
      req.user.sub,
      files.map((f) => ({ buffer: f.buffer, filename: f.originalname })),
    );
  }

  @Get('imports')
  getImports(@Request() req) {
    return this.csvService.getImports(req.user.sub);
  }

  @Get('imports/:importId/contacts')
  getContacts(@Param('importId') importId: string, @Request() req) {
    return this.csvService.getImportContacts(importId, req.user.sub);
  }
}
