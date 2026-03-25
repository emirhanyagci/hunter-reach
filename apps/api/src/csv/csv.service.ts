import { Injectable, BadRequestException } from '@nestjs/common';
import * as Papa from 'papaparse';
import { PrismaService } from '../prisma/prisma.service';

const KNOWN_FIELDS = [
  'first_name', 'last_name', 'email', 'company', 'domain',
  'job_title', 'score', 'verification_status', 'phone_number',
  'twitter', 'linkedin',
];

// After transformHeader (lowercase + underscores), map variant names to canonical field names.
const FIELD_ALIASES: Record<string, string> = {
  title: 'job_title',
  company_name: 'company',
  person_linkedin_url: 'linkedin',
};

function normalizeHeaders(columns: string[]): { columns: string[]; map: Record<string, string> } {
  const map: Record<string, string> = {};
  const normalized = columns.map((col) => {
    const canonical = FIELD_ALIASES[col];
    if (canonical) { map[col] = canonical; return canonical; }
    return col;
  });
  return { columns: normalized, map };
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

@Injectable()
export class CsvService {
  constructor(private prisma: PrismaService) {}

  async processUpload(userId: string, buffer: Buffer, filename: string) {
    const content = buffer.toString('utf-8');
    const parsed = Papa.parse<Record<string, string>>(content, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
    });

    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      throw new BadRequestException('Could not parse CSV file');
    }

    const { columns: columnNames, map: aliasMap } = normalizeHeaders(parsed.meta.fields || []);

    if (!columnNames.includes('email')) {
      throw new BadRequestException('CSV must contain an "email" column');
    }

    const rows = parsed.data.map((row) => {
      const r: Record<string, string> = {};
      for (const [k, v] of Object.entries(row)) r[aliasMap[k] ?? k] = v;
      return r;
    });

    // Create import record
    const csvImport = await this.prisma.csvImport.create({
      data: {
        userId,
        filename,
        columnNames,
        rowCount: rows.length,
        status: 'PROCESSING',
      },
    });

    // Process rows
    const contacts: Array<{
      importId: string; userId: string; email: string; firstName: string | null;
      lastName: string | null; company: string | null; domain: string | null;
      jobTitle: string | null; score: number | null; verificationStatus: string | null;
      phoneNumber: string | null; twitter: string | null; linkedin: string | null;
      extraFields?: Record<string, string>; isValid: boolean; validationErrors: string[];
    }> = [];
    for (const row of rows) {
      const errors: string[] = [];
      const email = row.email?.trim() || '';

      if (!email) errors.push('Missing email');
      else if (!validateEmail(email)) errors.push('Invalid email format');

      const extraFields: Record<string, string> = {};
      for (const col of columnNames) {
        if (!KNOWN_FIELDS.includes(col) && col !== 'email') {
          extraFields[col] = row[col] || '';
        }
      }

      contacts.push({
        importId: csvImport.id,
        userId,
        email,
        firstName: row.first_name?.trim() || null,
        lastName: row.last_name?.trim() || null,
        company: row.company?.trim() || null,
        domain: row.domain?.trim() || null,
        jobTitle: row.job_title?.trim() || null,
        score: row.score ? parseInt(row.score, 10) || null : null,
        verificationStatus: row.verification_status?.trim() || null,
        phoneNumber: row.phone_number?.trim() || null,
        twitter: row.twitter?.trim() || null,
        linkedin: row.linkedin?.trim() || null,
        extraFields: Object.keys(extraFields).length > 0 ? extraFields : undefined,
        isValid: errors.length === 0,
        validationErrors: errors,
      });
    }

    if (contacts.length > 0) {
      await this.prisma.contact.createMany({ data: contacts });
    }

    await this.prisma.csvImport.update({
      where: { id: csvImport.id },
      data: { status: 'DONE' },
    });

    const validCount = contacts.filter((c) => c.isValid).length;

    return {
      importId: csvImport.id,
      filename,
      totalRows: contacts.length,
      validRows: validCount,
      invalidRows: contacts.length - validCount,
      columnNames,
    };
  }

  async getImports(userId: string) {
    return this.prisma.csvImport.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { contacts: true } } },
    });
  }

  async getImportContacts(importId: string, userId: string) {
    return this.prisma.contact.findMany({
      where: { importId, userId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
