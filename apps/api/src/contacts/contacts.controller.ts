import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ContactsService } from './contacts.service';
import { ContactsFilterDto, CreateContactDto, UpdateContactDto } from './contacts.dto';

@ApiTags('contacts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('contacts')
export class ContactsController {
  constructor(private contactsService: ContactsService) {}

  @Get()
  findAll(@Query() filter: ContactsFilterDto, @Request() req) {
    return this.contactsService.findAll(req.user.sub, filter);
  }

  @Get('stats')
  stats(@Request() req) {
    return this.contactsService.getStats(req.user.sub);
  }

  @Post()
  create(@Body() dto: CreateContactDto, @Request() req) {
    return this.contactsService.create(req.user.sub, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.contactsService.findOne(id, req.user.sub);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateContactDto, @Request() req) {
    return this.contactsService.update(id, req.user.sub, dto);
  }

  @Delete('bulk')
  bulkDelete(@Body() body: { ids: string[] }, @Request() req) {
    return this.contactsService.bulkDelete(body.ids, req.user.sub);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.contactsService.remove(id, req.user.sub);
  }
}
