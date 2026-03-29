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
  recommended_email: 'email',
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

type ParsedCsvSegment = {
  filename: string;
  rows: Record<string, string>[];
  columnNames: string[];
};

function mergeColumnNames(segments: ParsedCsvSegment[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of segments) {
    for (const c of s.columnNames) {
      if (!seen.has(c)) {
        seen.add(c);
        out.push(c);
      }
    }
  }
  return out;
}

export type CsvUploadResult = {
  importId: string;
  filename: string;
  filenames: string[];
  fileCount: number;
  totalRows: number;
  addedRows: number;
  duplicatesSkipped: number;
  invalidRows: number;
  columnNames: string[];
};

@Injectable()
export class CsvService {
  constructor(private prisma: PrismaService) {}

  /** Parses one CSV buffer; throws BadRequestException with filename in the message when invalid. */
  private parseCsvBuffer(buffer: Buffer, filename: string): ParsedCsvSegment {
    const content = buffer.toString('utf-8');
    const parsed = Papa.parse<Record<string, string>>(content, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
    });

    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      throw new BadRequestException(`Could not parse CSV file: ${filename}`);
    }

    const { columns: columnNames, map: aliasMap } = normalizeHeaders(parsed.meta.fields || []);

    if (!columnNames.includes('email')) {
      throw new BadRequestException(`CSV must contain an "email" column (${filename})`);
    }

    const rows = parsed.data.map((row) => {
      const r: Record<string, string> = {};
      for (const [k, v] of Object.entries(row)) r[aliasMap[k] ?? k] = v;
      return r;
    });

    return { filename, rows, columnNames };
  }

  /**
   * Processes one or more CSV files as a single import: shared duplicate detection across files
   * and the same validation rules as a single-file upload.
   */
  async processUploads(userId: string, files: { buffer: Buffer; filename: string }[]): Promise<CsvUploadResult> {
    if (files.length === 0) {
      throw new BadRequestException('At least one CSV file is required');
    }

    const segments = files.map((f) => this.parseCsvBuffer(f.buffer, f.filename));
    const mergedColumnNames = mergeColumnNames(segments);
    const totalParsedRows = segments.reduce((sum, s) => sum + s.rows.length, 0);
    const displayFilename = files.map((f) => f.filename).join(', ');

    const csvImport = await this.prisma.csvImport.create({
      data: {
        userId,
        filename: displayFilename,
        columnNames: mergedColumnNames,
        rowCount: totalParsedRows,
        status: 'PROCESSING',
      },
    });

    const existingEmailRows = await this.prisma.contact.findMany({
      where: { userId },
      select: { email: true },
    });
    const existingEmails = new Set(existingEmailRows.map((r) => r.email));

    type ContactRow = {
      importId: string; userId: string; email: string; firstName: string | null;
      lastName: string | null; company: string | null; domain: string | null;
      jobTitle: string | null; score: number | null; verificationStatus: string | null;
      phoneNumber: string | null; twitter: string | null; linkedin: string | null;
      extraFields?: Record<string, string>; isValid: boolean; validationErrors: string[];
    };

    const validContacts: ContactRow[] = [];
    let invalidRows = 0;
    let duplicatesSkipped = 0;
    const seenInImport = new Set<string>();

    for (const { rows, columnNames } of segments) {
      for (const row of rows) {
        const errors: string[] = [];
        const rawEmail = row.email?.trim() || '';
        const email = rawEmail.toLowerCase();

        if (!email) {
          errors.push('Missing email');
        } else if (!validateEmail(email)) {
          errors.push('Invalid email format');
        }

        if (errors.length > 0) {
          invalidRows++;
          continue;
        }

        if (existingEmails.has(email) || seenInImport.has(email)) {
          duplicatesSkipped++;
          continue;
        }
        seenInImport.add(email);

        const extraFields: Record<string, string> = {};
        for (const col of columnNames) {
          if (!KNOWN_FIELDS.includes(col) && col !== 'email') {
            extraFields[col] = row[col] || '';
          }
        }

        validContacts.push({
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
          isValid: true,
          validationErrors: [],
        });
      }
    }

    if (validContacts.length > 0) {
      await this.prisma.contact.createMany({ data: validContacts, skipDuplicates: true });
    }

    await this.prisma.csvImport.update({
      where: { id: csvImport.id },
      data: {
        status: 'DONE',
        rowCount: totalParsedRows,
      },
    });

    return {
      importId: csvImport.id,
      filename: displayFilename,
      filenames: files.map((f) => f.filename),
      fileCount: files.length,
      totalRows: totalParsedRows,
      addedRows: validContacts.length,
      duplicatesSkipped,
      invalidRows,
      columnNames: mergedColumnNames,
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
