'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { companyNotesApi } from '@/lib/api';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Link as LinkIcon,
  ExternalLink,
  X,
  ChevronRight,
  CheckCircle2,
  Bell,
  Archive,
  Loader2,
} from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import type { CompanyNote, CompanyNoteLink, CompanyTrackerStatus } from '@hunterreach/shared';

const STATUSES: CompanyTrackerStatus[] = [
  'INTERESTED',
  'PLANNED',
  'APPLIED',
  'REMINDER_SET',
  'ARCHIVED',
];

const STATUS_LABEL: Record<CompanyTrackerStatus, string> = {
  INTERESTED: 'Interested',
  PLANNED: 'Planned',
  APPLIED: 'Applied',
  REMINDER_SET: 'Reminder set',
  ARCHIVED: 'Archived',
};

function statusBadgeVariant(
  s: CompanyTrackerStatus,
): 'default' | 'secondary' | 'outline' | 'success' | 'warning' {
  switch (s) {
    case 'APPLIED':
      return 'success';
    case 'PLANNED':
      return 'default';
    case 'REMINDER_SET':
      return 'warning';
    case 'ARCHIVED':
      return 'secondary';
    default:
      return 'outline';
  }
}

function normalizeNote(raw: Record<string, unknown>): CompanyNote {
  return {
    ...(raw as unknown as CompanyNote),
    status: (raw.status as CompanyTrackerStatus) ?? 'INTERESTED',
    links: Array.isArray(raw.links) ? (raw.links as CompanyNoteLink[]) : [],
    reminderTimezone: typeof raw.reminderTimezone === 'string' ? raw.reminderTimezone : 'UTC',
    reminderStopOnApplied: raw.reminderStopOnApplied !== false,
  };
}

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(local: string): string | null {
  if (!local.trim()) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// ── Add company dialog ────────────────────────────────────────────────────────

interface AddCompanyFormProps {
  onSubmit: (data: {
    companyName: string;
    content: string;
    links: CompanyNoteLink[];
    sourceContactId?: string;
    status?: CompanyTrackerStatus;
  }) => void;
  onCancel: () => void;
  isPending: boolean;
}

function AddCompanyForm({ onSubmit, onCancel, isPending }: AddCompanyFormProps) {
  const [companyName, setCompanyName] = useState('');
  const [sourceContactId, setSourceContactId] = useState<string | undefined>();
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<CompanyTrackerStatus>('INTERESTED');
  const [links, setLinks] = useState<CompanyNoteLink[]>([]);
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [importQ, setImportQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(importQ), 280);
    return () => clearTimeout(t);
  }, [importQ]);

  const { data: suggestions, isFetching: suggestionsLoading } = useQuery({
    queryKey: ['company-note-import-companies', debouncedQ],
    queryFn: () => companyNotesApi.getContactCompanies({ q: debouncedQ.trim(), limit: 25 }),
    enabled: debouncedQ.trim().length >= 1,
  });

  const addLink = () => {
    const trimmedUrl = linkUrl.trim();
    const trimmedLabel = linkLabel.trim();
    if (!trimmedUrl) return;
    const url = trimmedUrl.startsWith('http') ? trimmedUrl : `https://${trimmedUrl}`;
    setLinks((prev) => [...prev, { label: trimmedLabel || url, url }]);
    setLinkLabel('');
    setLinkUrl('');
  };

  const pickSuggestion = (name: string, contactId: string) => {
    setCompanyName(name);
    setSourceContactId(contactId);
    setImportQ('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) return;
    onSubmit({
      companyName: companyName.trim(),
      content,
      links,
      sourceContactId,
      status,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="add-company">Company name *</Label>
        <Input
          id="add-company"
          value={companyName}
          onChange={(e) => {
            setCompanyName(e.target.value);
            setSourceContactId(undefined);
          }}
          placeholder="e.g. Acme Corp"
          required
          autoFocus
        />
      </div>

      <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
        <Label className="text-xs text-muted-foreground">Pick from imported contacts</Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8 h-9 text-sm"
            value={importQ}
            onChange={(e) => setImportQ(e.target.value)}
            placeholder="Search company names from CSV / contacts…"
          />
        </div>
        {importQ.trim().length >= 1 && (
          <div className="max-h-36 overflow-y-auto rounded-md border bg-background text-sm">
            {suggestionsLoading ? (
              <div className="flex items-center gap-2 px-3 py-2 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Searching…
              </div>
            ) : (suggestions?.data?.length ?? 0) === 0 ? (
              <p className="px-3 py-2 text-muted-foreground">No matching companies in contacts.</p>
            ) : (
              <ul className="divide-y">
                {suggestions!.data.map((row) => (
                  <li key={row.sampleContactId}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-accent"
                      onClick={() => pickSuggestion(row.companyName, row.sampleContactId)}
                    >
                      {row.companyName}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {sourceContactId && (
          <p className="text-xs text-muted-foreground">Linked to a contact import for this name.</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Starting status</Label>
        <Select value={status} onValueChange={(v) => setStatus(v as CompanyTrackerStatus)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.filter((s) => s !== 'ARCHIVED').map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="add-note">Short note</Label>
        <Textarea
          id="add-note"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="e.g. Applications open April 1 · follow up next week"
          rows={2}
          maxLength={2000}
          className="resize-none text-sm"
        />
      </div>

      <div className="space-y-2">
        <Label>Links</Label>
        {links.length > 0 && (
          <ul className="space-y-1.5">
            {links.map((link, i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm"
              >
                <LinkIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-medium">{link.label}</span>
                <button
                  type="button"
                  onClick={() => setLinks((prev) => prev.filter((_, j) => j !== i))}
                  className="ml-auto shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Input
            value={linkLabel}
            onChange={(e) => setLinkLabel(e.target.value)}
            placeholder="Label"
            className="w-28 shrink-0"
          />
          <Input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="URL"
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addLink())}
          />
          <Button type="button" variant="outline" size="sm" onClick={addLink} className="shrink-0">
            Add
          </Button>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending || !companyName.trim()}>
          {isPending ? 'Adding…' : 'Add company'}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ── Edit full dialog (name + links) ───────────────────────────────────────────

interface EditCompanyFormProps {
  initial: CompanyNote;
  onSubmit: (data: { companyName: string; content: string; links: CompanyNoteLink[] }) => void;
  onCancel: () => void;
  isPending: boolean;
}

function EditCompanyForm({ initial, onSubmit, onCancel, isPending }: EditCompanyFormProps) {
  const [companyName, setCompanyName] = useState(initial.companyName);
  const [content, setContent] = useState(initial.content ?? '');
  const [links, setLinks] = useState<CompanyNoteLink[]>(initial.links ?? []);
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');

  const addLink = () => {
    const trimmedUrl = linkUrl.trim();
    const trimmedLabel = linkLabel.trim();
    if (!trimmedUrl) return;
    const url = trimmedUrl.startsWith('http') ? trimmedUrl : `https://${trimmedUrl}`;
    setLinks((prev) => [...prev, { label: trimmedLabel || url, url }]);
    setLinkLabel('');
    setLinkUrl('');
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!companyName.trim()) return;
        onSubmit({ companyName: companyName.trim(), content, links });
      }}
      className="space-y-4"
    >
      <div className="space-y-1.5">
        <Label htmlFor="edit-name">Company name *</Label>
        <Input
          id="edit-name"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit-content">Short note</Label>
        <Textarea
          id="edit-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          maxLength={2000}
          className="resize-none"
        />
      </div>
      <div className="space-y-2">
        <Label>Links</Label>
        {links.map((link, i) => (
          <div
            key={i}
            className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm"
          >
            <span className="min-w-0 flex-1 truncate">{link.label}</span>
            <button
              type="button"
              onClick={() => setLinks((prev) => prev.filter((_, j) => j !== i))}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <Input
            value={linkLabel}
            onChange={(e) => setLinkLabel(e.target.value)}
            placeholder="Label"
            className="w-28 shrink-0"
          />
          <Input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="URL"
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addLink())}
          />
          <Button type="button" variant="outline" size="sm" onClick={addLink}>
            Add
          </Button>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────────

interface DetailPanelProps {
  note: CompanyNote;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onClose: () => void;
  onPatch: (data: Parameters<typeof companyNotesApi.update>[1]) => void;
  isPatching: boolean;
  isDeleting: boolean;
}

function DetailPanel({
  note,
  onEdit,
  onArchive,
  onDelete,
  onClose,
  onPatch,
  isPatching,
  isDeleting,
}: DetailPanelProps) {
  const [noteDraft, setNoteDraft] = useState(note.content ?? '');
  const [reminderLocal, setReminderLocal] = useState(() => toDatetimeLocalValue(note.reminderAt));
  const [recurrenceDays, setRecurrenceDays] = useState(
    note.reminderRecurrenceDays != null ? String(note.reminderRecurrenceDays) : '',
  );
  const [stopOnApplied, setStopOnApplied] = useState(note.reminderStopOnApplied !== false);

  useEffect(() => {
    setNoteDraft(note.content ?? '');
    setReminderLocal(toDatetimeLocalValue(note.reminderAt));
    setRecurrenceDays(note.reminderRecurrenceDays != null ? String(note.reminderRecurrenceDays) : '');
    setStopOnApplied(note.reminderStopOnApplied !== false);
  }, [note.id, note.content, note.reminderAt, note.reminderRecurrenceDays, note.reminderStopOnApplied]);

  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  const saveNoteOnly = () => {
    onPatch({ content: noteDraft });
  };

  const saveReminder = () => {
    const iso = fromDatetimeLocalValue(reminderLocal);
    const parsed = parseInt(recurrenceDays, 10);
    const rec =
      recurrenceDays.trim() === '' || Number.isNaN(parsed)
        ? null
        : Math.min(365, Math.max(1, parsed));
    onPatch({
      reminderAt: iso,
      reminderTimezone: tz,
      reminderRecurrenceDays: rec,
      reminderStopOnApplied: stopOnApplied,
    });
  };

  const clearReminder = () => {
    setReminderLocal('');
    setRecurrenceDays('');
    onPatch({
      reminderAt: null,
      reminderRecurrenceDays: null,
      reminderTimezone: tz,
      reminderStopOnApplied: stopOnApplied,
    });
  };

  return (
    <div className="flex h-full flex-col max-h-[calc(100vh-8rem)]">
      <div className="flex items-start justify-between gap-2 border-b px-5 py-4 shrink-0">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold truncate">{note.companyName}</h2>
            <Badge variant={statusBadgeVariant(note.status)}>{STATUS_LABEL[note.status]}</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Updated {formatDate(note.updatedAt)}
            {note.appliedAt ? ` · Applied ${formatDate(note.appliedAt)}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Name & links
          </Button>
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-5 px-5 py-4">
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Status</Label>
          <Select
            value={note.status}
            onValueChange={(v) => onPatch({ status: v as CompanyTrackerStatus })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="panel-note" className="text-xs uppercase tracking-wide text-muted-foreground">
              Short note
            </Label>
            <Button type="button" size="sm" variant="secondary" onClick={saveNoteOnly} disabled={isPatching}>
              Save note
            </Button>
          </div>
          <Textarea
            id="panel-note"
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Quick reminders only…"
            className="resize-none text-sm"
          />
        </div>

        <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Bell className="h-4 w-4" />
            Email reminder
          </div>
          <p className="text-xs text-muted-foreground">
            Uses your connected Gmail (or app mail settings). You will receive an email at your account
            address.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="reminder-dt" className="text-xs">
              Remind me at (local time)
            </Label>
            <Input
              id="reminder-dt"
              type="datetime-local"
              value={reminderLocal}
              onChange={(e) => setReminderLocal(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="recurrence" className="text-xs">
              Repeat every N days (optional)
            </Label>
            <Input
              id="recurrence"
              type="number"
              min={1}
              max={365}
              placeholder="Leave empty for a one-time reminder"
              value={recurrenceDays}
              onChange={(e) => setRecurrenceDays(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="stop-applied"
              checked={stopOnApplied}
              onCheckedChange={(c) => setStopOnApplied(c === true)}
            />
            <label htmlFor="stop-applied" className="text-sm leading-none cursor-pointer">
              Stop repeating once status is Applied
            </label>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" size="sm" onClick={saveReminder} disabled={isPatching}>
              Save reminder
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={clearReminder} disabled={isPatching}>
              Clear reminder
            </Button>
          </div>
          {note.lastReminderSentAt && (
            <p className="text-xs text-muted-foreground">
              Last reminder email: {formatDate(note.lastReminderSentAt)}
            </p>
          )}
        </div>

        {note.links.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Links
            </p>
            <ul className="space-y-2">
              {note.links.map((link, i) => (
                <li key={i}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
                  >
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button
            size="sm"
            variant="outline"
            onClick={onArchive}
            disabled={note.status === 'ARCHIVED' || isPatching}
          >
            <Archive className="mr-1.5 h-3.5 w-3.5" />
            Archive
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onDelete}
            disabled={isDeleting}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Delete permanently
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CompanyNotesPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [hideArchived, setHideArchived] = useState(true);
  const [selectedNote, setSelectedNote] = useState<CompanyNote | null>(null);
  /** Single modal avoids two Radix Dialog roots fighting focus / open state. */
  const [modal, setModal] = useState<'none' | 'add' | 'edit'>('none');
  const [editNote, setEditNote] = useState<CompanyNote | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['company-notes', { search, statusFilter, hideArchived }],
    queryFn: async () => {
      const res = await companyNotesApi.getAll({
        search: search || undefined,
        limit: 100,
        status: statusFilter || undefined,
        hideArchived: hideArchived || undefined,
      });
      return {
        ...res,
        data: (res.data as Record<string, unknown>[]).map(normalizeNote),
      };
    },
  });

  const createMutation = useMutation({
    mutationFn: companyNotesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-notes'] });
      setModal('none');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof companyNotesApi.update>[1] }) =>
      companyNotesApi.update(id, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['company-notes'] });
      setEditNote(null);
      setModal((prev) => (prev === 'edit' ? 'none' : prev));
      const u = normalizeNote(updated as unknown as Record<string, unknown>);
      setSelectedNote((prev) => (prev?.id === u.id ? u : prev));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: companyNotesApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-notes'] });
      setSelectedNote(null);
    },
  });

  const notes: CompanyNote[] = data?.data ?? [];
  const total: number = data?.total ?? 0;

  const openCreate = () => {
    setEditNote(null);
    setModal('add');
  };

  const openEdit = useCallback((note: CompanyNote) => {
    setEditNote(note);
    setModal('edit');
  }, []);

  const closeModal = useCallback(() => {
    setModal('none');
    setEditNote(null);
  }, []);

  const handleAddSubmit = (formData: {
    companyName: string;
    content: string;
    links: CompanyNoteLink[];
    sourceContactId?: string;
    status?: CompanyTrackerStatus;
  }) => {
    createMutation.mutate({
      companyName: formData.companyName,
      content: formData.content,
      links: formData.links,
      sourceContactId: formData.sourceContactId,
      status: formData.status,
    });
  };

  const handleEditSubmit = (formData: { companyName: string; content: string; links: CompanyNoteLink[] }) => {
    if (!editNote) return;
    updateMutation.mutate({ id: editNote.id, data: formData });
  };

  const handleDelete = (note: CompanyNote) => {
    if (!confirm(`Permanently delete “${note.companyName}”? This cannot be undone.`)) return;
    deleteMutation.mutate(note.id);
  };

  const markApplied = useCallback(
    (e: React.MouseEvent, note: CompanyNote) => {
      e.stopPropagation();
      updateMutation.mutate({ id: note.id, data: { status: 'APPLIED' } });
    },
    [updateMutation],
  );

  const markArchived = useCallback(
    (note: CompanyNote) => {
      updateMutation.mutate({ id: note.id, data: { status: 'ARCHIVED' } });
    },
    [updateMutation],
  );

  const patchNote = useCallback(
    (noteId: string, data: Parameters<typeof companyNotesApi.update>[1]) => {
      updateMutation.mutate({ id: noteId, data });
    },
    [updateMutation],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Company tracker"
        description="Interested → planned → applied, without deleting your history."
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add company
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search companies or notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 w-[200px]">
            <Label className="text-xs text-muted-foreground shrink-0">Status</Label>
            <Select value={statusFilter || '__all__'} onValueChange={(v) => setStatusFilter(v === '__all__' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="show-archived"
              checked={!hideArchived}
              onCheckedChange={(c) => setHideArchived(c !== true)}
            />
            <label htmlFor="show-archived" className="text-sm cursor-pointer whitespace-nowrap">
              Show archived
            </label>
          </div>
        </div>
      </div>

      <div className={cn('grid gap-4', selectedNote ? 'lg:grid-cols-[1fr_400px]' : 'grid-cols-1')}>
        <div>
          {isLoading ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : notes.length === 0 ? (
            <Card>
              <CardContent className="flex h-56 flex-col items-center justify-center gap-3 text-center pt-6">
                <p className="font-medium">
                  {search || statusFilter ? 'No companies match filters' : 'No companies yet'}
                </p>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Add a company, mark Applied in one click when you send an application, and use Archive
                  instead of delete to keep history.
                </p>
                {!search && !statusFilter && (
                  <Button variant="outline" onClick={openCreate}>
                    <Plus className="mr-1.5 h-4 w-4" />
                    Add company
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {notes.map((note) => {
                const isActive = selectedNote?.id === note.id;
                const preview = note.content?.slice(0, 100) || null;

                return (
                  <div
                    key={note.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedNote(isActive ? null : note)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedNote(isActive ? null : note);
                      }
                    }}
                    className={cn(
                      'w-full rounded-lg border text-left transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      isActive
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'bg-card hover:border-primary/30 hover:bg-accent/40',
                    )}
                  >
                    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-sm">{note.companyName}</span>
                          <Badge variant={statusBadgeVariant(note.status)} className="font-normal">
                            {STATUS_LABEL[note.status]}
                          </Badge>
                          {note.reminderAt && (
                            <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                              <Bell className="h-3 w-3" />
                              {formatDate(note.reminderAt)}
                            </span>
                          )}
                          {note.links.length > 0 && (
                            <span className="flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                              <LinkIcon className="h-3 w-3" />
                              {note.links.length}
                            </span>
                          )}
                        </div>
                        {preview ? (
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{preview}</p>
                        ) : (
                          <p className="mt-1 text-xs text-muted-foreground italic">No note yet</p>
                        )}
                      </div>

                      <div
                        className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <Button
                          size="sm"
                          variant={note.status === 'APPLIED' ? 'secondary' : 'default'}
                          className="h-8"
                          disabled={note.status === 'APPLIED' || updateMutation.isPending}
                          onClick={(e) => markApplied(e, note)}
                        >
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                          Applied
                        </Button>
                        <Select
                          value={note.status}
                          onValueChange={(v) =>
                            updateMutation.mutate({ id: note.id, data: { status: v as CompanyTrackerStatus } })
                          }
                        >
                          <SelectTrigger className="h-8 w-[132px]" aria-label="Change status">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>
                                {STATUS_LABEL[s]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span className="text-xs text-muted-foreground hidden sm:inline">
                          {formatDate(note.updatedAt)}
                        </span>
                        <ChevronRight
                          className={cn(
                            'h-4 w-4 text-muted-foreground transition-transform hidden sm:block',
                            isActive && 'rotate-90',
                          )}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
              <p className="pt-1 text-center text-xs text-muted-foreground">
                {total} {total === 1 ? 'company' : 'companies'}
              </p>
            </div>
          )}
        </div>

        {selectedNote && (
          <div className="rounded-lg border bg-card shadow-sm lg:sticky lg:top-4 lg:self-start">
            <DetailPanel
              note={selectedNote}
              onEdit={() => openEdit(selectedNote)}
              onArchive={() => markArchived(selectedNote)}
              onDelete={() => handleDelete(selectedNote)}
              onClose={() => setSelectedNote(null)}
              onPatch={(data) => patchNote(selectedNote.id, data)}
              isPatching={updateMutation.isPending}
              isDeleting={deleteMutation.isPending}
            />
          </div>
        )}
      </div>

      <Dialog
        open={modal !== 'none'}
        onOpenChange={(open) => {
          if (!open) closeModal();
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          {modal === 'add' && (
            <>
              <DialogHeader>
                <DialogTitle>Add company</DialogTitle>
              </DialogHeader>
              <AddCompanyForm
                onSubmit={handleAddSubmit}
                onCancel={closeModal}
                isPending={createMutation.isPending}
              />
            </>
          )}
          {modal === 'edit' && editNote && (
            <>
              <DialogHeader>
                <DialogTitle>Name & links</DialogTitle>
              </DialogHeader>
              <EditCompanyForm
                key={editNote.id}
                initial={editNote}
                onSubmit={handleEditSubmit}
                onCancel={closeModal}
                isPending={updateMutation.isPending}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
