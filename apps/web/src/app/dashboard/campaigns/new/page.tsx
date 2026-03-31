'use client';
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  contactsApi, templatesApi, campaignsApi, routingRulesApi,
  type CampaignSendingLimits, getDetectGendersErrorMessage,
} from '@/lib/api';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  VisualEmailEditor, EmailEditorValue, htmlToBodyText, bodyTextToHtml,
} from '@/components/templates/visual-email-editor';
import {
  Users, Calendar, Send, Loader2, ChevronRight, ChevronLeft,
  CheckCircle2, AlertCircle, AlertTriangle, Clock, Zap,
  HelpCircle, SkipForward, Linkedin, Plus, GitBranch,
  FileText, RefreshCw, PenLine, Wand2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { addDays } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import {
  ContactsTableToolbar,
  type ContactPageSize,
} from '@/components/contacts/contacts-table-toolbar';
import {
  ContactsFiltersBar,
  clearContactsFilters,
  contactsFiltersToQueryParams,
  type ContactsFilterFields,
} from '@/components/contacts/contacts-filters-bar';
import { ContactEmailStatusLabel } from '@/lib/contact-email-status';
import { StatusBadge } from '@/components/email-jobs/status-badge';

/** Matches server-derived `emailStatus` on contacts (sent, scheduled/processing, or replied). */
function contactHasPriorOutreach(emailStatus: string | undefined | null): boolean {
  return (emailStatus ?? 'never_contacted') !== 'never_contacted';
}

function GenderMale({ className }: { className?: string }) {
  return <span className={cn('font-bold leading-none', className)}>♂</span>;
}
function GenderFemale({ className }: { className?: string }) {
  return <span className={cn('font-bold leading-none', className)}>♀</span>;
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface ContactGenderState {
  contactId: string;
  email: string;
  firstName: string | null;
  linkedin: string | null;
  detectedGender: 'male' | 'female' | null;
  probability: number;
  autoAssigned: boolean;
  assignedGender: 'male' | 'female' | null;
}

interface RoutingAssignment {
  contactId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  assignedTemplateId: string | null;
  assignedTemplateName: string | null;
  matchedCategory: string | null;
  routingSource: 'auto' | 'manual' | 'unmatched';
}

type CampaignMode = 'single' | 'routing';

// ── Helpers ───────────────────────────────────────────────────────────────────
/** Matches server / product default “morning send” shortcut (see scheduling UI). */
const BUSINESS_SEND_START_HOUR = 8;
const BUSINESS_SEND_START_MINUTE = 30;

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function ymdPlusCalendarDays(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const anchor = new Date(y, m - 1, d, 12, 0, 0, 0);
  const next = addDays(anchor, deltaDays);
  return `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-${pad2(next.getDate())}`;
}

function ymdToLocalParts(ymd: string): [number, number, number] {
  const [y, m, d] = ymd.split('-').map(Number);
  return [y, m - 1, d];
}

/**
 * Earliest upcoming weekday slot at BUSINESS_SEND_START in `timeZone`
 * (same calendar day if still before that time on a weekday; otherwise next weekday).
 */
function getNextValidBusinessSendTime(timeZone: string): string {
  const now = new Date();
  const ymdNow = formatInTimeZone(now, timeZone, 'yyyy-MM-dd');
  const isoDow = parseInt(formatInTimeZone(now, timeZone, 'i'), 10);
  const h = parseInt(formatInTimeZone(now, timeZone, 'H'), 10);
  const minute = parseInt(formatInTimeZone(now, timeZone, 'm'), 10);
  const mins = h * 60 + minute;
  const startMins = BUSINESS_SEND_START_HOUR * 60 + BUSINESS_SEND_START_MINUTE;

  const isWeekend = isoDow === 6 || isoDow === 7;
  if (!isWeekend && mins <= startMins) {
    return `${ymdNow}T${pad2(BUSINESS_SEND_START_HOUR)}:${pad2(BUSINESS_SEND_START_MINUTE)}`;
  }

  let ymd = ymdPlusCalendarDays(ymdNow, 1);
  for (let g = 0; g < 14; g++) {
    const [yy, mm, dd] = ymdToLocalParts(ymd);
    const noonInZone = fromZonedTime(new Date(yy, mm, dd, 12, 0, 0, 0), timeZone);
    const dow = parseInt(formatInTimeZone(noonInZone, timeZone, 'i'), 10);
    if (dow >= 1 && dow <= 5) {
      return `${ymd}T${pad2(BUSINESS_SEND_START_HOUR)}:${pad2(BUSINESS_SEND_START_MINUTE)}`;
    }
    ymd = ymdPlusCalendarDays(ymd, 1);
  }

  throw new Error('Could not resolve next business send time');
}

function confidenceBadge(probability: number) {
  const pct = Math.round(probability * 100);
  const color = probability >= 0.75
    ? 'bg-green-100 text-green-700'
    : probability >= 0.5
      ? 'bg-yellow-100 text-yellow-700'
      : 'bg-red-100 text-red-700';
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', color)}>
      {pct}%
    </span>
  );
}

const CATEGORY_COLORS: Record<string, string> = {
  Executive: 'bg-purple-100 text-purple-700 border-purple-200',
  Technical: 'bg-blue-100 text-blue-700 border-blue-200',
  HR: 'bg-green-100 text-green-700 border-green-200',
  Sales: 'bg-orange-100 text-orange-700 border-orange-200',
  Marketing: 'bg-pink-100 text-pink-700 border-pink-200',
};

function getCategoryColor(name: string | null) {
  if (!name) return 'bg-muted text-muted-foreground border-border';
  return CATEGORY_COLORS[name] ?? 'bg-muted text-muted-foreground border-border';
}

function parseBinaryGender(raw: unknown): 'male' | 'female' | null {
  if (raw == null || typeof raw !== 'string') return null;
  const t = raw.trim().toLowerCase();
  if (t === 'male') return 'male';
  if (t === 'female') return 'female';
  return null;
}

/** Normalizes optional gender strings from imported contact rows (M/F, etc.). */
function parseContactStoredGender(raw: string | null | undefined): 'male' | 'female' | null {
  if (raw == null || typeof raw !== 'string') return null;
  const t = raw.trim().toLowerCase();
  if (t === 'male' || t === 'm' || t === 'man') return 'male';
  if (t === 'female' || t === 'f' || t === 'woman') return 'female';
  return null;
}

/** Read-only gender summary for personalization review (data from `genderStates`). */
function PersonalizationGenderSummary({
  state,
  genderSkipped,
  contactStoredGender,
}: {
  state: ContactGenderState | undefined;
  genderSkipped: boolean;
  contactStoredGender?: string | null;
}) {
  if (genderSkipped) {
    return (
      <span className="inline-flex rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
        Default template
      </span>
    );
  }

  const assigned = parseBinaryGender(state?.assignedGender);
  const detected = parseBinaryGender(state?.detectedGender);
  const fromContact = parseContactStoredGender(contactStoredGender);
  /** Template variant used for send: assigned wins; else detection; else CRM field (lookup only). */
  const display = assigned ?? detected ?? fromContact;

  if (!display) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const g = display;
  const showConfidenceBadge =
    !!state && state.autoAssigned && assigned && detected === assigned && state.probability > 0;
  /** Extra line only when assigned row should show detection detail (avoid duplicating primary when display is detection-only). */
  const showDetectedLine =
    !!state &&
    !!detected &&
    !!assigned &&
    (detected !== assigned || !state.autoAssigned);
  const showManualLabel =
    !!state && !state.detectedGender && !state.autoAssigned && !!assigned;
  const showFromContactNote =
    !!fromContact && display === fromContact && assigned == null && detected == null;

  return (
    <div className="space-y-0.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {g === 'male' ? (
          <GenderMale className="h-3.5 w-3.5 shrink-0 text-blue-500" />
        ) : (
          <GenderFemale className="h-3.5 w-3.5 shrink-0 text-pink-500" />
        )}
        <span className="capitalize text-xs font-medium">{g}</span>
        {showConfidenceBadge ? confidenceBadge(state.probability) : null}
      </div>
      {showDetectedLine && state && (
        <p className="text-[11px] leading-snug text-muted-foreground">
          Detected:{' '}
          <span className="capitalize">{state.detectedGender}</span>
          {state.probability > 0 ? ` · ${Math.round(state.probability * 100)}%` : null}
        </p>
      )}
      {showManualLabel ? (
        <p className="text-[11px] text-muted-foreground">Manual</p>
      ) : null}
      {showFromContactNote ? (
        <p className="text-[11px] text-muted-foreground">From contact record</p>
      ) : null}
    </div>
  );
}

function formatCampaignCreateError(err: unknown): string {
  const data = (err as { response?: { data?: { message?: unknown } } })?.response?.data;
  if (!data) return 'Failed to create campaign';
  const m = data.message;
  if (typeof m === 'string') return m;
  if (Array.isArray(m)) return m.join(' ');
  return 'Failed to create campaign';
}

const SINGLE_STEPS = ['Recipients', 'Gender Detection', 'Personalization', 'Template & Schedule', 'Review'];
const ROUTING_STEPS = ['Recipients', 'Gender Detection', 'Personalization', 'Template Routing', 'Review'];

function parseRoutingKeywords(input: string): string[] {
  return input.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
}

/**
 * The canonical rule for a routing category: highest priority among rules in that category,
 * preferring a row that has a template (same row used for template display and for merging keywords).
 */
function getCanonicalRoutingRuleForCategory(
  rules: {
    id: string;
    categoryName: string;
    templateId: string | null;
    priority: number;
    keywords: string[];
    exactPhrases?: string[];
  }[],
  categoryName: string,
) {
  if (!categoryName) return null;
  const inCat = rules.filter((r) => r.categoryName === categoryName);
  if (!inCat.length) return null;
  const sorted = [...inCat].sort((a, b) => b.priority - a.priority);
  for (const r of sorted) {
    if (r.templateId) return r;
  }
  return sorted[0] ?? null;
}

function mergeUniqueTokens(existing: string[], additions: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of [...existing, ...additions]) {
    const t = s.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

const TIMEZONES = [
  'UTC', 'Europe/Istanbul', 'America/New_York', 'America/Chicago',
  'America/Denver', 'America/Los_Angeles', 'Europe/London',
  'Europe/Berlin', 'Asia/Dubai', 'Asia/Tokyo', 'Australia/Sydney',
];

const emptyCustomForm: EmailEditorValue = {
  name: '', categoryId: '', subject: '', bodyText: '', bodyHtml: '',
  maleSubject: '', maleBodyText: '', maleBodyHtml: '',
  femaleSubject: '', femaleBodyText: '', femaleBodyHtml: '',
  attachments: [], pendingFiles: [],
};

// ── Page ───────────────────────────────────────────────────────────────────────
export default function NewCampaignPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);

  // Campaign mode
  const [campaignMode, setCampaignMode] = useState<CampaignMode>('routing');

  // Step 0 — Recipients
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [recipientFilters, setRecipientFilters] = useState<ContactsFilterFields>(() => clearContactsFilters());
  const [recipientPage, setRecipientPage] = useState(1);
  const [recipientPageSize, setRecipientPageSize] = useState<ContactPageSize>(50);

  const handleRecipientFiltersChange = useCallback((next: ContactsFilterFields) => {
    setRecipientFilters(next);
    setRecipientPage(1);
    setSelectedIds(new Set());
  }, []);

  // Step 1 — Gender Detection
  const [genderStates, setGenderStates] = useState<ContactGenderState[]>([]);
  const [genderDetecting, setGenderDetecting] = useState(false);
  const [genderDetected, setGenderDetected] = useState(false);
  const [genderSkipped, setGenderSkipped] = useState(false);
  const [genderError, setGenderError] = useState<string | null>(null);
  /** True when genderize.io stopped early (rate limit / quota / timeout on their side). */
  const [genderLimitReached, setGenderLimitReached] = useState(false);

  // Step 2 — Template & Schedule (single mode) / Routing (routing mode)
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const nextBusinessSendAt = getNextValidBusinessSendTime(timezone);

  // Routing mode state
  const [routingAssignments, setRoutingAssignments] = useState<RoutingAssignment[]>([]);
  const [routingPreviewDone, setRoutingPreviewDone] = useState(false);
  const [routingLoading, setRoutingLoading] = useState(false);
  const [fallbackTemplateId, setFallbackTemplateId] = useState('');

  /** first_name overrides for this campaign only (contactId → edited first name) */
  const [firstNameOverrides, setFirstNameOverrides] = useState<Record<string, string>>({});

  const [quickRuleDialogOpen, setQuickRuleDialogOpen] = useState(false);
  const [quickRuleKeyword, setQuickRuleKeyword] = useState('');
  const [quickRuleMatch, setQuickRuleMatch] = useState<'contains' | 'exact'>('contains');
  const [quickRuleCategoryName, setQuickRuleCategoryName] = useState('');

  // Custom template dialog
  const [showCustomDialog, setShowCustomDialog] = useState(false);
  const [customBaseId, setCustomBaseId] = useState('');
  const [customForm, setCustomForm] = useState<EmailEditorValue>(emptyCustomForm);

  const recipientListParams = useMemo(
    () => contactsFiltersToQueryParams(recipientFilters, { page: recipientPage, limit: recipientPageSize }),
    [recipientFilters, recipientPage, recipientPageSize],
  );

  const recipientFilterParamsBulk = useMemo(
    () => contactsFiltersToQueryParams(recipientFilters),
    [recipientFilters],
  );

  const { data: contactsData, isLoading: contactsLoading, dataUpdatedAt: contactsCampaignDataUpdatedAt } = useQuery({
    queryKey: ['contacts-campaign', recipientListParams],
    queryFn: () => contactsApi.getAll(recipientListParams),
  });

  const selectedIdsKey = useMemo(() => [...selectedIds].sort().join(','), [selectedIds]);

  const { data: selectedContactsBatch, isLoading: selectedContactsLoading } = useQuery({
    queryKey: ['contacts-lookup', selectedIdsKey],
    queryFn: () => contactsApi.lookupByIds([...selectedIds]),
    enabled: selectedIds.size > 0,
  });

  const selectedById = useMemo(() => {
    const m = new Map<string, any>();
    for (const c of selectedContactsBatch?.data ?? []) {
      m.set(c.id, c);
    }
    return m;
  }, [selectedContactsBatch]);

  const selectionLookupComplete =
    selectedIds.size === 0 ||
    (!selectedContactsLoading &&
      (selectedContactsBatch?.data?.length ?? 0) === selectedIds.size &&
      [...selectedIds].every((id) => selectedById.has(id)));

  const priorOutreachSelectedIds = useMemo(() => {
    if (!selectionLookupComplete) return [];
    const out: string[] = [];
    for (const id of selectedIds) {
      const c = selectedById.get(id);
      if (c && contactHasPriorOutreach(c.emailStatus)) out.push(id);
    }
    return out;
  }, [selectedIds, selectedById, selectionLookupComplete]);

  const removePriorOutreachFromSelection = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of priorOutreachSelectedIds) next.delete(id);
      return next;
    });
  }, [priorOutreachSelectedIds]);

  /** Keep batch lookup fresh when revisiting recipients or when the list refetches (edited contacts). */
  const prevStepForLookupRef = useRef(step);
  useEffect(() => {
    const prev = prevStepForLookupRef.current;
    prevStepForLookupRef.current = step;
    if (selectedIds.size === 0) return;
    if ((step === 0 && prev !== 0) || (prev === 0 && step === 1)) {
      void queryClient.invalidateQueries({ queryKey: ['contacts-lookup', selectedIdsKey] });
    }
  }, [step, selectedIdsKey, selectedIds.size, queryClient]);

  /** When the recipient list refetches (focus, filters, or cache invalidation), refresh selected-contact batch too. */
  const prevContactsListUpdatedAtRef = useRef(0);
  useEffect(() => {
    if (selectedIds.size === 0) {
      prevContactsListUpdatedAtRef.current = contactsCampaignDataUpdatedAt;
      return;
    }
    const prevAt = prevContactsListUpdatedAtRef.current;
    if (prevAt !== 0 && contactsCampaignDataUpdatedAt !== prevAt) {
      void queryClient.invalidateQueries({ queryKey: ['contacts-lookup', selectedIdsKey] });
    }
    prevContactsListUpdatedAtRef.current = contactsCampaignDataUpdatedAt;
  }, [selectedIdsKey, selectedIds.size, contactsCampaignDataUpdatedAt, queryClient]);

  /** Bumped when selected recipient ids change; stale async gender/routing results are ignored. */
  const recipientSelectionEpochRef = useRef(0);

  /** Merge latest contact rows into gender UI (IDs and assignments unchanged). */
  useEffect(() => {
    if (!genderDetected || genderSkipped) return;
    const rows = selectedContactsBatch?.data as any[] | undefined;
    if (!rows?.length) return;
    const byId = new Map(rows.map((c) => [c.id, c]));
    setGenderStates((prev) => {
      if (!prev.length) return prev;
      let changed = false;
      const next = prev.map((s) => {
        const c = byId.get(s.contactId);
        if (!c) return s;
        const email = c.email ?? s.email;
        const firstName = c.firstName ?? s.firstName;
        const linkedin = c.linkedin ?? s.linkedin;
        if (email === s.email && firstName === s.firstName && linkedin === s.linkedin) return s;
        changed = true;
        return { ...s, email, firstName, linkedin };
      });
      return changed ? next : prev;
    });
  }, [selectedContactsBatch?.data, genderDetected, genderSkipped]);

  /** Merge latest contact rows into routing preview rows (template choices unchanged). */
  useEffect(() => {
    if (!routingPreviewDone) return;
    const rows = selectedContactsBatch?.data as any[] | undefined;
    if (!rows?.length) return;
    const byId = new Map(rows.map((c) => [c.id, c]));
    setRoutingAssignments((prev) => {
      if (!prev.length) return prev;
      let changed = false;
      const next = prev.map((a) => {
        const c = byId.get(a.contactId);
        if (!c) return a;
        const email = c.email ?? a.email;
        const firstName = c.firstName ?? a.firstName;
        const lastName = c.lastName ?? a.lastName;
        const jobTitle = c.jobTitle ?? a.jobTitle;
        if (
          email === a.email &&
          firstName === a.firstName &&
          lastName === a.lastName &&
          jobTitle === a.jobTitle
        ) {
          return a;
        }
        changed = true;
        return { ...a, email, firstName, lastName, jobTitle };
      });
      return changed ? next : prev;
    });
  }, [selectedContactsBatch?.data, routingPreviewDone]);

  /** Drop campaign-only first name overrides that now match stored contact data. */
  useEffect(() => {
    const rows = selectedContactsBatch?.data as any[] | undefined;
    if (!rows?.length) return;
    const byId = new Map(rows.map((c) => [c.id, c]));
    setFirstNameOverrides((prev) => {
      const keys = Object.keys(prev);
      if (!keys.length) return prev;
      let next: Record<string, string> | null = null;
      for (const id of keys) {
        const c = byId.get(id);
        if (!c) continue;
        const stored = c.firstName ?? '';
        if (prev[id] === stored) {
          if (!next) next = { ...prev };
          delete next[id];
        }
      }
      return next ?? prev;
    });
  }, [selectedContactsBatch?.data]);

  const { data: templatesRaw } = useQuery({
    queryKey: ['templates-campaign'],
    queryFn: () => templatesApi.getAll(),
  });
  const templates: any[] = Array.isArray(templatesRaw) ? templatesRaw : [];

  const { data: categories } = useQuery({
    queryKey: ['template-categories'],
    queryFn: templatesApi.getCategories,
  });

  const { data: routingRules = [] } = useQuery({
    queryKey: ['routing-rules'],
    queryFn: routingRulesApi.getAll,
  });

  const existingRoutingCategoryNames = useMemo(
    () =>
      [...new Set((routingRules as any[]).map((r: any) => r.categoryName).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [routingRules],
  );

  const quickRuleCanonicalRule = useMemo(
    () => getCanonicalRoutingRuleForCategory(routingRules as any[], quickRuleCategoryName),
    [routingRules, quickRuleCategoryName],
  );

  const quickRuleResolvedTemplateId = quickRuleCanonicalRule?.templateId ?? null;

  const quickRuleResolvedTemplateName = useMemo(() => {
    if (!quickRuleResolvedTemplateId) return null;
    return templates.find((t: any) => t.id === quickRuleResolvedTemplateId)?.name ?? null;
  }, [templates, quickRuleResolvedTemplateId]);

  const { data: sendingLimits } = useQuery<CampaignSendingLimits>({
    queryKey: ['campaign-sending-limits'],
    queryFn: campaignsApi.getSendingLimits,
  });

  const sendMutation = useMutation({
    mutationFn: campaignsApi.create,
    onSuccess: () => router.push('/dashboard/campaigns'),
  });

  const applyQuickRuleMutation = useMutation({
    mutationFn: async () => {
      const kw = quickRuleKeyword.trim();
      if (!kw) throw new Error('Enter a keyword or phrase');
      if (!quickRuleCategoryName) throw new Error('Select a category');
      const canonical = getCanonicalRoutingRuleForCategory(routingRules as any[], quickRuleCategoryName);
      if (!canonical) throw new Error('Could not find a rule for this category.');
      if (!canonical.templateId) {
        throw new Error(
          'No template is linked to this category yet. On Routing Rules, assign a template to at least one rule in this category.',
        );
      }
      const prevKeywords = canonical.keywords ?? [];
      const prevExact = canonical.exactPhrases ?? [];
      const addKeywords = quickRuleMatch === 'contains' ? parseRoutingKeywords(kw) : [];
      const addExact = quickRuleMatch === 'exact' ? [kw] : [];
      await routingRulesApi.update(canonical.id, {
        keywords: mergeUniqueTokens(prevKeywords, addKeywords),
        exactPhrases: mergeUniqueTokens(prevExact, addExact),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['routing-rules'] });
      setQuickRuleDialogOpen(false);
      setRoutingPreviewDone(false);
      await runRoutingPreview();
    },
  });

  const createCustomMutation = useMutation({
    mutationFn: async (data: EmailEditorValue) => {
      const payload = {
        name: data.name,
        subject: data.subject,
        bodyHtml: data.bodyHtml || bodyTextToHtml(data.bodyText),
        bodyText: data.bodyText,
        categoryId: data.categoryId || undefined,
        maleSubject: data.maleSubject || undefined,
        maleBodyHtml: data.maleBodyHtml || (data.maleBodyText ? bodyTextToHtml(data.maleBodyText) : undefined),
        maleBodyText: data.maleBodyText || undefined,
        femaleSubject: data.femaleSubject || undefined,
        femaleBodyHtml: data.femaleBodyHtml || (data.femaleBodyText ? bodyTextToHtml(data.femaleBodyText) : undefined),
        femaleBodyText: data.femaleBodyText || undefined,
      };
      const saved = await templatesApi.create(payload);
      if (data.pendingFiles?.length) {
        await templatesApi.uploadAttachments(saved.id, data.pendingFiles!);
      }
      return saved;
    },
    onSuccess: (saved: any) => {
      queryClient.invalidateQueries({ queryKey: ['templates-campaign'] });
      setSelectedTemplateId(saved.id);
      setShowCustomDialog(false);
      setCustomBaseId('');
      setCustomForm(emptyCustomForm);
    },
  });

  const contacts = contactsData?.data || [];
  const contactsTotal = contactsData?.total ?? 0;
  const contactsTotalPages = contactsData?.totalPages ?? 1;

  const selectAllMatchingMutation = useMutation({
    mutationFn: () => contactsApi.getFilteredIds(recipientFilterParamsBulk),
    onSuccess: (res) => {
      setSelectedIds(new Set(res.ids));
    },
  });

  const visibleRecipientIds = useMemo(() => contacts.map((c: any) => c.id as string), [contacts]);

  const allRecipientsVisibleSelected =
    visibleRecipientIds.length > 0 && visibleRecipientIds.every((id: string) => selectedIds.has(id));
  const someRecipientsVisibleSelected =
    visibleRecipientIds.some((id: string) => selectedIds.has(id)) && !allRecipientsVisibleSelected;

  const toggleRecipientPageSelection = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allRecipientsVisibleSelected) {
        visibleRecipientIds.forEach((id: string) => next.delete(id));
      } else {
        visibleRecipientIds.forEach((id: string) => next.add(id));
      }
      return next;
    });
  }, [allRecipientsVisibleSelected, visibleRecipientIds]);

  const contactsAllMatchingSelected = contactsTotal > 0 && selectedIds.size === contactsTotal;

  const campaignName = useMemo(() => {
    const selectedContacts = [...selectedIds].map((id) => selectedById.get(id)).filter(Boolean);
    const companies = [...new Set(selectedContacts.map((c: any) => c.company).filter(Boolean))] as string[];
    if (companies.length === 1) return companies[0];
    if (companies.length > 1) return companies.slice(0, 2).join(', ') + (companies.length > 2 ? ` +${companies.length - 2}` : '');
    const pad = (n: number) => String(n).padStart(2, '0');
    const d = new Date();
    return `Campaign — ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }, [selectedIds, selectedById]);

  const STEPS = campaignMode === 'routing' ? ROUTING_STEPS : SINGLE_STEPS;

  // ── Gender detection ────────────────────────────────────────────────────────
  const runGenderDetection = useCallback(async () => {
    if (genderDetected || genderSkipped) return;
    const epoch = recipientSelectionEpochRef.current;
    setGenderDetecting(true);
    setGenderError(null);
    setGenderLimitReached(false);
    try {
      const contactIds = [...selectedIds];
      const res = await campaignsApi.detectGenders(contactIds);
      if (recipientSelectionEpochRef.current !== epoch) return;
      const results = res.results;
      const states: ContactGenderState[] = results.map((r) => {
        const contact = selectedById.get(String(r.contactId ?? '').trim());
        const g = parseBinaryGender(r.gender);
        return {
          contactId: r.contactId,
          email: (contact as any)?.email ?? '',
          firstName: r.firstName,
          linkedin: (contact as any)?.linkedin ?? null,
          detectedGender: g,
          probability: r.probability,
          autoAssigned: r.autoAssigned,
          assignedGender: r.autoAssigned && g ? g : null,
        };
      });
      setGenderStates(states);
      setGenderDetected(true);
      if (res.externalDetectionBlocked) {
        setGenderLimitReached(true);
        setGenderError(
          res.externalDetectionMessage ??
            'Gender detection limit reached — manual input is required for contacts not resolved locally.',
        );
      }
    } catch (e) {
      if (recipientSelectionEpochRef.current !== epoch) return;
      setGenderLimitReached(false);
      setGenderError(getDetectGendersErrorMessage(e));
      const states: ContactGenderState[] = [...selectedIds].map((id) => {
        const contact = selectedById.get(id);
        return {
          contactId: id,
          email: (contact as any)?.email ?? '',
          firstName: (contact as any)?.firstName ?? null,
          linkedin: (contact as any)?.linkedin ?? null,
          detectedGender: null,
          probability: 0,
          autoAssigned: false,
          assignedGender: null,
        };
      });
      setGenderStates(states);
      setGenderDetected(true);
    } finally {
      if (recipientSelectionEpochRef.current === epoch) {
        setGenderDetecting(false);
      }
    }
  }, [selectedIds, selectedById, genderDetected, genderSkipped]);

  useEffect(() => {
    if (step === 1 && !genderDetected && !genderSkipped && !genderDetecting) {
      runGenderDetection();
    }
  }, [step, genderDetected, genderSkipped, genderDetecting, runGenderDetection]);

  // ── Routing preview ──────────────────────────────────────────────────────────
  const runRoutingPreview = useCallback(async () => {
    const epoch = recipientSelectionEpochRef.current;
    setRoutingLoading(true);
    try {
      const assignments: RoutingAssignment[] = await routingRulesApi.previewRouting(
        [...selectedIds],
        fallbackTemplateId || undefined,
      );
      if (recipientSelectionEpochRef.current !== epoch) return;
      setRoutingAssignments(assignments);
      setRoutingPreviewDone(true);
    } finally {
      if (recipientSelectionEpochRef.current === epoch) {
        setRoutingLoading(false);
      }
    }
  }, [selectedIds, fallbackTemplateId]);

  useEffect(() => {
    if (step === 3 && campaignMode === 'routing' && !routingPreviewDone && !routingLoading) {
      runRoutingPreview();
    }
  }, [step, campaignMode, routingPreviewDone, routingLoading, runRoutingPreview]);

  useEffect(() => {
    setFirstNameOverrides((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (!selectedIds.has(k)) delete next[k];
      }
      return next;
    });
  }, [selectedIds]);

  /**
   * Recipient set is the source of truth. Changing it after visiting later steps leaves
   * genderDetected / routingPreviewDone etc. true with stale rows — reset derived state
   * whenever the selected id set changes (including after Back → edit selection → Next).
   */
  const prevRecipientSelectionKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevRecipientSelectionKeyRef.current === null) {
      prevRecipientSelectionKeyRef.current = selectedIdsKey;
      return;
    }
    if (prevRecipientSelectionKeyRef.current === selectedIdsKey) return;
    prevRecipientSelectionKeyRef.current = selectedIdsKey;
    recipientSelectionEpochRef.current += 1;

    setGenderStates([]);
    setGenderDetected(false);
    setGenderSkipped(false);
    setGenderDetecting(false);
    setGenderError(null);
    setGenderLimitReached(false);
    setRoutingAssignments([]);
    setRoutingPreviewDone(false);
    setRoutingLoading(false);
  }, [selectedIdsKey]);

  const setContactGender = (contactId: string, gender: 'male' | 'female') => {
    setGenderStates((prev) =>
      prev.map((s) => s.contactId === contactId ? { ...s, assignedGender: gender } : s),
    );
  };

  const setAssignmentTemplate = (contactId: string, templateId: string) => {
    const t = templates.find((t: any) => t.id === templateId);
    setRoutingAssignments((prev) =>
      prev.map((a) =>
        a.contactId === contactId
          ? { ...a, assignedTemplateId: templateId, assignedTemplateName: t?.name ?? null, routingSource: 'manual' }
          : a,
      ),
    );
  };

  const pendingGenderCount = genderStates.filter((s) => !s.assignedGender).length;
  const autoAssignedCount = genderStates.filter((s) => s.autoAssigned).length;
  const genderDetectionComplete = genderSkipped || (genderDetected && pendingGenderCount === 0);

  const unmatchedCount = routingAssignments.filter((a) => a.routingSource === 'unmatched').length;
  const routingComplete = routingPreviewDone && unmatchedCount === 0;

  // ── Contact selection ────────────────────────────────────────────────────────
  const toggleContact = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
  };

  const handleCustomBaseChange = (templateId: string) => {
    setCustomBaseId(templateId);
    if (!templateId) { setCustomForm(emptyCustomForm); return; }
    const t = templates.find((t: any) => t.id === templateId);
    if (t) {
      setCustomForm({
        name: `Custom: ${t.name}`,
        categoryId: t.categoryId || '',
        subject: t.subject,
        bodyText: htmlToBodyText(t.bodyHtml),
        bodyHtml: t.bodyHtml,
        maleSubject: t.maleSubject || '',
        maleBodyText: t.maleBodyHtml ? htmlToBodyText(t.maleBodyHtml) : '',
        maleBodyHtml: t.maleBodyHtml || '',
        femaleSubject: t.femaleSubject || '',
        femaleBodyText: t.femaleBodyHtml ? htmlToBodyText(t.femaleBodyHtml) : '',
        femaleBodyHtml: t.femaleBodyHtml || '',
        attachments: [],
        pendingFiles: [],
      });
    }
  };

  const selectedTemplate = templates.find((t: any) => t.id === selectedTemplateId);

  // ── Sending ──────────────────────────────────────────────────────────────────
  const buildContactVariableOverrides = (): Record<string, Record<string, string>> => {
    const out: Record<string, Record<string, string>> = {};
    for (const id of selectedIds) {
      const c = selectedById.get(id);
      if (!c) continue;
      const orig = c.firstName ?? '';
      const edited = firstNameOverrides[id];
      if (edited !== undefined && edited !== orig) {
        out[id] = { first_name: edited };
      }
    }
    return out;
  };

  const handleSend = () => {
    const contactGenders: Record<string, 'male' | 'female'> = {};
    if (!genderSkipped) {
      for (const s of genderStates) {
        if (s.assignedGender) contactGenders[s.contactId] = s.assignedGender;
      }
    }

    const contactVariableOverrides = buildContactVariableOverrides();
    const overridePayload = Object.keys(contactVariableOverrides).length
      ? { contactVariableOverrides }
      : {};

    if (campaignMode === 'routing') {
      sendMutation.mutate({
        name: campaignName,
        templateId: fallbackTemplateId || undefined,
        contactIds: [...selectedIds],
        scheduledAt: scheduledAt || undefined,
        timezone,
        contactGenders,
        contactTemplateAssignments: routingAssignments
          .filter((a) => a.assignedTemplateId)
          .map((a) => ({
            contactId: a.contactId,
            templateId: a.assignedTemplateId!,
            routingSource: a.routingSource,
          })),
        ...overridePayload,
      });
    } else {
      sendMutation.mutate({
        name: campaignName,
        templateId: selectedTemplateId,
        contactIds: [...selectedIds],
        scheduledAt: scheduledAt || undefined,
        timezone,
        contactGenders,
        ...overridePayload,
      });
    }
  };

  const overRecipientLimit =
    !!sendingLimits && selectedIds.size > sendingLimits.maxRecipientsPerCampaign;

  const canProceed = [
    selectedIds.size > 0 && !overRecipientLimit,
    genderDetectionComplete,
    true,
    campaignMode === 'routing'
      ? routingComplete
      : !!selectedTemplateId,
    true,
  ];

  const maleCount = genderStates.filter((s) => s.assignedGender === 'male').length;
  const femaleCount = genderStates.filter((s) => s.assignedGender === 'female').length;
  const unknownCount = genderSkipped
    ? selectedIds.size
    : genderStates.filter((s) => !s.assignedGender).length;

  const personalizationOverrideCount = useMemo(() => {
    let n = 0;
    for (const id of selectedIds) {
      const c = selectedById.get(id);
      if (!c) continue;
      const o = firstNameOverrides[id];
      if (o !== undefined && o !== (c.firstName ?? '')) n++;
    }
    return n;
  }, [selectedIds, selectedById, firstNameOverrides]);

  const genderStateById = useMemo(() => {
    const m = new Map<string, ContactGenderState>();
    for (const s of genderStates) {
      const k = String(s.contactId ?? '').trim();
      if (k) m.set(k, s);
    }
    return m;
  }, [genderStates]);

  // Routing summary for review
  const routingByTemplate = routingAssignments.reduce<Record<string, { name: string; count: number; category: string | null }>>((acc, a) => {
    const key = a.assignedTemplateId ?? '__unmatched__';
    if (!acc[key]) acc[key] = { name: a.assignedTemplateName ?? 'No template', count: 0, category: a.matchedCategory };
    acc[key].count++;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Campaign"
        description="Send personalised outreach emails to your selected contacts"
      />

      {/* Mode selector (shown only on step 0) */}
      {step === 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            onClick={() => setCampaignMode('routing')}
            className={cn(
              'flex items-start gap-3 rounded-xl border p-4 text-left transition-all hover:shadow-sm',
              campaignMode === 'routing' ? 'border-primary bg-primary/5' : 'hover:border-primary/40',
            )}
          >
            <div className={cn('rounded-lg p-2 shrink-0', campaignMode === 'routing' ? 'bg-primary/10' : 'bg-muted')}>
              <GitBranch className={cn('h-5 w-5', campaignMode === 'routing' ? 'text-primary' : 'text-muted-foreground')} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">Smart Routing</p>
                {campaignMode === 'routing' && <CheckCircle2 className="h-4 w-4 text-primary" />}
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Recommended</span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Automatically assign different templates to different contacts based on their job title.
                Great when your list has a mix of executives, technical people, and HR.
              </p>
            </div>
          </button>

          <button
            onClick={() => setCampaignMode('single')}
            className={cn(
              'flex items-start gap-3 rounded-xl border p-4 text-left transition-all hover:shadow-sm',
              campaignMode === 'single' ? 'border-primary bg-primary/5' : 'hover:border-primary/40',
            )}
          >
            <div className={cn('rounded-lg p-2 shrink-0', campaignMode === 'single' ? 'bg-primary/10' : 'bg-muted')}>
              <FileText className={cn('h-5 w-5', campaignMode === 'single' ? 'text-primary' : 'text-muted-foreground')} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">Single Template</p>
                {campaignMode === 'single' && <CheckCircle2 className="h-4 w-4 text-primary" />}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Everyone in this campaign gets the same template (with optional male/female variants).
              </p>
            </div>
          </button>
        </div>
      )}

      {/* Step indicator */}
      <div className="flex items-center gap-2 flex-wrap">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors',
                i < step ? 'bg-green-500 text-white'
                  : i === step ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {i < step ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </div>
            <span className={cn('text-sm font-medium', i === step ? 'text-foreground' : 'text-muted-foreground')}>
              {s}
            </span>
            {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        ))}
        {selectedIds.size > 0 && (
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              <span className="font-semibold text-foreground">{selectedIds.size}</span>
              recipient{selectedIds.size !== 1 ? 's' : ''} selected
            </div>
            {sendingLimits && (
              <span
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs font-medium',
                  overRecipientLimit ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-border bg-muted/30 text-muted-foreground',
                )}
              >
                Max {sendingLimits.maxRecipientsPerCampaign} / campaign
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── STEP 0: Recipients ─────────────────────────────────────────────── */}
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Select Recipients
              {selectedIds.size > 0 && (
                <span className="ml-auto rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
                  {selectedIds.size} selected
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {sendingLimits && (
              <div className="rounded-lg border border-border/80 bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Sending policy (UTC day)</p>
                <p className="mt-1">
                  Up to <span className="font-semibold text-foreground">{sendingLimits.maxRecipientsPerCampaign}</span> recipients per
                  campaign,{' '}
                  <span className="font-semibold text-foreground">{sendingLimits.maxEmailsPerDay}</span> emails per day /{' '}
                  <span className="font-semibold text-foreground">{sendingLimits.maxEmailsPerHour}</span> per hour (UTC). Today:{' '}
                  <span className="font-semibold text-foreground">{sendingLimits.sentTodayUtc}</span> sent,{' '}
                  <span className="font-semibold text-foreground">{sendingLimits.pendingScheduledTodayUtc}</span> queued —{' '}
                  <span className="font-semibold text-foreground">{sendingLimits.remainingQuotaTodayUtc}</span> daily left. This hour:{' '}
                  <span className="font-semibold text-foreground">{sendingLimits.sentThisHourUtc}</span> sent,{' '}
                  <span className="font-semibold text-foreground">{sendingLimits.pendingScheduledThisHourUtc}</span> queued —{' '}
                  <span className="font-semibold text-foreground">{sendingLimits.remainingQuotaHourUtc}</span> hourly left.
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed">
                  Sends are staggered automatically (spacing based on hourly/minute caps) so messages do not leave all at once.
                </p>
              </div>
            )}
            {overRecipientLimit && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Too many recipients ({selectedIds.size}). Reduce to {sendingLimits?.maxRecipientsPerCampaign} or fewer, or ask an
                  admin to raise <code className="rounded bg-destructive/15 px-1">EMAIL_MAX_RECIPIENTS_PER_CAMPAIGN</code>.
                </span>
              </div>
            )}
            {priorOutreachSelectedIds.length > 0 && (
              <div
                role="status"
                className="flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm dark:bg-amber-500/15"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div>
                    <p className="font-medium text-foreground">
                      You have already contacted {priorOutreachSelectedIds.length}{' '}
                      {priorOutreachSelectedIds.length === 1 ? 'person' : 'people'} in your selection (sent, scheduled, or previous
                      replies).
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      This is only a reminder — you can continue with the campaign or remove them from the recipient list.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pl-6">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-amber-600/45 text-foreground hover:bg-amber-500/15"
                    onClick={removePriorOutreachFromSelection}
                  >
                    Remove {priorOutreachSelectedIds.length} from selection
                  </Button>
                </div>
              </div>
            )}
            <ContactsFiltersBar variant="plain" value={recipientFilters} onFiltersChange={handleRecipientFiltersChange} />

            {!contactsLoading && (
              <ContactsTableToolbar
                className="rounded-lg border border-border/80"
                total={contactsTotal}
                page={recipientPage}
                pageSize={recipientPageSize}
                totalPages={contactsTotalPages}
                visibleCount={contacts.length}
                loading={contactsLoading}
                selectedCount={selectedIds.size}
                allMatchingSelected={contactsAllMatchingSelected}
                entityLabel="recipients"
                onPageChange={setRecipientPage}
                onPageSizeChange={(n) => {
                  setRecipientPageSize(n);
                  setRecipientPage(1);
                }}
                onClearSelection={() => setSelectedIds(new Set())}
                onSelectAllMatching={() => selectAllMatchingMutation.mutate()}
                selectAllMatchingLoading={selectAllMatchingMutation.isPending}
              />
            )}

            {contactsLoading && (
              <p className="text-sm text-muted-foreground">Loading contacts…</p>
            )}

            <div className="max-h-[400px] overflow-y-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b bg-muted/80 backdrop-blur-sm">
                  <tr>
                    <th className="p-3" title="Applies only to rows on this page">
                      <Checkbox
                        checked={
                          allRecipientsVisibleSelected
                            ? true
                            : someRecipientsVisibleSelected
                              ? 'indeterminate'
                              : false
                        }
                        onCheckedChange={toggleRecipientPageSelection}
                        disabled={contactsLoading || contacts.length === 0}
                      />
                    </th>
                    <th className="p-3 text-left font-medium text-muted-foreground">Email</th>
                    <th className="p-3 text-left font-medium text-muted-foreground">Name</th>
                    <th className="p-3 text-left font-medium text-muted-foreground">Company</th>
                    <th className="p-3 text-left font-medium text-muted-foreground">Job title</th>
                    <th className="p-3 text-left font-medium text-muted-foreground">Email status</th>
                    <th className="p-3 text-left font-medium text-muted-foreground">Verification</th>
                    <th className="p-3 text-left font-medium text-muted-foreground">Tags</th>
                    <th className="p-3 text-center font-medium text-muted-foreground">LinkedIn</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {contactsLoading ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-muted-foreground">
                        <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
                      </td>
                    </tr>
                  ) : (
                    contacts.map((c: any) => {
                      const rowPriorOutreach =
                        selectedIds.has(c.id) && contactHasPriorOutreach(c.emailStatus);
                      return (
                      <tr
                        key={c.id}
                        className={cn(
                          'cursor-pointer transition-colors hover:bg-muted/30',
                          rowPriorOutreach
                            ? 'border-l-4 border-amber-500 bg-amber-500/[0.07]'
                            : selectedIds.has(c.id) && 'bg-primary/5',
                        )}
                        onClick={() => toggleContact(c.id)}
                      >
                        <td className="p-3">
                          <Checkbox checked={selectedIds.has(c.id)} onCheckedChange={() => toggleContact(c.id)} />
                        </td>
                        <td className="p-3 font-medium">{c.email}</td>
                        <td className="p-3 text-muted-foreground">
                          {[c.firstName, c.lastName].filter(Boolean).join(' ') || '—'}
                        </td>
                        <td className="p-3 text-muted-foreground">{c.company || '—'}</td>
                        <td className="p-3 text-muted-foreground">{c.jobTitle || '—'}</td>
                        <td className="p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <ContactEmailStatusLabel emailStatus={c.emailStatus} />
                            {rowPriorOutreach && (
                              <span className="rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                                Prior outreach
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          {c.verificationStatus ? (
                            <StatusBadge status={c.verificationStatus} />
                          ) : c.isValid ? (
                            <span className="text-xs text-green-600">✓ valid</span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-red-500" title={c.validationErrors?.join(', ')}>
                              <AlertCircle className="h-3 w-3" /> invalid
                            </span>
                          )}
                        </td>
                        <td className="max-w-[120px] p-3 text-xs text-muted-foreground">
                          {Array.isArray(c.tags) && c.tags.length ? (
                            <span className="line-clamp-2" title={c.tags.join(', ')}>
                              {c.tags.join(', ')}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {c.linkedin ? (
                            <a
                              href={c.linkedin}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex justify-center text-[#0077b5] hover:underline"
                              title={c.linkedin}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Linkedin className="h-4 w-4" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                    })
                  )}
                  {!contactsLoading && contacts.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-muted-foreground">
                        No contacts match your filters
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

          </CardContent>
        </Card>
      )}

      {/* ── STEP 1: Gender Detection ────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="flex items-center gap-1">
                  <GenderMale className="h-4 w-4 text-blue-500" />
                  <GenderFemale className="h-4 w-4 text-pink-500" />
                </span>
                Gender Detection
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {genderDetecting && (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm font-medium">Detecting genders via genderize.io…</p>
                  <p className="text-xs">Analysing {selectedIds.size} contacts by first name</p>
                  <p className="text-xs text-center max-w-sm text-muted-foreground/90">
                    If the provider rate-limits or is unavailable, this step will stop shortly and you can assign genders manually.
                  </p>
                </div>
              )}

              {genderError && (
                <div
                  className={cn(
                    'flex items-start gap-2 rounded-lg border p-3 text-sm',
                    genderLimitReached
                      ? 'border-amber-300 bg-amber-50 text-amber-950'
                      : 'border-yellow-200 bg-yellow-50 text-yellow-800',
                  )}
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="space-y-1">
                    {genderLimitReached && (
                      <p className="font-semibold text-amber-900">Automatic detection stopped (API limit)</p>
                    )}
                    <p>{genderError}</p>
                    {genderLimitReached && (
                      <p className="text-xs text-amber-900/80">
                        Manual gender selection is required below for contacts without a confident auto-assignment. You can continue the campaign once each contact has a gender or you skip this step.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {genderDetected && !genderSkipped && (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl border bg-green-50 p-3 text-center">
                      <p className="text-xl font-bold text-green-700">{autoAssignedCount}</p>
                      <p className="text-xs text-green-600 mt-0.5">Auto-assigned</p>
                      <p className="text-xs text-muted-foreground">confidence &gt;75%</p>
                    </div>
                    <div className="rounded-xl border bg-yellow-50 p-3 text-center">
                      <p className="text-xl font-bold text-yellow-700">{pendingGenderCount}</p>
                      <p className="text-xs text-yellow-600 mt-0.5">Need your input</p>
                      <p className="text-xs text-muted-foreground">confidence ≤75%</p>
                    </div>
                    <div className="rounded-xl border bg-muted/40 p-3 text-center">
                      <p className="text-xl font-bold">{genderStates.length}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Total contacts</p>
                    </div>
                  </div>

                  {pendingGenderCount > 0 && (
                    <div>
                      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-yellow-700">
                        <HelpCircle className="h-4 w-4" />
                        Contacts needing manual gender assignment ({pendingGenderCount})
                      </h4>
                      <div className="overflow-hidden rounded-lg border">
                        <table className="w-full text-sm">
                          <thead className="border-b bg-muted/50">
                            <tr>
                              <th className="p-3 text-left font-medium text-muted-foreground">Contact</th>
                              <th className="p-3 text-left font-medium text-muted-foreground">Detected</th>
                              <th className="p-3 text-left font-medium text-muted-foreground">Assign</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {genderStates.filter((s) => !s.assignedGender).map((s) => (
                              <tr key={s.contactId} className="bg-yellow-50/30">
                                <td className="p-3">
                                  <p className="font-medium">{s.firstName || '(no name)'}</p>
                                  <p className="text-xs text-muted-foreground">{s.email}</p>
                                  {s.linkedin && (
                                    <a href={s.linkedin} target="_blank" rel="noopener noreferrer"
                                      className="mt-0.5 inline-flex items-center gap-1 text-xs text-[#0077b5] hover:underline"
                                      onClick={(e) => e.stopPropagation()}>
                                      <Linkedin className="h-3 w-3" /> LinkedIn
                                    </a>
                                  )}
                                </td>
                                <td className="p-3">
                                  {s.detectedGender ? (
                                    <div className="flex items-center gap-1.5">
                                      {s.detectedGender === 'male'
                                        ? <GenderMale className="h-3.5 w-3.5 text-blue-500" />
                                        : <GenderFemale className="h-3.5 w-3.5 text-pink-500" />}
                                      <span className="capitalize text-xs">{s.detectedGender}</span>
                                      {confidenceBadge(s.probability)}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-muted-foreground italic">
                                      {s.firstName
                                        ? genderLimitReached
                                          ? 'Not detected (limit) — choose manually'
                                          : 'Not found'
                                        : 'No first name'}
                                    </span>
                                  )}
                                </td>
                                <td className="p-3">
                                  <div className="flex gap-1.5">
                                    <button type="button" onClick={() => setContactGender(s.contactId, 'male')}
                                      className="flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100">
                                      <GenderMale className="h-3 w-3" /> Male
                                    </button>
                                    <button type="button" onClick={() => setContactGender(s.contactId, 'female')}
                                      className="flex items-center gap-1 rounded-lg border border-pink-200 bg-pink-50 px-2.5 py-1.5 text-xs font-medium text-pink-700 transition-colors hover:bg-pink-100">
                                      <GenderFemale className="h-3 w-3" /> Female
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {autoAssignedCount > 0 && (
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm font-medium hover:bg-muted/50">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        {autoAssignedCount} contacts auto-assigned
                        <ChevronRight className="ml-auto h-4 w-4 transition-transform group-open:rotate-90" />
                      </summary>
                      <div className="mt-2 overflow-hidden rounded-lg border">
                        <table className="w-full text-sm">
                          <thead className="border-b bg-muted/50">
                            <tr>
                              <th className="p-3 text-left font-medium text-muted-foreground">Contact</th>
                              <th className="p-3 text-left font-medium text-muted-foreground">Gender</th>
                              <th className="p-3 text-left font-medium text-muted-foreground">Confidence</th>
                              <th className="p-3 text-left font-medium text-muted-foreground">Change</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {genderStates.filter((s) => s.autoAssigned).map((s) => (
                              <tr key={s.contactId}>
                                <td className="p-3">
                                  <p className="font-medium">{s.firstName || '—'}</p>
                                  <p className="text-xs text-muted-foreground">{s.email}</p>
                                </td>
                                <td className="p-3">
                                  <div className="flex items-center gap-1.5">
                                    {s.assignedGender === 'male'
                                      ? <GenderMale className="h-3.5 w-3.5 text-blue-500" />
                                      : <GenderFemale className="h-3.5 w-3.5 text-pink-500" />}
                                    <span className="capitalize text-xs font-medium">{s.assignedGender}</span>
                                  </div>
                                </td>
                                <td className="p-3">{confidenceBadge(s.probability)}</td>
                                <td className="p-3">
                                  <div className="flex gap-1">
                                    {(['male', 'female'] as const).map((g) => (
                                      <button key={g} type="button" onClick={() => setContactGender(s.contactId, g)}
                                        className={cn(
                                          'rounded px-2 py-0.5 text-xs font-medium transition-colors',
                                          s.assignedGender === g
                                            ? g === 'male' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'
                                            : 'bg-muted text-muted-foreground hover:bg-muted/80',
                                        )}>
                                        {g === 'male' ? '♂' : '♀'}
                                      </button>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  )}
                </>
              )}

              {genderSkipped && (
                <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                  <SkipForward className="h-4 w-4" />
                  Gender detection skipped — all contacts will receive the default template version.
                  <button type="button" className="ml-auto text-primary hover:underline"
                    onClick={() => {
                      setGenderSkipped(false);
                      setGenderDetected(false);
                      setGenderStates([]);
                      setGenderError(null);
                      setGenderLimitReached(false);
                    }}>
                    Undo
                  </button>
                </div>
              )}
            </CardContent>
          </Card>

          {!genderSkipped && genderDetected && (
            <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
              <span>Want to use the default template for everyone?</span>
              <Button variant="ghost" size="sm" onClick={() => setGenderSkipped(true)}>
                <SkipForward className="mr-1.5 h-3.5 w-3.5" />
                Skip gender detection
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── STEP 2: Personalization ───────────────────────────────────────────── */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PenLine className="h-4 w-4" />
              Personalization
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Review company, gender (from the previous step), and how each name will appear in the email.
              You can adjust first names for this campaign only — contact records in your database are not updated.
              Open LinkedIn when you need to double-check someone before sending.
            </p>
            <div className="max-h-[min(420px,55vh)] overflow-x-auto overflow-y-auto rounded-lg border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="sticky top-0 z-[1] border-b bg-muted/80 backdrop-blur-sm">
                  <tr>
                    <th className="p-3 text-left font-medium text-muted-foreground">Contact</th>
                    <th className="p-3 text-left font-medium text-muted-foreground">Company</th>
                    <th className="p-3 text-left font-medium text-muted-foreground">Job title</th>
                    <th className="p-3 text-left font-medium text-muted-foreground">Gender</th>
                    <th className="p-3 text-left font-medium text-muted-foreground">LinkedIn</th>
                    <th className="p-3 text-left font-medium text-muted-foreground">First name (in email)</th>
                    <th className="p-3 text-left font-medium text-muted-foreground">Stored value</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {selectedContactsLoading && (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                        <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-primary" />
                        Loading selected contacts…
                      </td>
                    </tr>
                  )}
                  {!selectedContactsLoading &&
                    [...selectedIds].map((id) => {
                    const c = selectedById.get(id);
                    if (!c) return null;
                    const linkedinUrl = (c.linkedin as string | null | undefined)?.trim() || null;
                    const orig = c.firstName ?? '';
                    const val = firstNameOverrides[id] !== undefined ? firstNameOverrides[id]! : orig;
                    const changed = firstNameOverrides[id] !== undefined && firstNameOverrides[id] !== orig;
                    const displayName =
                      [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || '—';
                    const company = (c.company as string | null | undefined)?.trim() || null;
                    const jobTitle = (c.jobTitle as string | null | undefined)?.trim() || null;
                    return (
                      <tr key={id}>
                        <td className="p-3 align-top">
                          <p className="text-xs font-medium text-foreground">{displayName}</p>
                          <p className="mt-0.5 max-w-[220px] truncate text-[11px] text-muted-foreground" title={c.email}>
                            {c.email}
                          </p>
                        </td>
                        <td className="p-3 align-top">
                          <span
                            className="line-clamp-2 max-w-[160px] text-xs text-muted-foreground"
                            title={company ?? undefined}
                          >
                            {company ?? '—'}
                          </span>
                        </td>
                        <td className="p-3 align-top">
                          <span
                            className="line-clamp-2 max-w-[160px] text-xs text-muted-foreground"
                            title={jobTitle ?? undefined}
                          >
                            {jobTitle ?? '—'}
                          </span>
                        </td>
                        <td className="p-3 align-top w-[120px]">
                          <PersonalizationGenderSummary
                            state={genderStateById.get(String(id).trim())}
                            genderSkipped={genderSkipped}
                            contactStoredGender={c.gender as string | null | undefined}
                          />
                        </td>
                        <td className="p-3 align-top">
                          {linkedinUrl ? (
                            <a
                              href={linkedinUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex max-w-[min(140px,20vw)] items-center gap-1 truncate text-xs font-medium text-[#0077b5] hover:underline"
                              title={linkedinUrl}
                            >
                              <Linkedin className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">LinkedIn</span>
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3 min-w-[140px] align-top">
                          <Input
                            className="h-8 text-sm"
                            value={val}
                            onChange={(e) => {
                              const v = e.target.value;
                              setFirstNameOverrides((prev) => {
                                const next = { ...prev };
                                if (v === (c.firstName ?? '')) delete next[id];
                                else next[id] = v;
                                return next;
                              });
                            }}
                          />
                        </td>
                        <td className="p-3 align-top text-xs text-muted-foreground">
                          {changed ? (
                            <span className="line-through opacity-70">{orig || '—'}</span>
                          ) : (
                            <span>{orig || '—'}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!selectedContactsLoading && selectedIds.size > 0 && selectedById.size === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                        Could not load contact details. Go back and re-select recipients.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 3: Template Routing (routing mode) ─────────────────────────── */}
      {step === 3 && campaignMode === 'routing' && (
        <div className="space-y-5">
          {/* Fallback template + re-run */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <GitBranch className="h-4 w-4" />
                Template Routing
                {routingPreviewDone && (
                  <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs"
                    onClick={() => { setRoutingPreviewDone(false); runRoutingPreview(); }}>
                    <RefreshCw className="mr-1.5 h-3 w-3" /> Re-run routing
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Fallback template */}
              <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <div className="text-sm">
                    <p className="font-medium">Fallback template</p>
                    <p className="text-muted-foreground text-xs">
                      Used for contacts that don't match any routing rule. You can also assign them manually below.
                    </p>
                  </div>
                </div>
                <Select
                  value={fallbackTemplateId}
                  onValueChange={(v) => {
                    setFallbackTemplateId(v);
                    setRoutingPreviewDone(false);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select fallback template (optional)…" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t: any) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* No routing rules warning */}
              {(routingRules as any[]).length === 0 && (
                <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm">
                  <p className="font-medium text-yellow-800 mb-1">No routing rules configured</p>
                  <p className="text-yellow-700 mb-3">
                    You haven't set up any routing rules yet. Go to Routing Rules to define which job titles
                    map to which templates.
                  </p>
                  <Link href="/dashboard/routing-rules" target="_blank">
                    <Button variant="outline" size="sm">
                      <GitBranch className="mr-1.5 h-3.5 w-3.5" />
                      Manage Routing Rules
                    </Button>
                  </Link>
                </div>
              )}

              {/* Loading */}
              {routingLoading && (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm font-medium">Running routing rules…</p>
                  <p className="text-xs">Matching {selectedIds.size} contacts against your rules</p>
                </div>
              )}

              {/* Results */}
              {routingPreviewDone && !routingLoading && (
                <>
                  {/* Summary */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl border bg-green-50 p-3 text-center">
                      <p className="text-xl font-bold text-green-700">
                        {routingAssignments.filter((a) => a.routingSource === 'auto').length}
                      </p>
                      <p className="text-xs text-green-600 mt-0.5">Auto-matched</p>
                    </div>
                    <div className={cn('rounded-xl border p-3 text-center', unmatchedCount > 0 ? 'bg-yellow-50' : 'bg-muted/40')}>
                      <p className={cn('text-xl font-bold', unmatchedCount > 0 ? 'text-yellow-700' : 'text-muted-foreground')}>
                        {unmatchedCount}
                      </p>
                      <p className={cn('text-xs mt-0.5', unmatchedCount > 0 ? 'text-yellow-600' : 'text-muted-foreground')}>
                        Needs manual assignment
                      </p>
                    </div>
                    <div className="rounded-xl border bg-muted/40 p-3 text-center">
                      <p className="text-xl font-bold">{routingAssignments.length}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Total contacts</p>
                    </div>
                  </div>

                  {/* Unmatched contacts */}
                  {unmatchedCount > 0 && (
                    <div>
                      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-yellow-700">
                        <HelpCircle className="h-4 w-4" />
                        Contacts needing manual template assignment ({unmatchedCount})
                      </h4>
                      <div className="overflow-hidden rounded-lg border">
                        <table className="w-full text-sm">
                          <thead className="border-b bg-muted/50">
                            <tr>
                              <th className="p-3 text-left font-medium text-muted-foreground">Contact</th>
                              <th className="p-3 text-left font-medium text-muted-foreground">Job Title</th>
                              <th className="p-3 text-left font-medium text-muted-foreground">Assign Template</th>
                              <th className="p-3 text-left font-medium text-muted-foreground w-[120px]">Routing</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {routingAssignments.filter((a) => a.routingSource === 'unmatched').map((a) => (
                              <tr key={a.contactId} className="bg-yellow-50/30">
                                <td className="p-3">
                                  <p className="font-medium">{[a.firstName, a.lastName].filter(Boolean).join(' ') || '(no name)'}</p>
                                  <p className="text-xs text-muted-foreground">{a.email}</p>
                                </td>
                                <td className="p-3 text-xs text-muted-foreground">{a.jobTitle || '—'}</td>
                                <td className="p-3">
                                  <Select
                                    value={a.assignedTemplateId ?? ''}
                                    onValueChange={(v) => setAssignmentTemplate(a.contactId, v)}
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue placeholder="Pick template…" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {templates.map((t: any) => (
                                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="p-3">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs gap-1"
                                    disabled={templates.length === 0 || existingRoutingCategoryNames.length === 0}
                                    title={
                                      existingRoutingCategoryNames.length === 0
                                        ? 'Add at least one routing rule with a category on the Routing Rules page'
                                        : templates.length === 0
                                          ? 'Create a template first'
                                          : undefined
                                    }
                                    onClick={() => {
                                      const rules = routingRules as any[];
                                      let defaultCat = existingRoutingCategoryNames[0] || '';
                                      if (a.assignedTemplateId) {
                                        const match = rules.find((r) => r.templateId === a.assignedTemplateId);
                                        if (match?.categoryName && existingRoutingCategoryNames.includes(match.categoryName)) {
                                          defaultCat = match.categoryName;
                                        }
                                      }
                                      setQuickRuleKeyword(a.jobTitle?.trim() || '');
                                      setQuickRuleMatch('contains');
                                      setQuickRuleCategoryName(defaultCat);
                                      setQuickRuleDialogOpen(true);
                                    }}
                                  >
                                    <Wand2 className="h-3 w-3" />
                                    Add rule
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Auto-matched contacts */}
                  {routingAssignments.filter((a) => a.routingSource !== 'unmatched').length > 0 && (
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm font-medium hover:bg-muted/50">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        {routingAssignments.filter((a) => a.routingSource !== 'unmatched').length} contacts matched
                        <ChevronRight className="ml-auto h-4 w-4 transition-transform group-open:rotate-90" />
                      </summary>
                      <div className="mt-2 overflow-hidden rounded-lg border">
                        <table className="w-full text-sm">
                          <thead className="border-b bg-muted/50">
                            <tr>
                              <th className="p-3 text-left font-medium text-muted-foreground">Contact</th>
                              <th className="p-3 text-left font-medium text-muted-foreground">Job Title</th>
                              <th className="p-3 text-left font-medium text-muted-foreground">Category</th>
                              <th className="p-3 text-left font-medium text-muted-foreground">Assigned Template</th>
                              <th className="p-3 text-left font-medium text-muted-foreground">Override</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {routingAssignments.filter((a) => a.routingSource !== 'unmatched').map((a) => (
                              <tr key={a.contactId}>
                                <td className="p-3">
                                  <p className="font-medium">{[a.firstName, a.lastName].filter(Boolean).join(' ') || '—'}</p>
                                  <p className="text-xs text-muted-foreground">{a.email}</p>
                                </td>
                                <td className="p-3 text-xs text-muted-foreground">{a.jobTitle || '—'}</td>
                                <td className="p-3">
                                  {a.matchedCategory ? (
                                    <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-medium', getCategoryColor(a.matchedCategory))}>
                                      {a.matchedCategory}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground italic">Fallback</span>
                                  )}
                                </td>
                                <td className="p-3 text-xs font-medium">{a.assignedTemplateName || '—'}</td>
                                <td className="p-3">
                                  <Select
                                    value={a.assignedTemplateId ?? ''}
                                    onValueChange={(v) => setAssignmentTemplate(a.contactId, v)}
                                  >
                                    <SelectTrigger className="h-7 text-xs w-36">
                                      <SelectValue placeholder="Override…" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {templates.map((t: any) => (
                                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Scheduling */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="h-4 w-4" />
                When to send
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <button onClick={() => setScheduledAt('')}
                  className={cn('flex items-center gap-3 rounded-xl border p-3 text-left transition-all hover:shadow-sm',
                    !scheduledAt ? 'border-primary bg-primary/5' : 'hover:border-primary/40')}>
                  <div className={cn('rounded-lg p-1.5', !scheduledAt ? 'bg-primary/10' : 'bg-muted')}>
                    <Zap className={cn('h-4 w-4', !scheduledAt ? 'text-primary' : 'text-muted-foreground')} />
                  </div>
                  <div><p className="text-sm font-semibold">Send now</p><p className="text-xs text-muted-foreground">Immediately</p></div>
                </button>

                <button onClick={() => setScheduledAt(getNextValidBusinessSendTime(timezone))}
                  className={cn('flex items-center gap-3 rounded-xl border p-3 text-left transition-all hover:shadow-sm',
                    scheduledAt === nextBusinessSendAt ? 'border-primary bg-primary/5' : 'hover:border-primary/40')}>
                  <div className={cn('rounded-lg p-1.5', scheduledAt === nextBusinessSendAt ? 'bg-primary/10' : 'bg-muted')}>
                    <Clock className={cn('h-4 w-4', scheduledAt === nextBusinessSendAt ? 'text-primary' : 'text-muted-foreground')} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Next business time</p>
                    <p className="text-xs text-muted-foreground">Weekdays 8:30 AM</p>
                  </div>
                </button>

                <button onClick={() => { if (!scheduledAt || scheduledAt === nextBusinessSendAt) setScheduledAt(new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 16)); }}
                  className={cn('flex items-center gap-3 rounded-xl border p-3 text-left transition-all hover:shadow-sm',
                    scheduledAt && scheduledAt !== nextBusinessSendAt ? 'border-primary bg-primary/5' : 'hover:border-primary/40')}>
                  <div className={cn('rounded-lg p-1.5', scheduledAt && scheduledAt !== nextBusinessSendAt ? 'bg-primary/10' : 'bg-muted')}>
                    <Calendar className={cn('h-4 w-4', scheduledAt && scheduledAt !== nextBusinessSendAt ? 'text-primary' : 'text-muted-foreground')} />
                  </div>
                  <div><p className="text-sm font-semibold">Custom time</p><p className="text-xs text-muted-foreground">Pick date & time</p></div>
                </button>
              </div>

              {scheduledAt && (
                <div className="grid grid-cols-1 gap-3 rounded-xl border bg-muted/30 p-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Date & Time</Label>
                    <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)}
                      min={new Date().toISOString().slice(0, 16)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Timezone</Label>
                    <Select value={timezone} onValueChange={setTimezone}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── STEP 3: Template & Schedule (single mode) ───────────────────────── */}
      {step === 3 && campaignMode === 'single' && (
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Choose base template</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {templates.map((t: any) => {
                  const hasMale = !!(t.maleSubject || t.maleBodyHtml);
                  const hasFemale = !!(t.femaleSubject || t.femaleBodyHtml);
                  return (
                    <button key={t.id} onClick={() => handleTemplateSelect(t.id)}
                      className={cn('rounded-xl border p-3 text-left transition-all hover:shadow-sm',
                        selectedTemplateId === t.id ? 'border-primary bg-primary/5' : 'hover:border-primary/40')}>
                      <div className="flex items-start justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{t.name}</p>
                          {t.category && <p className="text-xs text-muted-foreground">{t.category.name}</p>}
                        </div>
                        {selectedTemplateId === t.id && <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-primary" />}
                      </div>
                      <p className="mt-1.5 truncate text-xs italic text-muted-foreground">"{t.subject}"</p>
                      {(hasMale || hasFemale) && (
                        <div className="mt-1.5 flex gap-1">
                          {hasMale && <span className="flex items-center gap-0.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600"><GenderMale className="h-2.5 w-2.5" /> Male</span>}
                          {hasFemale && <span className="flex items-center gap-0.5 rounded-full bg-pink-50 px-1.5 py-0.5 text-xs text-pink-600"><GenderFemale className="h-2.5 w-2.5" /> Female</span>}
                        </div>
                      )}
                    </button>
                  );
                })}

                <button onClick={() => setShowCustomDialog(true)}
                  className="rounded-xl border-2 border-dashed border-primary/30 p-3 text-left transition-all hover:border-primary/60 hover:bg-primary/5">
                  <div className="flex items-center gap-2 text-primary">
                    <Plus className="h-4 w-4" />
                    <p className="text-sm font-semibold">Create custom template</p>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Build a new template with male &amp; female versions
                  </p>
                </button>

                {templates.length === 0 && (
                  <p className="col-span-3 py-6 text-center text-sm text-muted-foreground">
                    No templates yet — use "Create custom template" above or add one in the Templates page.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Dialog open={showCustomDialog} onOpenChange={(open) => {
            if (!open) { setCustomBaseId(''); setCustomForm(emptyCustomForm); }
            setShowCustomDialog(open);
          }}>
            <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
              <DialogHeader className="shrink-0">
                <DialogTitle>Create Custom Template</DialogTitle>
              </DialogHeader>
              <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
                <div className="space-y-1.5">
                  <Label>Start from base template (optional)</Label>
                  <Select value={customBaseId} onValueChange={handleCustomBaseChange}>
                    <SelectTrigger><SelectValue placeholder="Start from scratch…" /></SelectTrigger>
                    <SelectContent>
                      {templates.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {customBaseId && <p className="text-xs text-muted-foreground">Content copied — original not modified.</p>}
                </div>
                <VisualEmailEditor value={customForm} onChange={setCustomForm}
                  categories={(categories as any[]) || []} showNameAndCategory allowPendingAttachments />
              </div>
              <DialogFooter className="shrink-0">
                <Button variant="outline" onClick={() => setShowCustomDialog(false)}>Cancel</Button>
                <Button onClick={() => createCustomMutation.mutate(customForm)}
                  disabled={createCustomMutation.isPending || !customForm.name.trim() || !customForm.subject.trim() || !customForm.bodyText.trim()}>
                  {createCustomMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create &amp; Select
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="h-4 w-4" />
                When to send
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <button onClick={() => setScheduledAt('')}
                  className={cn('flex items-center gap-3 rounded-xl border p-3 text-left transition-all hover:shadow-sm',
                    !scheduledAt ? 'border-primary bg-primary/5' : 'hover:border-primary/40')}>
                  <div className={cn('rounded-lg p-1.5', !scheduledAt ? 'bg-primary/10' : 'bg-muted')}>
                    <Zap className={cn('h-4 w-4', !scheduledAt ? 'text-primary' : 'text-muted-foreground')} />
                  </div>
                  <div><p className="text-sm font-semibold">Send now</p><p className="text-xs text-muted-foreground">Immediately</p></div>
                </button>

                <button onClick={() => setScheduledAt(getNextValidBusinessSendTime(timezone))}
                  className={cn('flex items-center gap-3 rounded-xl border p-3 text-left transition-all hover:shadow-sm',
                    scheduledAt === nextBusinessSendAt ? 'border-primary bg-primary/5' : 'hover:border-primary/40')}>
                  <div className={cn('rounded-lg p-1.5', scheduledAt === nextBusinessSendAt ? 'bg-primary/10' : 'bg-muted')}>
                    <Clock className={cn('h-4 w-4', scheduledAt === nextBusinessSendAt ? 'text-primary' : 'text-muted-foreground')} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Next business time</p>
                    <p className="text-xs text-muted-foreground">Weekdays 8:30 AM</p>
                  </div>
                </button>

                <button onClick={() => { if (!scheduledAt || scheduledAt === nextBusinessSendAt) setScheduledAt(new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 16)); }}
                  className={cn('flex items-center gap-3 rounded-xl border p-3 text-left transition-all hover:shadow-sm',
                    scheduledAt && scheduledAt !== nextBusinessSendAt ? 'border-primary bg-primary/5' : 'hover:border-primary/40')}>
                  <div className={cn('rounded-lg p-1.5', scheduledAt && scheduledAt !== nextBusinessSendAt ? 'bg-primary/10' : 'bg-muted')}>
                    <Calendar className={cn('h-4 w-4', scheduledAt && scheduledAt !== nextBusinessSendAt ? 'text-primary' : 'text-muted-foreground')} />
                  </div>
                  <div><p className="text-sm font-semibold">Custom time</p><p className="text-xs text-muted-foreground">Pick date & time</p></div>
                </button>
              </div>

              {scheduledAt && (
                <div className="grid grid-cols-1 gap-3 rounded-xl border bg-muted/30 p-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Date & Time</Label>
                    <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)}
                      min={new Date().toISOString().slice(0, 16)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Timezone</Label>
                    <Select value={timezone} onValueChange={setTimezone}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── STEP 4: Review ─────────────────────────────────────────────────── */}
      {step === 4 && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-6">
              <h3 className="mb-4 text-base font-semibold">Campaign Summary</h3>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between border-b pb-3">
                  <dt className="text-muted-foreground">Campaign name</dt>
                  <dd className="font-semibold">{campaignName}</dd>
                </div>
                <div className="flex justify-between border-b pb-3">
                  <dt className="text-muted-foreground">Mode</dt>
                  <dd className="flex items-center gap-1.5">
                    {campaignMode === 'routing'
                      ? <><GitBranch className="h-3.5 w-3.5 text-primary" /><span className="font-medium">Smart Routing</span></>
                      : <><FileText className="h-3.5 w-3.5" /><span className="font-medium">Single Template</span></>}
                  </dd>
                </div>
                <div className="flex justify-between border-b pb-3">
                  <dt className="text-muted-foreground">Recipients</dt>
                  <dd className="font-semibold">{selectedIds.size} contacts</dd>
                </div>
                {personalizationOverrideCount > 0 && (
                  <div className="flex justify-between border-b pb-3">
                    <dt className="text-muted-foreground">First name overrides</dt>
                    <dd className="font-medium text-amber-700">
                      {personalizationOverrideCount} contact{personalizationOverrideCount !== 1 ? 's' : ''} (send only)
                    </dd>
                  </div>
                )}
                {!genderSkipped && (maleCount > 0 || femaleCount > 0) ? (
                  <div className="flex justify-between border-b pb-3">
                    <dt className="text-muted-foreground">Gender split</dt>
                    <dd className="flex items-center gap-2">
                      {maleCount > 0 && <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700"><GenderMale className="h-3 w-3" /> {maleCount} male</span>}
                      {femaleCount > 0 && <span className="flex items-center gap-1 rounded-full bg-pink-50 px-2 py-0.5 text-xs text-pink-700"><GenderFemale className="h-3 w-3" /> {femaleCount} female</span>}
                      {unknownCount > 0 && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{unknownCount} default</span>}
                    </dd>
                  </div>
                ) : genderSkipped ? (
                  <div className="flex justify-between border-b pb-3">
                    <dt className="text-muted-foreground">Gender variants</dt>
                    <dd className="text-muted-foreground text-xs italic">Skipped — default version for all</dd>
                  </div>
                ) : null}

                {campaignMode === 'routing' ? (
                  <>
                    <div className="border-b pb-3">
                      <dt className="text-muted-foreground mb-2">Template assignment breakdown</dt>
                      <dd className="space-y-1.5">
                        {Object.entries(routingByTemplate).map(([key, val]) => (
                          <div key={key} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                            <div className="flex items-center gap-2">
                              {val.category && (
                                <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', getCategoryColor(val.category))}>
                                  {val.category}
                                </span>
                              )}
                              <span className="text-xs font-medium">{val.name}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">{val.count} contact{val.count !== 1 ? 's' : ''}</span>
                          </div>
                        ))}
                      </dd>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between border-b pb-3">
                      <dt className="text-muted-foreground">Template</dt>
                      <dd className="font-semibold">{selectedTemplate?.name}</dd>
                    </div>
                    <div className="flex justify-between border-b pb-3">
                      <dt className="text-muted-foreground">Default subject</dt>
                      <dd className="max-w-xs truncate font-medium italic">"{selectedTemplate?.subject}"</dd>
                    </div>
                  </>
                )}

                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Send time</dt>
                  <dd className="font-semibold">
                    {scheduledAt
                      ? `${new Date(scheduledAt).toLocaleString('en-GB')} (${timezone})`
                      : <span className="text-green-600">Immediately</span>}
                  </dd>
                </div>
              </dl>
              {sendingLimits && (
                <div className="mt-4 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">Staggered delivery</p>
                  <p className="mt-1">
                    First message goes at the time above; additional messages follow with automatic spacing (~
                    {Math.round((sendingLimits.minStaggerIntervalMs ?? 0) / 1000)}s minimum between sends, plus jitter) so your
                    account does not fire hundreds of emails in the same instant. Daily total across campaigns is capped at{' '}
                    {sendingLimits.maxEmailsPerDay} (UTC).
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {sendMutation.isError && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {formatCampaignCreateError(sendMutation.error)}
            </div>
          )}
        </div>
      )}

      <Dialog open={quickRuleDialogOpen} onOpenChange={(o) => { if (!o) setQuickRuleDialogOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add to existing category</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              Merges the keyword into your existing routing rule for that category (same template, no duplicate category rows). Matching re-runs for this campaign.
            </p>
            <div className="space-y-1.5">
              <Label>Match type</Label>
              <Select value={quickRuleMatch} onValueChange={(v) => setQuickRuleMatch(v as 'contains' | 'exact')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contains">Partial — title contains keyword(s)</SelectItem>
                  <SelectItem value="exact">Exact — full job title</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Keyword or phrase</Label>
              <Input
                value={quickRuleKeyword}
                onChange={(e) => setQuickRuleKeyword(e.target.value)}
                placeholder={quickRuleMatch === 'contains' ? 'e.g. Manager or VP, Director' : 'e.g. Department Manager'}
              />
              <p className="text-[11px] text-muted-foreground">
                {quickRuleMatch === 'contains'
                  ? 'Comma-separated tokens match if the title contains any of them.'
                  : 'The whole title must match this phrase (ignoring case).'}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={quickRuleCategoryName || undefined} onValueChange={setQuickRuleCategoryName}>
                <SelectTrigger><SelectValue placeholder="Choose a category" /></SelectTrigger>
                <SelectContent>
                  {existingRoutingCategoryNames.map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Only categories you already use in Routing Rules appear here.
              </p>
            </div>
            {quickRuleCategoryName && (
              <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Template for this category</p>
                {quickRuleResolvedTemplateName ? (
                  <p className="font-medium mt-0.5">{quickRuleResolvedTemplateName}</p>
                ) : (
                  <p className="text-xs text-amber-700 mt-0.5">
                    No template found on existing rules in this category. Assign a template on the Routing Rules page first.
                  </p>
                )}
              </div>
            )}
            {applyQuickRuleMutation.isError && (
              <p className="text-xs text-destructive">
                {(applyQuickRuleMutation.error as Error)?.message || 'Could not save rule'}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setQuickRuleDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => applyQuickRuleMutation.mutate()}
              disabled={
                applyQuickRuleMutation.isPending
                || !quickRuleKeyword.trim()
                || !quickRuleCategoryName
                || !quickRuleResolvedTemplateId
              }
            >
              {applyQuickRuleMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save &amp; apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canProceed[step]}>
            Next
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={handleSend}
            disabled={sendMutation.isPending || overRecipientLimit}
            size="lg"
            title={overRecipientLimit ? 'Reduce recipients to stay within the per-campaign limit' : undefined}
          >
            {sendMutation.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</>
            ) : scheduledAt ? (
              <><Calendar className="mr-2 h-4 w-4" />Schedule Campaign</>
            ) : (
              <><Send className="mr-2 h-4 w-4" />Send Now</>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
