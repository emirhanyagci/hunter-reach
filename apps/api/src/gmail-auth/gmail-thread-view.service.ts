import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { google, gmail_v1 } from 'googleapis';
import { PrismaService } from '../prisma/prisma.service';
import { GmailAuthService } from './gmail-auth.service';

export type GmailThreadMessageDirection = 'outbound' | 'inbound' | 'other';

export interface GmailThreadMessageView {
  gmailMessageId: string;
  internalMs: number;
  dateIso: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  bodyText: string | null;
  bodyHtml: string | null;
  direction: GmailThreadMessageDirection;
  /** True when this Gmail message is the one recorded as this job's outbound send. */
  isJobOutboundMessage: boolean;
}

export interface GmailThreadViewResult {
  threadId: string;
  mailboxEmail: string;
  contactEmail: string;
  jobSubject: string;
  messages: GmailThreadMessageView[];
}

function decodeBase64Url(data: string): string {
  if (!data) return '';
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, 'base64').toString('utf-8');
}

function headerFromMessage(msg: gmail_v1.Schema$Message, name: string): string | undefined {
  const headers = msg.payload?.headers;
  if (!headers) return undefined;
  const h = headers.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? undefined;
}

function parseBareEmail(from: string | undefined): string | null {
  if (!from) return null;
  const m = from.match(/<([^>]+)>/);
  const raw = (m ? m[1] : from).trim().toLowerCase();
  return raw || null;
}

function extractBodies(payload: gmail_v1.Schema$MessagePart | undefined): { text: string; html: string } {
  const acc = { text: '', html: '' };

  const walk = (part: gmail_v1.Schema$MessagePart | undefined): void => {
    if (!part) return;
    const mime = part.mimeType ?? '';
    if (part.body?.data) {
      if (mime === 'text/plain' && !acc.text) acc.text = decodeBase64Url(part.body.data);
      else if (mime === 'text/html' && !acc.html) acc.html = decodeBase64Url(part.body.data);
    }
    if (part.parts) {
      for (const p of part.parts) walk(p);
    }
  };

  walk(payload);
  return acc;
}

@Injectable()
export class GmailThreadViewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gmailAuth: GmailAuthService,
  ) {}

  async getThreadForEmailJob(userId: string, emailJobId: string): Promise<GmailThreadViewResult> {
    const job = await this.prisma.emailJob.findFirst({
      where: { id: emailJobId, campaign: { userId } },
      select: {
        threadId: true,
        providerMessageId: true,
        renderedSubject: true,
        contact: { select: { email: true } },
      },
    });
    if (!job) {
      throw new NotFoundException('Email job not found');
    }
    if (!job.threadId) {
      throw new BadRequestException(
        'No Gmail thread is linked yet. Open Settings and run “Sync replies from Gmail”, or ensure this email was sent via your connected Gmail.',
      );
    }

    const auth = await this.gmailAuth.getAuthorizedClient(userId);
    if (!auth) {
      throw new BadRequestException('Connect Gmail in Settings to view threads.');
    }

    const tokenRow = await this.prisma.gmailToken.findUnique({ where: { userId } });
    const mailboxEmail = tokenRow?.email?.trim().toLowerCase() ?? '';
    if (!mailboxEmail) {
      throw new BadRequestException('Gmail account email is missing. Reconnect Gmail in Settings.');
    }

    const gmail = google.gmail({ version: 'v1', auth });
    let res: { data: gmail_v1.Schema$Thread };
    try {
      res = await gmail.users.threads.get({
        userId: 'me',
        id: job.threadId,
        format: 'full',
      });
    } catch (err: any) {
      const code = err?.code;
      const msg = err instanceof Error ? err.message : String(err);
      if (code === 403 || /insufficient/i.test(msg)) {
        throw new BadRequestException('Gmail needs read-only access. Reconnect Gmail in Settings.');
      }
      if (code === 404) {
        throw new NotFoundException('This thread was not found in Gmail. It may have been deleted.');
      }
      throw new BadRequestException(`Could not load thread: ${msg}`);
    }

    const rawMessages = res.data.messages ?? [];
    const contactNorm = job.contact.email.trim().toLowerCase();
    const anchorId = job.providerMessageId ?? undefined;

    const messages: GmailThreadMessageView[] = [];

    for (const m of rawMessages) {
      if (!m.id) continue;
      if (m.labelIds?.includes('DRAFT')) continue;

      const internalMs = parseInt(m.internalDate || '0', 10);
      const fromRaw = headerFromMessage(m, 'From');
      const fromNorm = parseBareEmail(fromRaw);
      const bodies = extractBodies(m.payload ?? undefined);

      let direction: GmailThreadMessageDirection = 'other';
      if (fromNorm === mailboxEmail) direction = 'outbound';
      else if (fromNorm === contactNorm) direction = 'inbound';

      messages.push({
        gmailMessageId: m.id,
        internalMs,
        dateIso: new Date(internalMs).toISOString(),
        from: fromRaw?.trim() || '(unknown sender)',
        to: headerFromMessage(m, 'To')?.trim() || '',
        subject: headerFromMessage(m, 'Subject')?.trim() || job.renderedSubject,
        snippet: (m.snippet ?? '').trim(),
        bodyText: bodies.text ? bodies.text.trim() : null,
        bodyHtml: bodies.html ? bodies.html.trim() : null,
        direction,
        isJobOutboundMessage: anchorId !== undefined && m.id === anchorId,
      });
    }

    messages.sort((a, b) => a.internalMs - b.internalMs);

    return {
      threadId: job.threadId,
      mailboxEmail: tokenRow?.email ?? mailboxEmail,
      contactEmail: job.contact.email,
      jobSubject: job.renderedSubject,
      messages,
    };
  }
}
