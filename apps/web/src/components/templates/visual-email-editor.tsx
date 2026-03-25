'use client';
import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { templatesApi, contactsApi } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Send, Eye, Loader2, CheckCircle2, AlertCircle, Plus, Paperclip, X, FileText } from 'lucide-react';

// Simple inline gender symbols since lucide-react doesn't include Mars/Venus in this version
function GenderMale({ className }: { className?: string }) {
  return <span className={cn('font-bold leading-none', className)}>♂</span>;
}
function GenderFemale({ className }: { className?: string }) {
  return <span className={cn('font-bold leading-none', className)}>♀</span>;
}
import { cn } from '@/lib/utils';

// ── Helpers ───────────────────────────────────────────────────────────────────

export function bodyTextToHtml(text: string): string {
  if (!text) return '';
  return text
    .split('\n')
    .map((line) => {
      if (line === '') return '<div><br></div>';
      const escaped = line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\{\{/g, '{{')
        .replace(/\}\}/g, '}}');
      return `<div>${escaped}</div>`;
    })
    .join('');
}

export function htmlToBodyText(html: string): string {
  if (!html) return '';
  return html
    .replace(/<div[^>]*>\s*<br\s*\/?>\s*<\/div>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<div[^>]*>/gi, '')
    .replace(/<p[^>]*><br\s*\/?><\/p>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');
}

function insertAtCursor(
  ref: React.RefObject<HTMLTextAreaElement>,
  text: string,
  onChange: (val: string) => void,
) {
  const el = ref.current;
  if (!el) return;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const newVal = el.value.slice(0, start) + text + el.value.slice(end);
  onChange(newVal);
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(start + text.length, start + text.length);
  });
}

// ── Turkish vowel harmony (mirrors backend applyTurkishSuffix) ────────────────

function hasTurkishChars(word: string): boolean {
  return /[ğışöüçİĞŞÖÜÇ]/i.test(word);
}

function turkishLastVowel(word: string): string | null {
  const lower = word.toLowerCase();
  // English words ending in 'ay' (e.g. Codeway, eBay, Subway) are pronounced
  // with a front vowel sound /eɪ/ in Turkish → treat as front vowel 'e'
  if (lower.endsWith('ay') && !hasTurkishChars(word)) return 'e';

  const vowels = 'aeıioöuü';
  for (let i = lower.length - 1; i >= 0; i--) {
    if (vowels.includes(lower[i])) return lower[i];
  }
  return null;
}

function applyTurkishSuffix(word: string, hint: string): string {
  if (!word) return '';
  const lastVowel = turkishLastVowel(word);
  if (!lastVowel) return `${word}'${hint}`;

  const isBack = new Set(['a', 'ı', 'o', 'u']).has(lastVowel);
  // 'x' = /ks/ in English (Netflix, Dropbox, FedEx) → voiceless
  const isVoiceless = new Set(['ç', 'f', 'h', 'k', 'p', 's', 'ş', 't', 'x']).has(word[word.length - 1].toLowerCase());
  const endsWithVowel = 'aeıioöuü'.includes(word[word.length - 1].toLowerCase());
  const h = hint.toLowerCase();

  if (['de', 'da', 'te', 'ta'].includes(h))
    return `${word}'${isVoiceless ? (isBack ? 'ta' : 'te') : (isBack ? 'da' : 'de')}`;

  if (['den', 'dan', 'ten', 'tan'].includes(h))
    return `${word}'${isVoiceless ? (isBack ? 'tan' : 'ten') : (isBack ? 'dan' : 'den')}`;

  if (['e', 'a', 'ye', 'ya'].includes(h)) {
    if (endsWithVowel) return `${word}'${isBack ? 'ya' : 'ye'}`;
    return `${word}'${isBack ? 'a' : 'e'}`;
  }

  if (['nin', 'nın', 'nun', 'nün', 'in', 'ın', 'un', 'ün'].includes(h)) {
    const genSuffix: Record<string, string> = { a: 'nın', ı: 'nın', o: 'nun', u: 'nun', e: 'nin', i: 'nin', ö: 'nün', ü: 'nün' };
    const full = genSuffix[lastVowel] ?? 'nin';
    return `${word}'${endsWithVowel ? full : full.slice(1)}`;
  }

  return `${word}'${hint}`;
}

// ── Variable chips ────────────────────────────────────────────────────────────
const VARIABLES = [
  { label: 'First name', value: '{{first_name}}' },
  { label: 'Last name', value: '{{last_name}}' },
  { label: 'Company', value: '{{company}}' },
  { label: "Company'de", value: '{{ekle company "de"}}' },
  { label: "Company'den", value: '{{ekle company "den"}}' },
  { label: "Company'nin", value: '{{ekle company "nin"}}' },
  { label: 'Job title', value: '{{job_title}}' },
  { label: 'Domain', value: '{{domain}}' },
  { label: 'Email', value: '{{email}}' },
];

const SAMPLE_COMPANY = 'Codeway';

const SAMPLE_DATA: Record<string, string> = {
  '{{first_name}}': 'John',
  '{{last_name}}': 'Doe',
  '{{company}}': SAMPLE_COMPANY,
  '{{job_title}}': 'CTO',
  '{{domain}}': 'codeway.co',
  '{{email}}': 'john@codeway.co',
};

function replaceSampleVars(text: string) {
  return text
    .replace(/\{\{(\w+)\}\}/g, (m) => SAMPLE_DATA[m] ?? m)
    .replace(/\{\{fallback\s+\w+\s+"([^"]+)"\}\}/g, '$1')
    .replace(/\{\{ekle\s+(\w+)\s+"([^"]+)"\}\}/g, (_m, varName, hint) => {
      const val = varName === 'company' ? SAMPLE_COMPANY : (SAMPLE_DATA[`{{${varName}}}`] ?? varName);
      return applyTurkishSuffix(val, hint);
    });
}

interface VariableChipsProps {
  onInsert: (variable: string) => void;
  target: 'subject' | 'body';
}

function VariableChips({ onInsert }: VariableChipsProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className="text-xs text-muted-foreground self-center">Insert:</span>
      {VARIABLES.map((v) => (
        <button
          key={v.value}
          type="button"
          onClick={() => onInsert(v.value)}
          className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
        >
          <Plus className="h-2.5 w-2.5" />
          {v.label}
        </button>
      ))}
    </div>
  );
}

// ── Attachment helpers ─────────────────────────────────────────────────────────
function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Test email dialog ─────────────────────────────────────────────────────────
interface TestEmailDialogProps {
  open: boolean;
  onClose: () => void;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  templateId?: string;
}

type DataMode = 'sample' | 'contact' | 'custom';

function extractTemplateVars(subject: string, body: string): string[] {
  const text = `${subject} ${body}`;
  const vars = new Set<string>();
  for (const m of text.matchAll(/\{\{(\w+)\}\}/g)) {
    if (m[1] !== 'fallback') vars.add(m[1]);
  }
  for (const m of text.matchAll(/\{\{ekle\s+(\w+)\s+"[^"]+"\}\}/g)) {
    vars.add(m[1]);
  }
  return [...vars].sort();
}

function TestEmailDialog({ open, onClose, subject, bodyHtml, bodyText, templateId }: TestEmailDialogProps) {
  const [contactId, setContactId] = useState('');
  const [toEmail, setToEmail] = useState('');
  const [dataMode, setDataMode] = useState<DataMode>('sample');
  const [customFields, setCustomFields] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ success: boolean; sentTo?: string; error?: string } | null>(null);

  const detectedVars = extractTemplateVars(subject, bodyText ?? bodyHtml);

  const { data: contacts } = useQuery({
    queryKey: ['contacts-test-email'],
    queryFn: () => contactsApi.getAll({ limit: 30 }),
    enabled: open,
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      templatesApi.sendTestEmail({
        subject,
        bodyHtml,
        bodyText,
        contactId: dataMode === 'contact' && contactId ? contactId : undefined,
        toEmail: toEmail || undefined,
        templateId,
        customData: dataMode === 'custom' ? customFields : undefined,
      }),
    onSuccess: (data) => setResult({ success: true, sentTo: data.sentTo }),
    onError: (err: any) =>
      setResult({ success: false, error: err.response?.data?.message || 'Failed to send' }),
  });

  const handleClose = () => {
    setResult(null);
    setContactId('');
    setToEmail('');
    setDataMode('sample');
    setCustomFields({});
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Send Test Email
          </DialogTitle>
        </DialogHeader>

        {result ? (
          <div className={`rounded-lg border p-4 text-sm ${result.success ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
            <div className="flex items-center gap-2 font-medium mb-1">
              {result.success
                ? <><CheckCircle2 className="h-4 w-4" /> Test email sent!</>
                : <><AlertCircle className="h-4 w-4" /> Failed to send</>}
            </div>
            {result.success && <p className="text-xs">Sent to: {result.sentTo}</p>}
            {result.error && <p className="text-xs">{result.error}</p>}
            <Button size="sm" variant="outline" className="mt-3" onClick={handleClose}>Close</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Send to (leave blank to use your account email)</Label>
              <Input
                placeholder="override@email.com"
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Personalization data</Label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { mode: 'sample', title: 'Sample', sub: 'John Doe · CTO' },
                    { mode: 'contact', title: 'Real contact', sub: 'From contacts' },
                    { mode: 'custom', title: 'Custom', sub: 'Enter manually' },
                  ] as { mode: DataMode; title: string; sub: string }[]
                ).map(({ mode, title, sub }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setDataMode(mode)}
                    className={cn(
                      'rounded-lg border p-3 text-sm text-left transition-all',
                      dataMode === mode ? 'border-primary bg-primary/5' : 'hover:border-primary/40',
                    )}
                  >
                    <p className="font-medium">{title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
                  </button>
                ))}
              </div>
            </div>

            {dataMode === 'contact' && (
              <div className="space-y-2">
                <Label>Select contact</Label>
                <Select value={contactId} onValueChange={setContactId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a contact" />
                  </SelectTrigger>
                  <SelectContent>
                    {contacts?.data?.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.email} {c.firstName ? `· ${c.firstName}` : ''}
                        {c.company ? ` · ${c.company}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {dataMode === 'custom' && (
              <div className="space-y-3">
                {detectedVars.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No variables detected in this template.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {detectedVars.map((varName) => (
                      <div key={varName} className="grid grid-cols-[110px_1fr] items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground truncate">{`{{${varName}}}`}</span>
                        <Input
                          className="h-7 text-xs"
                          placeholder={varName}
                          value={customFields[varName] ?? ''}
                          onChange={(e) =>
                            setCustomFields((prev) => ({ ...prev, [varName]: e.target.value }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={handleClose}>Cancel</Button>
              <Button
                className="flex-1"
                onClick={() => sendMutation.mutate()}
                disabled={sendMutation.isPending || (dataMode === 'contact' && !contactId)}
              >
                {sendMutation.isPending
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...</>
                  : <><Send className="mr-2 h-4 w-4" /> Send test</>}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Attachment panel ──────────────────────────────────────────────────────────
export interface TemplateAttachmentMeta {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  filename: string;
}

interface AttachmentPanelProps {
  templateId?: string;
  attachments: TemplateAttachmentMeta[];
  pendingFiles: File[];
  onPendingAdd: (files: File[]) => void;
  onPendingRemove: (index: number) => void;
  onAttachmentDeleted: (id: string) => void;
  allowPendingAttachments?: boolean;
}

function AttachmentPanel({
  templateId,
  attachments,
  pendingFiles,
  onPendingAdd,
  onPendingRemove,
  onAttachmentDeleted,
  allowPendingAttachments = false,
}: AttachmentPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const isEditable = !!templateId;
  const canAddFiles = isEditable || allowPendingAttachments;

  const uploadMutation = useMutation({
    mutationFn: (files: File[]) => templatesApi.uploadAttachments(templateId!, files),
    onSuccess: (created: TemplateAttachmentMeta[]) => {
      created.forEach((a) => onAttachmentDeleted(a.id));
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    e.target.value = '';
    if (templateId) {
      uploadMutation.mutate(files);
    } else {
      onPendingAdd(files);
    }
  };

  const handleDelete = async (att: TemplateAttachmentMeta) => {
    if (!templateId) return;
    setDeletingId(att.id);
    try {
      await templatesApi.deleteAttachment(templateId, att.id);
      onAttachmentDeleted(att.id);
    } finally {
      setDeletingId(null);
    }
  };

  const hasAny = attachments.length > 0 || pendingFiles.length > 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5 text-sm">
          <Paperclip className="h-3.5 w-3.5" />
          Attachments
          {hasAny && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium">
              {attachments.length + pendingFiles.length}
            </span>
          )}
          {!isEditable && attachments.length > 0 && (
            <span className="text-xs text-muted-foreground font-normal">(from template)</span>
          )}
        </Label>

        {canAddFiles && (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadMutation.isPending}
            >
              {uploadMutation.isPending
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <Plus className="h-3 w-3" />}
              Add file
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
          </>
        )}
      </div>

      {hasAny && (
        <div className="space-y-1.5">
          {attachments.map((att) => (
            <div key={att.id} className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate font-medium">{att.originalName}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(att.size)}</span>
              {isEditable && (
                <button
                  type="button"
                  onClick={() => handleDelete(att)}
                  disabled={deletingId === att.id}
                  className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                >
                  {deletingId === att.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <X className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          ))}
          {pendingFiles.map((f, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border bg-amber-50 border-amber-200 px-3 py-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-amber-500" />
              <span className="flex-1 truncate font-medium">{f.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(f.size)}</span>
              <span className="shrink-0 text-xs text-amber-600 italic">pending save</span>
              <button
                type="button"
                onClick={() => onPendingRemove(i)}
                className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {!hasAny && canAddFiles && (
        <p className="text-xs text-muted-foreground">No attachments yet.</p>
      )}
    </div>
  );
}

// ── Gender variant types ───────────────────────────────────────────────────────
type GenderVariant = 'default' | 'male' | 'female';

// ── Main component ─────────────────────────────────────────────────────────────
export interface EmailEditorValue {
  name: string;
  categoryId: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  // Male variant (empty string means "use default")
  maleSubject?: string;
  maleBodyText?: string;
  maleBodyHtml?: string;
  // Female variant
  femaleSubject?: string;
  femaleBodyText?: string;
  femaleBodyHtml?: string;
  attachments?: TemplateAttachmentMeta[];
  pendingFiles?: File[];
}

interface VisualEmailEditorProps {
  value: EmailEditorValue;
  onChange: (value: EmailEditorValue) => void;
  categories?: Array<{ id: string; name: string }>;
  showNameAndCategory?: boolean;
  templateId?: string;
  allowPendingAttachments?: boolean;
  className?: string;
}

const VARIANT_META: Record<GenderVariant, { label: string; icon?: React.ReactNode; color: string }> = {
  default: { label: 'Default', color: 'text-muted-foreground' },
  male: {
    label: 'Male',
    icon: <GenderMale className="text-blue-600" />,
    color: 'text-blue-600',
  },
  female: {
    label: 'Female',
    icon: <GenderFemale className="text-pink-600" />,
    color: 'text-pink-600',
  },
};

export function VisualEmailEditor({
  value,
  onChange,
  categories = [],
  showNameAndCategory = true,
  templateId,
  allowPendingAttachments = false,
  className,
}: VisualEmailEditorProps) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const [activeVariableTarget, setActiveVariableTarget] = useState<'subject' | 'body'>('body');
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [activeEditorTab, setActiveEditorTab] = useState<'write' | 'preview'>('write');
  const [genderVariant, setGenderVariant] = useState<GenderVariant>('default');

  // Get the current subject/body for the active gender variant
  const getCurrentSubject = (): string => {
    if (genderVariant === 'male') return value.maleSubject ?? '';
    if (genderVariant === 'female') return value.femaleSubject ?? '';
    return value.subject;
  };

  const getCurrentBodyText = (): string => {
    if (genderVariant === 'male') return value.maleBodyText ?? '';
    if (genderVariant === 'female') return value.femaleBodyText ?? '';
    return value.bodyText;
  };

  const getCurrentBodyHtml = (): string => {
    if (genderVariant === 'male') return value.maleBodyHtml ?? '';
    if (genderVariant === 'female') return value.femaleBodyHtml ?? '';
    return value.bodyHtml;
  };

  // Fallback subject/body for placeholder hint
  const getFallbackSubject = (): string => {
    if (genderVariant !== 'default') return value.subject;
    return '';
  };

  const setCurrentField = (field: 'subject' | 'bodyText', val: string) => {
    if (genderVariant === 'default') {
      const next = { ...value, [field]: val };
      if (field === 'bodyText') next.bodyHtml = bodyTextToHtml(val);
      onChange(next);
    } else {
      const prefix = genderVariant;
      if (field === 'subject') {
        onChange({ ...value, [`${prefix}Subject`]: val });
      } else {
        onChange({
          ...value,
          [`${prefix}BodyText`]: val,
          [`${prefix}BodyHtml`]: bodyTextToHtml(val),
        });
      }
    }
  };

  const insertVariable = (variable: string) => {
    if (activeVariableTarget === 'subject') {
      const el = subjectRef.current;
      if (!el) return;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const newVal = el.value.slice(0, start) + variable + el.value.slice(end);
      setCurrentField('subject', newVal);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + variable.length, start + variable.length);
      });
    } else {
      insertAtCursor(bodyRef, variable, (v) => setCurrentField('bodyText', v));
    }
  };

  const currentSubject = getCurrentSubject();
  const currentBodyText = getCurrentBodyText();
  const currentBodyHtml = getCurrentBodyHtml();

  const previewBodyText = replaceSampleVars(
    currentBodyText || (genderVariant !== 'default' ? value.bodyText : ''),
  );
  const previewSubject = replaceSampleVars(
    currentSubject || (genderVariant !== 'default' ? value.subject : ''),
  );

  const attachments = value.attachments ?? [];
  const pendingFiles = value.pendingFiles ?? [];

  const isVariantEmpty = genderVariant !== 'default' && !currentSubject && !currentBodyText;

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Name + Category */}
      {showNameAndCategory && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Template name</Label>
            <Input
              value={value.name}
              onChange={(e) => onChange({ ...value, name: e.target.value })}
              placeholder="e.g. CTO Outreach — March"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select
              value={value.categoryId || 'none'}
              onValueChange={(v) => onChange({ ...value, categoryId: v === 'none' ? '' : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No category</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Gender variant switcher */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Version:</span>
        <div className="flex rounded-lg border bg-muted/30 p-0.5 gap-0.5">
          {(['default', 'male', 'female'] as GenderVariant[]).map((v) => {
            const meta = VARIANT_META[v];
            const isActive = genderVariant === v;
            const hasContent = v === 'default'
              ? true
              : v === 'male'
                ? !!(value.maleSubject || value.maleBodyText)
                : !!(value.femaleSubject || value.femaleBodyText);

            return (
              <button
                key={v}
                type="button"
                onClick={() => setGenderVariant(v)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                  isActive
                    ? 'bg-white shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {meta.icon}
                {meta.label}
                {hasContent && v !== 'default' && (
                  <span className={cn(
                    'ml-0.5 h-1.5 w-1.5 rounded-full',
                    v === 'male' ? 'bg-blue-400' : 'bg-pink-400',
                  )} />
                )}
              </button>
            );
          })}
        </div>
        {genderVariant !== 'default' && (
          <span className="text-xs text-muted-foreground">
            {isVariantEmpty
              ? 'Empty — will use the Default version as fallback'
              : `Custom ${genderVariant} version active`}
          </span>
        )}
      </div>

      {/* Compose window */}
      <div className="overflow-hidden rounded-xl border shadow-sm">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
          <VariableChips onInsert={insertVariable} target={activeVariableTarget} />
          <div className="flex items-center gap-2">
            <Tabs value={activeEditorTab} onValueChange={(v) => setActiveEditorTab(v as any)}>
              <TabsList className="h-7">
                <TabsTrigger value="write" className="h-6 px-2.5 text-xs">Write</TabsTrigger>
                <TabsTrigger value="preview" className="h-6 px-2.5 text-xs">
                  <Eye className="mr-1 h-3 w-3" />Preview
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => setTestDialogOpen(true)}
            >
              <Send className="mr-1.5 h-3 w-3" />
              Test
            </Button>
          </div>
        </div>

        {activeEditorTab === 'write' ? (
          <div className={cn(
            'bg-white',
            genderVariant === 'male' && 'ring-1 ring-inset ring-blue-100',
            genderVariant === 'female' && 'ring-1 ring-inset ring-pink-100',
          )}>
            {/* Subject */}
            <div className="flex items-center border-b px-4">
              <span className="w-16 flex-shrink-0 text-xs font-medium text-muted-foreground">Subject</span>
              <input
                ref={subjectRef}
                value={currentSubject}
                onChange={(e) => setCurrentField('subject', e.target.value)}
                onFocus={() => setActiveVariableTarget('subject')}
                placeholder={
                  genderVariant !== 'default'
                    ? `Leave empty to use default: "${getFallbackSubject() || 'your default subject'}"`
                    : 'Write your subject line...'
                }
                className="flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground/60"
              />
            </div>
            {/* Body */}
            <textarea
              ref={bodyRef}
              value={currentBodyText}
              onChange={(e) => setCurrentField('bodyText', e.target.value)}
              onFocus={() => setActiveVariableTarget('body')}
              placeholder={
                genderVariant !== 'default'
                  ? `Leave empty to use the Default version as fallback.\n\nOr write a custom ${genderVariant} version here...`
                  : `Write your email here...\n\nUse the Insert buttons above to add personalisation variables like {{first_name}} or {{company}}.\n\nSeparate paragraphs with a blank line.`
              }
              className="block min-h-[260px] w-full resize-none bg-transparent p-4 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/50"
            />
          </div>
        ) : (
          <div className="bg-white">
            {/* Preview subject */}
            <div className="flex items-center border-b px-4 py-3">
              <span className="w-16 flex-shrink-0 text-xs font-medium text-muted-foreground">Subject</span>
              <span className="text-sm font-medium">
                {previewSubject || <span className="text-muted-foreground italic">No subject</span>}
              </span>
              {genderVariant !== 'default' && !currentSubject && (
                <span className="ml-2 text-xs text-muted-foreground italic">(from default)</span>
              )}
            </div>
            {/* Preview body */}
            <div className="min-h-[260px] p-4 text-sm leading-relaxed">
              {genderVariant !== 'default' && !currentBodyText && (
                <p className="mb-3 text-xs text-muted-foreground italic border-b pb-2">
                  No {genderVariant} version — showing default as fallback
                </p>
              )}
              {previewBodyText
                ? (
                  <pre className="m-0 whitespace-pre-wrap font-[inherit] text-sm leading-relaxed">
                    {previewBodyText}
                  </pre>
                )
                : <p className="text-muted-foreground italic">Nothing to preview yet.</p>}
            </div>
          </div>
        )}
      </div>

      {/* Attachments */}
      <AttachmentPanel
        templateId={templateId}
        attachments={attachments}
        pendingFiles={pendingFiles}
        allowPendingAttachments={allowPendingAttachments}
        onPendingAdd={(files) => onChange({ ...value, pendingFiles: [...pendingFiles, ...files] })}
        onPendingRemove={(i) =>
          onChange({ ...value, pendingFiles: pendingFiles.filter((_, idx) => idx !== i) })
        }
        onAttachmentDeleted={(id) =>
          onChange({ ...value, attachments: attachments.filter((a) => a.id !== id) })
        }
      />

      <TestEmailDialog
        open={testDialogOpen}
        onClose={() => setTestDialogOpen(false)}
        subject={currentSubject || value.subject}
        bodyHtml={currentBodyHtml || value.bodyHtml}
        bodyText={currentBodyText || value.bodyText}
        templateId={templateId}
      />
    </div>
  );
}
