'use client';
import { useState, useCallback } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { companyNotesApi } from '@/lib/api';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Link as LinkIcon,
  ExternalLink,
  BookMarked,
  X,
  ChevronRight,
} from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import type { CompanyNote, CompanyNoteLink } from '@hunterreach/shared';

// ── Note Form ─────────────────────────────────────────────────────────────────

interface NoteFormProps {
  initial?: CompanyNote;
  onSubmit: (data: { companyName: string; content: string; links: CompanyNoteLink[] }) => void;
  onCancel: () => void;
  isPending: boolean;
}

function NoteForm({ initial, onSubmit, onCancel, isPending }: NoteFormProps) {
  const [companyName, setCompanyName] = useState(initial?.companyName ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [links, setLinks] = useState<CompanyNoteLink[]>(initial?.links ?? []);
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

  const removeLink = (index: number) => {
    setLinks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) return;
    onSubmit({ companyName: companyName.trim(), content, links });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="companyName">Company name *</Label>
        <Input
          id="companyName"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="e.g. Acme Corp"
          required
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="content">Notes</Label>
        <Textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Add notes, observations, or reminders about this company…"
          rows={4}
          className="resize-none"
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
                <span className="min-w-0 shrink truncate text-muted-foreground">{link.url}</span>
                <button
                  type="button"
                  onClick={() => removeLink(i)}
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
            placeholder="Label (optional)"
            className="w-36 shrink-0"
          />
          <Input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="URL"
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addLink())}
          />
          <Button type="button" variant="outline" onClick={addLink} className="shrink-0">
            Add
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Press Enter or click Add to attach a link.</p>
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending || !companyName.trim()}>
          {isPending ? 'Saving…' : initial ? 'Save changes' : 'Create note'}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

interface DetailPanelProps {
  note: CompanyNote;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
  isDeleting: boolean;
}

function DetailPanel({ note, onEdit, onDelete, onClose, isDeleting }: DetailPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between border-b px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold">{note.companyName}</h2>
          <p className="text-xs text-muted-foreground">
            Updated {formatDate(note.updatedAt)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onDelete}
            disabled={isDeleting}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Delete
          </Button>
          <Button size="icon" variant="ghost" onClick={onClose} className="ml-1">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 px-6 py-5">
        {note.content ? (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Notes
            </p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{note.content}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">No notes written yet.</p>
        )}

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
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CompanyNotesPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [selectedNote, setSelectedNote] = useState<CompanyNote | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editNote, setEditNote] = useState<CompanyNote | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['company-notes', { search }],
    queryFn: () => companyNotesApi.getAll({ search: search || undefined, limit: 100 }),
  });

  const createMutation = useMutation({
    mutationFn: companyNotesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-notes'] });
      setFormOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => companyNotesApi.update(id, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['company-notes'] });
      setEditNote(null);
      setSelectedNote(updated);
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
    setFormOpen(true);
  };

  const openEdit = useCallback((note: CompanyNote) => {
    setEditNote(note);
    setFormOpen(true);
  }, []);

  const handleFormSubmit = (formData: { companyName: string; content: string; links: CompanyNoteLink[] }) => {
    if (editNote) {
      updateMutation.mutate({ id: editNote.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (note: CompanyNote) => {
    if (!confirm(`Delete the note for "${note.companyName}"?`)) return;
    deleteMutation.mutate(note.id);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Company Notes"
        description="Track companies you want to follow up with."
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            New note
          </Button>
        }
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by company name or notes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className={cn('grid gap-4', selectedNote ? 'grid-cols-[1fr_420px]' : 'grid-cols-1')}>
        {/* ── Notes list ── */}
        <div>
          {isLoading ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : notes.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <BookMarked className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">
                  {search ? 'No notes match your search' : 'No company notes yet'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {search
                    ? 'Try a different keyword.'
                    : 'Create your first note to get started.'}
                </p>
              </div>
              {!search && (
                <Button variant="outline" onClick={openCreate}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Create note
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {notes.map((note) => {
                const isActive = selectedNote?.id === note.id;
                const preview = note.content?.slice(0, 120) || null;

                return (
                  <button
                    key={note.id}
                    onClick={() => setSelectedNote(isActive ? null : note)}
                    className={cn(
                      'w-full rounded-lg border text-left transition-all duration-150',
                      isActive
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'bg-card hover:border-primary/30 hover:bg-accent/40',
                    )}
                  >
                    <div className="flex items-center gap-3 px-4 py-3.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-semibold text-sm">
                            {note.companyName}
                          </span>
                          {note.links.length > 0 && (
                            <span className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                              <LinkIcon className="h-3 w-3" />
                              {note.links.length}
                            </span>
                          )}
                        </div>
                        {preview ? (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {preview}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-xs text-muted-foreground italic">
                            No notes written yet
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {formatDate(note.updatedAt)}
                        </span>
                        <ChevronRight
                          className={cn(
                            'h-4 w-4 text-muted-foreground transition-transform',
                            isActive && 'rotate-90',
                          )}
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
              <p className="pt-1 text-center text-xs text-muted-foreground">
                {total} {total === 1 ? 'note' : 'notes'} total
              </p>
            </div>
          )}
        </div>

        {/* ── Detail panel ── */}
        {selectedNote && (
          <div className="rounded-lg border bg-card shadow-sm">
            <DetailPanel
              note={selectedNote}
              onEdit={() => openEdit(selectedNote)}
              onDelete={() => handleDelete(selectedNote)}
              onClose={() => setSelectedNote(null)}
              isDeleting={deleteMutation.isPending}
            />
          </div>
        )}
      </div>

      {/* ── Create / Edit Dialog ── */}
      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) {
            setFormOpen(false);
            setEditNote(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editNote ? 'Edit company note' : 'New company note'}
            </DialogTitle>
          </DialogHeader>
          <NoteForm
            initial={editNote ?? undefined}
            onSubmit={handleFormSubmit}
            onCancel={() => {
              setFormOpen(false);
              setEditNote(null);
            }}
            isPending={isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
