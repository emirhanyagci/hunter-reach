import {
  Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RoutingRulesService } from './routing-rules.service';
import { CreateRoutingRuleDto, UpdateRoutingRuleDto, PreviewRoutingDto } from './routing-rules.dto';

@ApiTags('routing-rules')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('routing-rules')
export class RoutingRulesController {
  constructor(private service: RoutingRulesService) {}

  @Get()
  findAll(@Request() req) {
    return this.service.findAll(req.user.sub);
  }

  @Post()
  create(@Body() dto: CreateRoutingRuleDto, @Request() req) {
    return this.service.create(req.user.sub, dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRoutingRuleDto, @Request() req) {
    return this.service.update(id, req.user.sub, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.service.remove(id, req.user.sub);
  }

  @Post('preview')
  preview(@Body() dto: PreviewRoutingDto, @Request() req) {
    return this.service.previewRouting(req.user.sub, dto);
  }
}
