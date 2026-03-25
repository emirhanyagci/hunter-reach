import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { SchedulerService } from './scheduler.service';
import { EmailProcessor } from './email.processor';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'email-queue' }),
    forwardRef(() => EmailModule),
  ],
  providers: [SchedulerService, EmailProcessor],
  exports: [SchedulerService],
})
export class SchedulerModule {}
