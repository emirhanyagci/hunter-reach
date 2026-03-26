import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { EmailSendingPolicyService } from './email-sending-policy.service';
import { TemplatesModule } from '../templates/templates.module';
import { SchedulerModule } from '../scheduler/scheduler.module';

@Module({
  imports: [TemplatesModule, SchedulerModule],
  controllers: [CampaignsController],
  providers: [CampaignsService, EmailSendingPolicyService],
})
export class CampaignsModule {}
