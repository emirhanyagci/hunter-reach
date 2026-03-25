import { Controller, Post, Body, Logger } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private prisma: PrismaService) {}

  @Post('resend')
  async handleResendWebhook(@Body() payload: any) {
    const { type, data } = payload;
    this.logger.log(`Resend webhook: ${type}`);

    const eventTypeMap: Record<string, string> = {
      'email.sent': 'DELIVERED',
      'email.delivered': 'DELIVERED',
      'email.opened': 'OPENED',
      'email.clicked': 'CLICKED',
      'email.bounced': 'BOUNCED',
      'email.complained': 'COMPLAINED',
    };

    const eventType = eventTypeMap[type];
    if (!eventType || !data?.email_id) return { ok: true };

    const emailJob = await this.prisma.emailJob.findFirst({
      where: { providerMessageId: data.email_id },
    });

    if (emailJob) {
      await this.prisma.emailEvent.create({
        data: {
          emailJobId: emailJob.id,
          eventType: eventType as any,
          metadata: data,
        },
      });

      if (type === 'email.bounced') {
        await this.prisma.emailJob.update({
          where: { id: emailJob.id },
          data: { status: 'FAILED', errorMessage: 'Email bounced' },
        });
      }
    }

    return { ok: true };
  }
}
