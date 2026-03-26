import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompanyNotesService } from './company-notes.service';
import { CreateCompanyNoteDto, UpdateCompanyNoteDto, CompanyNotesFilterDto } from './company-notes.dto';

@ApiTags('company-notes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('company-notes')
export class CompanyNotesController {
  constructor(private companyNotesService: CompanyNotesService) {}

  @Get()
  findAll(@Query() filter: CompanyNotesFilterDto, @Request() req) {
    return this.companyNotesService.findAll(req.user.sub, filter);
  }

  @Post()
  create(@Body() dto: CreateCompanyNoteDto, @Request() req) {
    return this.companyNotesService.create(req.user.sub, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.companyNotesService.findOne(id, req.user.sub);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCompanyNoteDto, @Request() req) {
    return this.companyNotesService.update(id, req.user.sub, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.companyNotesService.remove(id, req.user.sub);
  }
}
