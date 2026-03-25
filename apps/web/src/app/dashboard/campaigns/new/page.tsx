'use client';
import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { contactsApi, templatesApi, campaignsApi } from '@/lib/api';
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
  HelpCircle, SkipForward, Linkedin, Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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

const STEPS = ['Recipients', 'Gender Detection', 'Template & Schedule', 'Review'];

const TIMEZONES = [
  'UTC', 'Europe/Istanbul', 'America/New_York', 'America/Chicago',
  'America/Denver', 'America/Los_Angeles', 'Europe/London',
  'Europe/Berlin', 'Asia/Dubai', 'Asia/Tokyo', 'Australia/Sydney',
];

// ── Page ───────────────────────────────────────────────────────────────────────
const emptyCustomForm: EmailEditorValue = {
  name: '', categoryId: '', subject: '', bodyText: '', bodyHtml: '',
  maleSubject: '', maleBodyText: '', maleBodyHtml: '',
  femaleSubject: '', femaleBodyText: '', femaleBodyHtml: '',
  attachments: [], pendingFiles: [],
};

export default function NewCampaignPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);

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

  // Step 2 — Template & Schedule
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');

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
      if (!campaignName) setCampaignName(saved.name);
      setShowCustomDialog(false);
      setCustomBaseId('');
      setCustomForm(emptyCustomForm);
    },
  });

  const contacts = contactsData?.data || [];

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
      // Populate states so user can assign manually
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

  const setContactGender = (contactId: string, gender: 'male' | 'female') => {
    setGenderStates((prev) =>
      prev.map((s) => s.contactId === contactId ? { ...s, assignedGender: gender } : s),
    );
  };

  const pendingGenderCount = genderStates.filter((s) => !s.assignedGender).length;
  const autoAssignedCount = genderStates.filter((s) => s.autoAssigned).length;

  const genderDetectionComplete =
    genderSkipped || (genderDetected && pendingGenderCount === 0);

  // ── Template selection ───────────────────────────────────────────────────────
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
    const t = templates.find((t: any) => t.id === templateId);
    if (t && !campaignName) setCampaignName(t.name);
  };

  const handleCustomBaseChange = (templateId: string) => {
    setCustomBaseId(templateId);
    if (!templateId) {
      setCustomForm(emptyCustomForm);
      return;
    }
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

    sendMutation.mutate({
      name: campaignName,
      templateId: selectedTemplateId,
      contactIds: [...selectedIds],
      scheduledAt: scheduledAt || undefined,
      timezone,
      contactGenders,
    });
  };

  const canProceed = [
    selectedIds.size > 0,
    genderDetectionComplete,
    !!selectedTemplateId && !!campaignName,
    true,
  ];

  // Gender summary for review
  const maleCount = genderStates.filter((s) => s.assignedGender === 'male').length;
  const femaleCount = genderStates.filter((s) => s.assignedGender === 'female').length;
  const unknownCount = genderSkipped
    ? selectedIds.size
    : genderStates.filter((s) => !s.assignedGender).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Campaign"
        description="Send personalised outreach emails to your selected contacts"
      />

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
              {/* Loading state */}
              {genderDetecting && (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm font-medium">Detecting genders via genderize.io…</p>
                  <p className="text-xs">Analysing {selectedIds.size} contacts by first name</p>
                </div>
              )}

              {/* Error banner */}
              {genderError && (
                <div className="flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{genderError}</p>
                </div>
              )}

              {/* Detection results */}
              {genderDetected && !genderSkipped && (
                <>
                  {/* Summary bar */}
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

                  {/* Contacts needing manual input */}
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
                            {genderStates
                              .filter((s) => !s.assignedGender)
                              .map((s) => (
                                <tr key={s.contactId} className="bg-yellow-50/30">
                                  <td className="p-3">
                                    <p className="font-medium">{s.firstName || '(no name)'}</p>
                                    <p className="text-xs text-muted-foreground">{s.email}</p>
                                    {s.linkedin && (
                                      <a
                                        href={s.linkedin}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mt-0.5 inline-flex items-center gap-1 text-xs text-[#0077b5] hover:underline"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <Linkedin className="h-3 w-3" />
                                        LinkedIn
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
                                      <button
                                        type="button"
                                        onClick={() => setContactGender(s.contactId, 'male')}
                                        className="flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
                                      >
                                        <GenderMale className="h-3 w-3" /> Male
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setContactGender(s.contactId, 'female')}
                                        className="flex items-center gap-1 rounded-lg border border-pink-200 bg-pink-50 px-2.5 py-1.5 text-xs font-medium text-pink-700 transition-colors hover:bg-pink-100"
                                      >
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

                  {/* Auto-assigned contacts (collapsible summary) */}
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
                            {genderStates
                              .filter((s) => s.autoAssigned)
                              .map((s) => (
                                <tr key={s.contactId}>
                                  <td className="p-3">
                                    <p className="font-medium">{s.firstName || '—'}</p>
                                    <p className="text-xs text-muted-foreground">{s.email}</p>
                                    {s.linkedin && (
                                      <a
                                        href={s.linkedin}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mt-0.5 inline-flex items-center gap-1 text-xs text-[#0077b5] hover:underline"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <Linkedin className="h-3 w-3" />
                                        LinkedIn
                                      </a>
                                    )}
                                  </td>
                                  <td className="p-3">
                                    <div className="flex items-center gap-1.5">
                                      {s.assignedGender === 'male'
                                        ? <GenderMale className="h-3.5 w-3.5 text-blue-500" />
                                        : <GenderFemale className="h-3.5 w-3.5 text-pink-500" />}
                                      <span className="capitalize text-xs font-medium">
                                        {s.assignedGender}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="p-3">{confidenceBadge(s.probability)}</td>
                                  <td className="p-3">
                                    <div className="flex gap-1">
                                      {(['male', 'female'] as const).map((g) => (
                                        <button
                                          key={g}
                                          type="button"
                                          onClick={() => setContactGender(s.contactId, g)}
                                          className={cn(
                                            'rounded px-2 py-0.5 text-xs font-medium transition-colors',
                                            s.assignedGender === g
                                              ? g === 'male'
                                                ? 'bg-blue-100 text-blue-700'
                                                : 'bg-pink-100 text-pink-700'
                                              : 'bg-muted text-muted-foreground hover:bg-muted/80',
                                          )}
                                        >
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

              {/* Skipped state */}
              {genderSkipped && (
                <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                  <SkipForward className="h-4 w-4" />
                  Gender detection skipped — all contacts will receive the default template version.
                  <button
                    type="button"
                    className="ml-auto text-primary hover:underline"
                    onClick={() => {
                      setGenderSkipped(false);
                      setGenderDetected(false);
                      setGenderStates([]);
                    }}
                  >
                    Undo
                  </button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Skip option */}
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

      {/* ── STEP 2: Template & Schedule ────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-5">
          {/* Campaign name */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="flex-1 space-y-1">
                  <Label>Campaign name</Label>
                  <Input
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    placeholder="e.g. CTO Outreach — March 2026"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Template selector */}
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
                    <button
                      key={t.id}
                      onClick={() => handleTemplateSelect(t.id)}
                      className={cn(
                        'rounded-xl border p-3 text-left transition-all hover:shadow-sm',
                        selectedTemplateId === t.id ? 'border-primary bg-primary/5' : 'hover:border-primary/40',
                      )}
                    >
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
                          {hasMale && (
                            <span className="flex items-center gap-0.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600">
                              <GenderMale className="h-2.5 w-2.5" /> Male
                            </span>
                          )}
                          {hasFemale && (
                            <span className="flex items-center gap-0.5 rounded-full bg-pink-50 px-1.5 py-0.5 text-xs text-pink-600">
                              <GenderFemale className="h-2.5 w-2.5" /> Female
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}

                {/* Create custom template card */}
                <button
                  onClick={() => setShowCustomDialog(true)}
                  className="rounded-xl border-2 border-dashed border-primary/30 p-3 text-left transition-all hover:border-primary/60 hover:bg-primary/5"
                >
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

          {/* Create custom template dialog */}
          <Dialog
            open={showCustomDialog}
            onOpenChange={(open) => {
              if (!open) { setCustomBaseId(''); setCustomForm(emptyCustomForm); }
              setShowCustomDialog(open);
            }}
          >
            <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
              <DialogHeader className="shrink-0">
                <DialogTitle>Create Custom Template</DialogTitle>
              </DialogHeader>

              <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
                <div className="space-y-1.5">
                  <Label>Start from base template (optional)</Label>
                  <Select value={customBaseId} onValueChange={handleCustomBaseChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Start from scratch…" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((t: any) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {customBaseId && (
                    <p className="text-xs text-muted-foreground">
                      Content copied from base template — the original will not be modified.
                    </p>
                  )}
                </div>

                <VisualEmailEditor
                  value={customForm}
                  onChange={setCustomForm}
                  categories={(categories as any[]) || []}
                  showNameAndCategory
                  allowPendingAttachments
                />
              </div>

              <DialogFooter className="shrink-0">
                <Button variant="outline" onClick={() => setShowCustomDialog(false)}>Cancel</Button>
                <Button
                  onClick={() => createCustomMutation.mutate(customForm)}
                  disabled={
                    createCustomMutation.isPending ||
                    !customForm.name.trim() ||
                    !customForm.subject.trim() ||
                    !customForm.bodyText.trim()
                  }
                >
                  {createCustomMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create &amp; Select
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

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
                <button
                  onClick={() => setScheduledAt('')}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border p-3 text-left transition-all hover:shadow-sm',
                    !scheduledAt ? 'border-primary bg-primary/5' : 'hover:border-primary/40',
                  )}
                >
                  <div className={cn('rounded-lg p-1.5', !scheduledAt ? 'bg-primary/10' : 'bg-muted')}>
                    <Zap className={cn('h-4 w-4', !scheduledAt ? 'text-primary' : 'text-muted-foreground')} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Send now</p>
                    <p className="text-xs text-muted-foreground">Immediately</p>
                  </div>
                </button>

                <button
                  onClick={() => setScheduledAt(getNextBusinessDay())}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border p-3 text-left transition-all hover:shadow-sm',
                    scheduledAt === getNextBusinessDay() ? 'border-primary bg-primary/5' : 'hover:border-primary/40',
                  )}
                >
                  <div className={cn('rounded-lg p-1.5', scheduledAt === getNextBusinessDay() ? 'bg-primary/10' : 'bg-muted')}>
                    <Clock className={cn('h-4 w-4', scheduledAt === getNextBusinessDay() ? 'text-primary' : 'text-muted-foreground')} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Next business day</p>
                    <p className="text-xs text-muted-foreground">8:30 AM</p>
                  </div>
                </button>

                <button
                  onClick={() => {
                    if (!scheduledAt || scheduledAt === getNextBusinessDay()) {
                      setScheduledAt(new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 16));
                    }
                  }}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border p-3 text-left transition-all hover:shadow-sm',
                    scheduledAt && scheduledAt !== getNextBusinessDay() ? 'border-primary bg-primary/5' : 'hover:border-primary/40',
                  )}
                >
                  <div className={cn('rounded-lg p-1.5', scheduledAt && scheduledAt !== getNextBusinessDay() ? 'bg-primary/10' : 'bg-muted')}>
                    <Calendar className={cn('h-4 w-4', scheduledAt && scheduledAt !== getNextBusinessDay() ? 'text-primary' : 'text-muted-foreground')} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Custom time</p>
                    <p className="text-xs text-muted-foreground">Pick date & time</p>
                  </div>
                </button>
              </div>

              {scheduledAt && scheduledAt !== '' && (
                <div className="grid grid-cols-1 gap-3 rounded-xl border bg-muted/30 p-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Date & Time</Label>
                    <Input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      min={new Date().toISOString().slice(0, 16)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Timezone</Label>
                    <Select value={timezone} onValueChange={setTimezone}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMEZONES.map((tz) => (
                          <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                        ))}
                      </SelectContent>
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
                  <dt className="text-muted-foreground">Recipients</dt>
                  <dd className="font-semibold">{selectedIds.size} contacts</dd>
                </div>
                {!genderSkipped && (maleCount > 0 || femaleCount > 0) ? (
                  <div className="flex justify-between border-b pb-3">
                    <dt className="text-muted-foreground">Gender split</dt>
                    <dd className="flex items-center gap-2">
                      {maleCount > 0 && (
                        <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                          <GenderMale className="h-3 w-3" /> {maleCount} male
                        </span>
                      )}
                      {femaleCount > 0 && (
                        <span className="flex items-center gap-1 rounded-full bg-pink-50 px-2 py-0.5 text-xs text-pink-700">
                          <GenderFemale className="h-3 w-3" /> {femaleCount} female
                        </span>
                      )}
                      {unknownCount > 0 && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {unknownCount} default
                        </span>
                      )}
                    </dd>
                  </div>
                ) : genderSkipped ? (
                  <div className="flex justify-between border-b pb-3">
                    <dt className="text-muted-foreground">Gender variants</dt>
                    <dd className="text-muted-foreground text-xs italic">Skipped — default version for all</dd>
                  </div>
                ) : null}
                <div className="flex justify-between border-b pb-3">
                  <dt className="text-muted-foreground">Template</dt>
                  <dd className="font-semibold">{selectedTemplate?.name}</dd>
                </div>
                <div className="flex justify-between border-b pb-3">
                  <dt className="text-muted-foreground">Default subject</dt>
                  <dd className="max-w-xs truncate font-medium italic">"{selectedTemplate?.subject}"</dd>
                </div>
                {(selectedTemplate?.maleSubject || selectedTemplate?.maleBodyHtml) && (
                  <div className="flex justify-between border-b pb-3">
                    <dt className="text-muted-foreground">Male variant</dt>
                    <dd className="flex items-center gap-1 text-xs text-blue-700">
                      <GenderMale className="h-3 w-3" />
                      {selectedTemplate?.maleSubject
                        ? <span className="truncate max-w-xs italic">"{selectedTemplate.maleSubject}"</span>
                        : 'uses default subject'}
                    </dd>
                  </div>
                )}
                {(selectedTemplate?.femaleSubject || selectedTemplate?.femaleBodyHtml) && (
                  <div className="flex justify-between border-b pb-3">
                    <dt className="text-muted-foreground">Female variant</dt>
                    <dd className="flex items-center gap-1 text-xs text-pink-700">
                      <GenderFemale className="h-3 w-3" />
                      {selectedTemplate?.femaleSubject
                        ? <span className="truncate max-w-xs italic">"{selectedTemplate.femaleSubject}"</span>
                        : 'uses default subject'}
                    </dd>
                  </div>
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
