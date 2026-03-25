import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { GmailAuthService } from './gmail-auth.service';
import { GmailAuthController } from './gmail-auth.controller';

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
  providers: [GmailAuthService],
  exports: [GmailAuthService],
})
export class GmailAuthModule {}
