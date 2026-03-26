import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SchedulerService } from './scheduler.service';
import { EmailProcessor } from './email.processor';
import { EmailScheduleReconcileService } from './email-schedule-reconcile.service';
import { EmailModule } from '../email/email.module';
import { getEmailSendingConfig } from '../config/email-sending.config';

@Module({
  imports: [
    BullModule.registerQueueAsync({
      name: 'email-queue',
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const c = getEmailSendingConfig(config);
        return {
          // Caps how many jobs start per window (in addition to stagger + processor concurrency).
          limiter: {
            max: c.queueLimiterMax,
            duration: c.queueLimiterDurationMs,
          },
        };
      },
    }),
    forwardRef(() => EmailModule),
  ],
  providers: [SchedulerService, EmailProcessor, EmailScheduleReconcileService],
  exports: [SchedulerService, EmailScheduleReconcileService],
})
export class SchedulerModule {}
