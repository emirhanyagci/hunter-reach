import {
  Controller, Post, Get, Param, UseGuards, Request,
  UseInterceptors, UploadedFile, ParseFilePipe, MaxFileSizeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CsvService } from './csv.service';

@ApiTags('csv')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('csv')
export class CsvController {
  constructor(private csvService: CsvService) {}

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile(new ParseFilePipe({ validators: [new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 })] }))
    file: Express.Multer.File,
    @Request() req,
  ) {
    return this.csvService.processUpload(req.user.sub, file.buffer, file.originalname);
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
