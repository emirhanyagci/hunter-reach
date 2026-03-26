import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto, DetectGendersDto } from './campaigns.dto';

@ApiTags('campaigns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('campaigns')
export class CampaignsController {
  constructor(private campaignsService: CampaignsService) {}

  @Get()
  findAll(@Request() req) {
    return this.campaignsService.findAll(req.user.sub);
  }

  @Get('stats')
  stats(@Request() req) {
    return this.campaignsService.getStats(req.user.sub);
  }

  /** Env-driven caps + today's usage (UTC) for UI hints and validation messaging. */
  @Get('sending-limits')
  sendingLimits(@Request() req) {
    return this.campaignsService.getSendingLimits(req.user.sub);
  }

  @Post('detect-genders')
  detectGenders(@Body() dto: DetectGendersDto, @Request() req) {
    return this.campaignsService.detectGenders(dto.contactIds, req.user.sub);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.campaignsService.findOne(id, req.user.sub);
  }

  @Post()
  create(@Body() dto: CreateCampaignDto, @Request() req) {
    return this.campaignsService.create(req.user.sub, dto);
  }

  @Delete(':id')
  cancel(@Param('id') id: string, @Request() req) {
    return this.campaignsService.cancel(id, req.user.sub);
  }
}
