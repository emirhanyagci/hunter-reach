import { Module } from '@nestjs/common';
import { CompanyNotesController } from './company-notes.controller';
import { CompanyNotesService } from './company-notes.service';

@Module({
  controllers: [CompanyNotesController],
  providers: [CompanyNotesService],
})
export class CompanyNotesModule {}
