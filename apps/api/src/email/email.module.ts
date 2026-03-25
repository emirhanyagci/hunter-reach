import { Module, forwardRef } from '@nestjs/common';
import { EmailService } from './email.service';
import { EmailJobsController } from './email-jobs.controller';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { GmailAuthModule } from '../gmail-auth/gmail-auth.module';

@Module({
  imports: [forwardRef(() => SchedulerModule), GmailAuthModule],
  providers: [EmailService],
  controllers: [EmailJobsController],
  exports: [EmailService],
})
export class EmailModule {}
