'use client';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { contactsApi, templatesApi, campaignsApi, routingRulesApi } from '@/lib/api';
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
  Search, CheckCircle2, AlertCircle, Briefcase, Clock, Zap, Tag,
  HelpCircle, SkipForward, Linkedin, Plus, GitBranch,
  FileText, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

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
function getNextBusinessDay(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  d.setHours(8, 30, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T08:30`;
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

const SINGLE_STEPS = ['Recipients', 'Gender Detection', 'Template & Schedule', 'Review'];
const ROUTING_STEPS = ['Recipients', 'Gender Detection', 'Template Routing', 'Review'];

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
  const [search, setSearch] = useState('');
  const [jobTitleFilter, setJobTitleFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');

  // Step 1 — Gender Detection
  const [genderStates, setGenderStates] = useState<ContactGenderState[]>([]);
  const [genderDetecting, setGenderDetecting] = useState(false);
  const [genderDetected, setGenderDetected] = useState(false);
  const [genderSkipped, setGenderSkipped] = useState(false);
  const [genderError, setGenderError] = useState<string | null>(null);

  // Step 2 — Template & Schedule (single mode) / Routing (routing mode)
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');

  // Routing mode state
  const [routingAssignments, setRoutingAssignments] = useState<RoutingAssignment[]>([]);
  const [routingPreviewDone, setRoutingPreviewDone] = useState(false);
  const [routingLoading, setRoutingLoading] = useState(false);
  const [fallbackTemplateId, setFallbackTemplateId] = useState('');

  // Custom template dialog
  const [showCustomDialog, setShowCustomDialog] = useState(false);
  const [customBaseId, setCustomBaseId] = useState('');
  const [customForm, setCustomForm] = useState<EmailEditorValue>(emptyCustomForm);

  const { data: contactsData } = useQuery({
    queryKey: ['contacts-campaign', { search, jobTitleFilter, companyFilter }],
    queryFn: () => contactsApi.getAll({ search, jobTitle: jobTitleFilter, company: companyFilter, limit: 100 }),
  });

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

  const sendMutation = useMutation({
    mutationFn: campaignsApi.create,
    onSuccess: () => router.push('/dashboard/campaigns'),
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

  const campaignName = useMemo(() => {
    const selectedContacts = contacts.filter((c: any) => selectedIds.has(c.id));
    const companies = [...new Set(selectedContacts.map((c: any) => c.company).filter(Boolean))] as string[];
    if (companies.length === 1) return companies[0];
    if (companies.length > 1) return companies.slice(0, 2).join(', ') + (companies.length > 2 ? ` +${companies.length - 2}` : '');
    const pad = (n: number) => String(n).padStart(2, '0');
    const d = new Date();
    return `Campaign — ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }, [contacts, selectedIds]);

  const STEPS = campaignMode === 'routing' ? ROUTING_STEPS : SINGLE_STEPS;

  // ── Gender detection ────────────────────────────────────────────────────────
  const runGenderDetection = useCallback(async () => {
    if (genderDetected || genderSkipped) return;
    setGenderDetecting(true);
    setGenderError(null);
    try {
      const contactIds = [...selectedIds];
      const results: any[] = await campaignsApi.detectGenders(contactIds);
      const contactMap = new Map(contacts.map((c: any) => [c.id, c]));
      const states: ContactGenderState[] = results.map((r) => {
        const contact = contactMap.get(r.contactId);
        return {
          contactId: r.contactId,
          email: (contact as any)?.email ?? '',
          firstName: r.firstName,
          linkedin: (contact as any)?.linkedin ?? null,
          detectedGender: r.gender,
          probability: r.probability,
          autoAssigned: r.autoAssigned,
          assignedGender: r.autoAssigned ? r.gender : null,
        };
      });
      setGenderStates(states);
      setGenderDetected(true);
    } catch {
      setGenderError('Could not reach the gender detection service. Please assign genders manually or skip.');
      const states: ContactGenderState[] = [...selectedIds].map((id) => {
        const contact = contacts.find((c: any) => c.id === id);
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
      setGenderDetecting(false);
    }
  }, [selectedIds, contacts, genderDetected, genderSkipped]);

  useEffect(() => {
    if (step === 1 && !genderDetected && !genderSkipped && !genderDetecting) {
      runGenderDetection();
    }
  }, [step, genderDetected, genderSkipped, genderDetecting, runGenderDetection]);

  // ── Routing preview ──────────────────────────────────────────────────────────
  const runRoutingPreview = useCallback(async () => {
    setRoutingLoading(true);
    try {
      const assignments: RoutingAssignment[] = await routingRulesApi.previewRouting(
        [...selectedIds],
        fallbackTemplateId || undefined,
      );
      setRoutingAssignments(assignments);
      setRoutingPreviewDone(true);
    } finally {
      setRoutingLoading(false);
    }
  }, [selectedIds, fallbackTemplateId]);

  useEffect(() => {
    if (step === 2 && campaignMode === 'routing' && !routingPreviewDone && !routingLoading) {
      runRoutingPreview();
    }
  }, [step, campaignMode, routingPreviewDone, routingLoading, runRoutingPreview]);

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

  const toggleAll = useCallback(() => {
    if (selectedIds.size === contacts.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(contacts.map((c: any) => c.id)));
  }, [contacts, selectedIds.size]);

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
  const handleSend = () => {
    const contactGenders: Record<string, 'male' | 'female'> = {};
    if (!genderSkipped) {
      for (const s of genderStates) {
        if (s.assignedGender) contactGenders[s.contactId] = s.assignedGender;
      }
    }

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
      });
    } else {
      sendMutation.mutate({
        name: campaignName,
        templateId: selectedTemplateId,
        contactIds: [...selectedIds],
        scheduledAt: scheduledAt || undefined,
        timezone,
        contactGenders,
      });
    }
  };

  const canProceed = [
    selectedIds.size > 0,
    genderDetectionComplete,
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
          <div className="ml-auto flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            <span className="font-semibold text-foreground">{selectedIds.size}</span>
            recipient{selectedIds.size !== 1 ? 's' : ''} selected
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search email, name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="relative">
                <Briefcase className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Filter by company..."
                  value={companyFilter}
                  onChange={(e) => setCompanyFilter(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="relative">
                <Tag className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Filter by job title..."
                  value={jobTitleFilter}
                  onChange={(e) => setJobTitleFilter(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {contacts.length} contacts
                {(companyFilter || jobTitleFilter || search) && ' (filtered)'}
              </p>
              <Button variant="outline" size="sm" onClick={toggleAll}>
                {selectedIds.size === contacts.length && contacts.length > 0
                  ? 'Deselect all'
                  : `Select all ${contacts.length}`}
              </Button>
            </div>

            <div className="max-h-[400px] overflow-y-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b bg-muted/80 backdrop-blur-sm">
                  <tr>
                    <th className="p-3">
                      <Checkbox
                        checked={selectedIds.size === contacts.length && contacts.length > 0}
                        onCheckedChange={toggleAll}
                      />
                    </th>
                    <th className="p-3 text-left font-medium text-muted-foreground">Email</th>
                    <th className="p-3 text-left font-medium text-muted-foreground">Name</th>
                    <th className="p-3 text-left font-medium text-muted-foreground">Company</th>
                    <th className="p-3 text-left font-medium text-muted-foreground">Job Title</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {contacts.map((c: any) => (
                    <tr
                      key={c.id}
                      className={cn('cursor-pointer transition-colors hover:bg-muted/30', selectedIds.has(c.id) && 'bg-primary/5')}
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
                    </tr>
                  ))}
                  {contacts.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-muted-foreground">
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
                </div>
              )}

              {genderError && (
                <div className="flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{genderError}</p>
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
                                      {s.firstName ? 'Not found' : 'No first name'}
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
                    onClick={() => { setGenderSkipped(false); setGenderDetected(false); setGenderStates([]); }}>
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

      {/* ── STEP 2: Template Routing (routing mode) ─────────────────────────── */}
      {step === 2 && campaignMode === 'routing' && (
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

                <button onClick={() => setScheduledAt(getNextBusinessDay())}
                  className={cn('flex items-center gap-3 rounded-xl border p-3 text-left transition-all hover:shadow-sm',
                    scheduledAt === getNextBusinessDay() ? 'border-primary bg-primary/5' : 'hover:border-primary/40')}>
                  <div className={cn('rounded-lg p-1.5', scheduledAt === getNextBusinessDay() ? 'bg-primary/10' : 'bg-muted')}>
                    <Clock className={cn('h-4 w-4', scheduledAt === getNextBusinessDay() ? 'text-primary' : 'text-muted-foreground')} />
                  </div>
                  <div><p className="text-sm font-semibold">Next business day</p><p className="text-xs text-muted-foreground">8:30 AM</p></div>
                </button>

                <button onClick={() => { if (!scheduledAt || scheduledAt === getNextBusinessDay()) setScheduledAt(new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 16)); }}
                  className={cn('flex items-center gap-3 rounded-xl border p-3 text-left transition-all hover:shadow-sm',
                    scheduledAt && scheduledAt !== getNextBusinessDay() ? 'border-primary bg-primary/5' : 'hover:border-primary/40')}>
                  <div className={cn('rounded-lg p-1.5', scheduledAt && scheduledAt !== getNextBusinessDay() ? 'bg-primary/10' : 'bg-muted')}>
                    <Calendar className={cn('h-4 w-4', scheduledAt && scheduledAt !== getNextBusinessDay() ? 'text-primary' : 'text-muted-foreground')} />
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

      {/* ── STEP 2: Template & Schedule (single mode) ───────────────────────── */}
      {step === 2 && campaignMode === 'single' && (
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

                <button onClick={() => setScheduledAt(getNextBusinessDay())}
                  className={cn('flex items-center gap-3 rounded-xl border p-3 text-left transition-all hover:shadow-sm',
                    scheduledAt === getNextBusinessDay() ? 'border-primary bg-primary/5' : 'hover:border-primary/40')}>
                  <div className={cn('rounded-lg p-1.5', scheduledAt === getNextBusinessDay() ? 'bg-primary/10' : 'bg-muted')}>
                    <Clock className={cn('h-4 w-4', scheduledAt === getNextBusinessDay() ? 'text-primary' : 'text-muted-foreground')} />
                  </div>
                  <div><p className="text-sm font-semibold">Next business day</p><p className="text-xs text-muted-foreground">8:30 AM</p></div>
                </button>

                <button onClick={() => { if (!scheduledAt || scheduledAt === getNextBusinessDay()) setScheduledAt(new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 16)); }}
                  className={cn('flex items-center gap-3 rounded-xl border p-3 text-left transition-all hover:shadow-sm',
                    scheduledAt && scheduledAt !== getNextBusinessDay() ? 'border-primary bg-primary/5' : 'hover:border-primary/40')}>
                  <div className={cn('rounded-lg p-1.5', scheduledAt && scheduledAt !== getNextBusinessDay() ? 'bg-primary/10' : 'bg-muted')}>
                    <Calendar className={cn('h-4 w-4', scheduledAt && scheduledAt !== getNextBusinessDay() ? 'text-primary' : 'text-muted-foreground')} />
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

      {/* ── STEP 3: Review ─────────────────────────────────────────────────── */}
      {step === 3 && (
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
            </CardContent>
          </Card>

          {sendMutation.isError && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {(sendMutation.error as any)?.response?.data?.message || 'Failed to create campaign'}
            </div>
          )}
        </div>
      )}

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
          <Button onClick={handleSend} disabled={sendMutation.isPending} size="lg">
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
