import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CsvModule } from './csv/csv.module';
import { ContactsModule } from './contacts/contacts.module';
import { TemplatesModule } from './templates/templates.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { EmailModule } from './email/email.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { GmailAuthModule } from './gmail-auth/gmail-auth.module';
import { RoutingRulesModule } from './routing-rules/routing-rules.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),
    PrismaModule,
    AuthModule,
    CsvModule,
    ContactsModule,
    TemplatesModule,
    CampaignsModule,
    EmailModule,
    SchedulerModule,
    WebhooksModule,
    GmailAuthModule,
    RoutingRulesModule,
  ],
})
export class AppModule {}
