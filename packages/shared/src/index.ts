// ── Enums ────────────────────────────────────────────────────────────────────
export enum EmailJobStatus {
  SCHEDULED = 'scheduled',
  PROCESSING = 'processing',
  SENT = 'sent',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum CampaignStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  SENDING = 'sending',
  DONE = 'done',
  CANCELLED = 'cancelled',
}

export enum CsvImportStatus {
  PROCESSING = 'processing',
  DONE = 'done',
  FAILED = 'failed',
}

export enum EmailEventType {
  DELIVERED = 'delivered',
  OPENED = 'opened',
  CLICKED = 'clicked',
  BOUNCED = 'bounced',
  COMPLAINED = 'complained',
}

// ── Contact ───────────────────────────────────────────────────────────────────
export interface Contact {
  id: string;
  importId: string;
  userId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  domain?: string | null;
  jobTitle?: string | null;
  score?: number | null;
  verificationStatus?: string | null;
  phoneNumber?: string | null;
  twitter?: string | null;
  linkedin?: string | null;
  extraFields?: Record<string, unknown>;
  isValid: boolean;
  validationErrors: string[];
  tags: string[];
  createdAt: string;
}

// ── CSV Import ────────────────────────────────────────────────────────────────
export interface CsvImport {
  id: string;
  userId: string;
  filename: string;
  rowCount: number;
  columnNames: string[];
  status: CsvImportStatus;
  createdAt: string;
}

// ── Template ──────────────────────────────────────────────────────────────────
export interface TemplateCategory {
  id: string;
  name: string;
}

export interface Template {
  id: string;
  userId: string;
  categoryId?: string | null;
  category?: TemplateCategory | null;
  name: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string | null;
  // Gender-specific variants (fall back to subject/bodyHtml/bodyText when null)
  maleSubject?: string | null;
  maleBodyHtml?: string | null;
  maleBodyText?: string | null;
  femaleSubject?: string | null;
  femaleBodyHtml?: string | null;
  femaleBodyText?: string | null;
  variables: string[];
  createdAt: string;
  updatedAt: string;
}

// ── Campaign ──────────────────────────────────────────────────────────────────
export interface Campaign {
  id: string;
  userId: string;
  templateId: string;
  template?: Template;
  name: string;
  status: CampaignStatus;
  scheduledAt?: string | null;
  timezone: string;
  recipientCount?: number;
  createdAt: string;
}

// ── Email Job ─────────────────────────────────────────────────────────────────
export interface EmailJob {
  id: string;
  campaignId: string;
  campaign?: Campaign;
  contactId: string;
  contact?: Contact;
  templateId: string;
  renderedSubject: string;
  renderedBodyHtml: string;
  renderedBodyText?: string | null;
  status: EmailJobStatus;
  scheduledAt: string;
  /** Present when the user used Send Now before the planned time. */
  manualSendTriggeredAt?: string | null;
  sentAt?: string | null;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

// ── Company Notes ─────────────────────────────────────────────────────────────
export interface CompanyNoteLink {
  label: string;
  url: string;
}

export interface CompanyNote {
  id: string;
  userId: string;
  companyName: string;
  content: string;
  links: CompanyNoteLink[];
  createdAt: string;
  updatedAt: string;
}

// ── Pagination ────────────────────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ── API Helpers ────────────────────────────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
