import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GmailAuthService {
  private readonly logger = new Logger(GmailAuthService.name);
  private oauth2Client: OAuth2Client;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    this.oauth2Client = new google.auth.OAuth2(
      config.get('GOOGLE_CLIENT_ID'),
      config.get('GOOGLE_CLIENT_SECRET'),
      config.get('GOOGLE_REDIRECT_URI', 'http://localhost:4000/api/auth/gmail/callback'),
    );
  }

  getAuthUrl(userId: string): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',           // forces refresh_token every time
      scope: [
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
      state: userId,               // pass userId through OAuth flow
    });
  }

  async handleCallback(code: string, userId: string): Promise<string> {
    const { tokens } = await this.oauth2Client.getToken(code);

    // Get the Gmail address
    this.oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
    const { data } = await oauth2.userinfo.get();
    const email = data.email!;

    // Upsert token in DB
    await this.prisma.gmailToken.upsert({
      where: { userId },
      update: {
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token!,
        expiryDate: BigInt(tokens.expiry_date || 0),
        email,
      },
      create: {
        userId,
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token!,
        expiryDate: BigInt(tokens.expiry_date || 0),
        email,
      },
    });

    this.logger.log(`Gmail connected: ${email} for user ${userId}`);
    return email;
  }

  async getAuthorizedClient(userId: string): Promise<OAuth2Client | null> {
    const token = await this.prisma.gmailToken.findUnique({ where: { userId } });
    if (!token) return null;

    const client = new google.auth.OAuth2(
      this.config.get('GOOGLE_CLIENT_ID'),
      this.config.get('GOOGLE_CLIENT_SECRET'),
      this.config.get('GOOGLE_REDIRECT_URI', 'http://localhost:4000/api/auth/gmail/callback'),
    );

    client.setCredentials({
      access_token: token.accessToken,
      refresh_token: token.refreshToken,
      expiry_date: Number(token.expiryDate),
    });

    // Auto-refresh token if expired
    client.on('tokens', async (newTokens) => {
      if (newTokens.access_token) {
        await this.prisma.gmailToken.update({
          where: { userId },
          data: {
            accessToken: newTokens.access_token,
            ...(newTokens.refresh_token && { refreshToken: newTokens.refresh_token }),
            expiryDate: BigInt(newTokens.expiry_date || 0),
          },
        });
        this.logger.log(`Token refreshed for user ${userId}`);
      }
    });

    return client;
  }

  async getTokenData(userId: string) {
    return this.prisma.gmailToken.findUnique({ where: { userId } });
  }

  async getConnectionStatus(userId: string) {
    const token = await this.prisma.gmailToken.findUnique({ where: { userId } });
    return {
      connected: !!token,
      email: token?.email || null,
    };
  }

  async disconnect(userId: string) {
    const token = await this.prisma.gmailToken.findUnique({ where: { userId } });
    if (token) {
      // Revoke the token with Google
      try {
        await this.oauth2Client.revokeToken(token.accessToken);
      } catch {
        // ignore revoke errors, still delete locally
      }
      await this.prisma.gmailToken.delete({ where: { userId } });
    }
    return { success: true };
  }
}
