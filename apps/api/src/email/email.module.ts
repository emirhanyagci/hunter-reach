import { Module, forwardRef } from '@nestjs/common';
import { EmailService } from './email.service';
import { EmailAnalyticsService } from './email-analytics.service';
import { EmailJobsController } from './email-jobs.controller';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { GmailAuthModule } from '../gmail-auth/gmail-auth.module';
import { TemplatesModule } from '../templates/templates.module';

@Module({
  imports: [forwardRef(() => SchedulerModule), GmailAuthModule, forwardRef(() => TemplatesModule)],
  providers: [EmailService, EmailAnalyticsService],
  controllers: [EmailJobsController],
  exports: [EmailService],
})
export class EmailModule {}
