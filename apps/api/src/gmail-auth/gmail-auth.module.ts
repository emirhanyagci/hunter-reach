import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { GmailAuthService } from './gmail-auth.service';
import { GmailAuthController } from './gmail-auth.controller';
import { GmailReplySyncService } from './gmail-reply-sync.service';
import { GmailThreadViewService } from './gmail-thread-view.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET', 'super-secret-key'),
      }),
    }),
  ],
  controllers: [GmailAuthController],
  providers: [GmailAuthService, GmailReplySyncService, GmailThreadViewService],
  exports: [GmailAuthService, GmailReplySyncService, GmailThreadViewService],
})
export class GmailAuthModule {}
