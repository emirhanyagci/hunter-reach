import { Module } from '@nestjs/common';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { FollowUpRecommendationService } from './follow-up-recommendation.service';

@Module({
  controllers: [ContactsController],
  providers: [ContactsService, FollowUpRecommendationService],
  exports: [ContactsService],
})
export class ContactsModule {}
