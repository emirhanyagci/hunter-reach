import { Module, forwardRef } from '@nestjs/common';
import { CompanyNotesController } from './company-notes.controller';
import { CompanyNotesService } from './company-notes.service';
import { CompanyNoteReminderService } from './company-note-reminder.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [forwardRef(() => EmailModule)],
  controllers: [CompanyNotesController],
  providers: [CompanyNotesService, CompanyNoteReminderService],
})
export class CompanyNotesModule {}
