import { Controller, Get, Query, Res, UseGuards, Request, Delete, UnauthorizedException } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { GmailAuthService } from './gmail-auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

@ApiTags('gmail-auth')
@Controller('auth/gmail')
export class GmailAuthController {
  constructor(
    private gmailAuthService: GmailAuthService,
    private config: ConfigService,
    private jwtService: JwtService,
  ) {}

  // Step 1: Redirect user to Google OAuth consent screen
  // Accept JWT via query param because this is a browser redirect, not an API call
  @Get('connect')
  connect(@Query('token') token: string, @Res() res: Response) {
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.config.get('JWT_SECRET', 'super-secret-key'),
      });
      const url = this.gmailAuthService.getAuthUrl(payload.sub);
      return res.redirect(url);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }

  // Step 2: Google redirects back here with code
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') userId: string,
    @Res() res: Response,
  ) {
    try {
      await this.gmailAuthService.handleCallback(code, userId);
      const frontendUrl = this.config.get('FRONTEND_URL', 'http://localhost:3000');
      return res.redirect(`${frontendUrl}/dashboard/settings?gmail=connected`);
    } catch (err) {
      const frontendUrl = this.config.get('FRONTEND_URL', 'http://localhost:3000');
      return res.redirect(`${frontendUrl}/dashboard/settings?gmail=error`);
    }
  }

  // GET connection status
  @Get('status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  status(@Request() req) {
    return this.gmailAuthService.getConnectionStatus(req.user.sub);
  }

  // Disconnect Gmail
  @Delete('disconnect')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  disconnect(@Request() req) {
    return this.gmailAuthService.disconnect(req.user.sub);
  }
}
