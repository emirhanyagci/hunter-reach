import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs';
import { GmailAuthService } from '../gmail-auth/gmail-auth.service';

export interface EmailAttachment {
  filename: string;       // display filename (original name)
  path: string;           // absolute path on disk
  contentType?: string;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  userId: string;
  attachments?: EmailAttachment[];
  threadId?: string;
  /** Gmail API: set From in the raw MIME (must match the connected account or a Send-as alias). */
  fromAddress?: string;
}

// Encode non-ASCII header values using RFC 2047 Base64 encoding.
// Gmail and all major clients handle this correctly for Turkish characters.
function rfc2047(value: string): string {
  if (!/[^\x00-\x7F]/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf-8').toString('base64')}?=`;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private config: ConfigService,
    private gmailAuthService: GmailAuthService,
  ) {}

  async send(options: SendEmailOptions): Promise<{ id: string; threadId?: string }> {
    // Gmail API (OAuth2) — uses HTTP, no SMTP auth issues
    const gmailClient = await this.gmailAuthService.getAuthorizedClient(options.userId);
    if (gmailClient) {
      return this.sendViaGmailApi(options, gmailClient);
    }

    // Fallback: Gmail SMTP App Password
    const gmailUser = this.config.get<string>('GMAIL_USER');
    const gmailPass = this.config.get<string>('GMAIL_APP_PASSWORD');
    if (gmailUser && gmailPass) {
      return this.sendViaSmtp(options, gmailUser, gmailPass);
    }

    throw new Error(
      'No email provider configured. Connect Gmail via Settings or set GMAIL_APP_PASSWORD in .env',
    );
  }

  // ── Gmail HTTP API ─────────────────────────────────────────────────────────
  private async sendViaGmailApi(options: SendEmailOptions, authClient: any): Promise<{ id: string; threadId?: string }> {
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    const raw = options.attachments?.length
      ? this.buildMultipartMessage(options)
      : this.buildSimpleMessage(options);

    const encoded = Buffer.from(raw)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const requestBody: any = { raw: encoded };
    if (options.threadId) {
      requestBody.threadId = options.threadId;
    }

    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody,
    });

    this.logger.log(`✅ [Gmail API] Sent to ${options.to} — ID: ${res.data.id}, Thread: ${res.data.threadId}`);
    return { id: res.data.id ?? '', threadId: res.data.threadId ?? undefined };
  }

  /** Simple HTML message — no attachments */
  private buildSimpleMessage(options: SendEmailOptions): string {
    const bodyB64 = Buffer.from(options.html, 'utf-8').toString('base64');
    const head: string[] = [];
    if (options.fromAddress?.trim()) head.push(`From: ${options.fromAddress.trim()}`);
    head.push(
      `To: ${options.to}`,
      `Subject: ${rfc2047(options.subject)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      bodyB64,
    );
    return head.join('\r\n');
  }

  /** Multipart/mixed message — HTML body + file attachments */
  private buildMultipartMessage(options: SendEmailOptions): string {
    const boundary = `----=_Part_${Date.now()}`;
    const lines: string[] = [];
    if (options.fromAddress?.trim()) lines.push(`From: ${options.fromAddress.trim()}`);
    lines.push(
      `To: ${options.to}`,
      `Subject: ${rfc2047(options.subject)}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
    );

    // HTML part
    lines.push(
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(options.html, 'utf-8').toString('base64'),
    );

    // Attachment parts
    for (const att of options.attachments ?? []) {
      if (!fs.existsSync(att.path)) continue;
      const fileData = fs.readFileSync(att.path).toString('base64');
      const mime = att.contentType ?? 'application/octet-stream';
      const encodedFilename = rfc2047(att.filename);
      lines.push(
        `--${boundary}`,
        `Content-Type: ${mime}; name="${encodedFilename}"`,
        `Content-Disposition: attachment; filename="${encodedFilename}"`,
        'Content-Transfer-Encoding: base64',
        '',
        fileData,
      );
    }

    lines.push(`--${boundary}--`);
    return lines.join('\r\n');
  }

  // ── SMTP fallback ──────────────────────────────────────────────────────────
  private async sendViaSmtp(options: SendEmailOptions, user: string, pass: string): Promise<{ id: string; threadId?: string }> {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });

    const info = await transporter.sendMail({
      from: options.fromAddress?.trim() || user,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      attachments: options.attachments?.map((a) => ({
        filename: a.filename,
        path: a.path,
        contentType: a.contentType,
      })),
    });

    this.logger.log(`✅ [SMTP] Sent to ${options.to} — ID: ${info.messageId}`);
    return { id: info.messageId ?? '' };
  }
}
