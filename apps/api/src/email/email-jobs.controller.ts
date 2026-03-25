import { Controller, Get, Patch, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulerService } from '../scheduler/scheduler.service';

@ApiTags('email-jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('email-jobs')
export class EmailJobsController {
  constructor(
    private prisma: PrismaService,
    private schedulerService: SchedulerService,
  ) {}

  @Get()
  async findAll(
    @Query('status') status: string,
    @Query('campaignId') campaignId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Request() req,
  ) {
    const p = parseInt(page, 10);
    const l = parseInt(limit, 10);
    const skip = (p - 1) * l;

    const where: any = {
      campaign: { userId: req.user.sub },
    };
    if (status) where.status = status.toUpperCase();
    if (campaignId) where.campaignId = campaignId;

    const [data, total] = await Promise.all([
      this.prisma.emailJob.findMany({
        where,
        skip,
        take: l,
        include: { contact: true, campaign: { include: { template: true } } },
        orderBy: { scheduledAt: 'desc' },
      }),
      this.prisma.emailJob.count({ where }),
    ]);

    return { data, total, page: p, limit: l, totalPages: Math.ceil(total / l) };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.prisma.emailJob.findUnique({
      where: { id },
      include: {
        contact: true,
        campaign: { include: { template: true } },
        events: { orderBy: { occurredAt: 'desc' } },
      },
    });
  }

  @Patch(':id/cancel')
  async cancel(@Param('id') id: string) {
    return this.schedulerService.cancelJob(id);
  }

  @Patch(':id/retry')
  async retry(@Param('id') id: string) {
    return this.schedulerService.retryJob(id);
  }
}
