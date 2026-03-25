import { Module, forwardRef } from '@nestjs/common';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
import { TemplateRendererService } from './template-renderer.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [forwardRef(() => EmailModule)],
  controllers: [TemplatesController],
  providers: [TemplatesService, TemplateRendererService],
  exports: [TemplatesService, TemplateRendererService],
})
export class TemplatesModule {}
