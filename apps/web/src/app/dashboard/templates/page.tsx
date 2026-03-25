'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { templatesApi } from '@/lib/api';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Edit2, Trash2, FileText, Tag, Loader2, Paperclip, Copy } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import {
  VisualEmailEditor, EmailEditorValue, htmlToBodyText, bodyTextToHtml,
  TemplateAttachmentMeta,
} from '@/components/templates/visual-email-editor';

const defaultValue: EmailEditorValue = {
  name: '',
  categoryId: '',
  subject: '',
  bodyText: '',
  bodyHtml: '',
  maleSubject: '',
  maleBodyText: '',
  maleBodyHtml: '',
  femaleSubject: '',
  femaleBodyText: '',
  femaleBodyHtml: '',
  attachments: [],
  pendingFiles: [],
};

export default function TemplatesPage() {
  const queryClient = useQueryClient();
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [form, setForm] = useState<EmailEditorValue>(defaultValue);
  const [selectedCategory, setSelectedCategory] = useState('');

  const { data: templates, isLoading } = useQuery({
    queryKey: ['templates', selectedCategory],
    queryFn: () => templatesApi.getAll(selectedCategory || undefined),
  });

  const { data: categories } = useQuery({
    queryKey: ['template-categories'],
    queryFn: templatesApi.getCategories,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: EmailEditorValue) => {
      const payload = {
        name: data.name,
        subject: data.subject,
        bodyHtml: data.bodyHtml || bodyTextToHtml(data.bodyText),
        bodyText: data.bodyText,
        categoryId: data.categoryId || undefined,
        // Gender-specific variants (empty string → null on backend)
        maleSubject: data.maleSubject || undefined,
        maleBodyHtml: data.maleBodyHtml || (data.maleBodyText ? bodyTextToHtml(data.maleBodyText) : undefined),
        maleBodyText: data.maleBodyText || undefined,
        femaleSubject: data.femaleSubject || undefined,
        femaleBodyHtml: data.femaleBodyHtml || (data.femaleBodyText ? bodyTextToHtml(data.femaleBodyText) : undefined),
        femaleBodyText: data.femaleBodyText || undefined,
      };

      const saved = editingTemplate
        ? await templatesApi.update(editingTemplate.id, payload)
        : await templatesApi.create(payload);

      // Upload any pending files collected before the template existed
      if ((data.pendingFiles?.length ?? 0) > 0) {
        await templatesApi.uploadAttachments(saved.id, data.pendingFiles!);
      }

      return saved;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setIsDialogOpen(false);
      setEditingTemplate(null);
      setForm(defaultValue);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: templatesApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates'] }),
  });

  const openCreate = () => {
    setEditingTemplate(null);
    setForm(defaultValue);
    setIsDialogOpen(true);
  };

  const openEdit = (template: any) => {
    setEditingTemplate(template);
    setForm({
      name: template.name,
      categoryId: template.categoryId || '',
      subject: template.subject,
      bodyText: htmlToBodyText(template.bodyHtml),
      bodyHtml: template.bodyHtml,
      maleSubject: template.maleSubject || '',
      maleBodyText: template.maleBodyHtml ? htmlToBodyText(template.maleBodyHtml) : '',
      maleBodyHtml: template.maleBodyHtml || '',
      femaleSubject: template.femaleSubject || '',
      femaleBodyText: template.femaleBodyHtml ? htmlToBodyText(template.femaleBodyHtml) : '',
      femaleBodyHtml: template.femaleBodyHtml || '',
      attachments: (template.attachments ?? []) as TemplateAttachmentMeta[],
      pendingFiles: [],
    });
    setIsDialogOpen(true);
  };

  const openCreateCustom = (base: any) => {
    setEditingTemplate(null);
    setForm({
      name: `Custom: ${base.name}`,
      categoryId: base.categoryId || '',
      subject: base.subject,
      bodyText: htmlToBodyText(base.bodyHtml),
      bodyHtml: base.bodyHtml,
      maleSubject: base.maleSubject || '',
      maleBodyText: base.maleBodyHtml ? htmlToBodyText(base.maleBodyHtml) : '',
      maleBodyHtml: base.maleBodyHtml || '',
      femaleSubject: base.femaleSubject || '',
      femaleBodyText: base.femaleBodyHtml ? htmlToBodyText(base.femaleBodyHtml) : '',
      femaleBodyHtml: base.femaleBodyHtml || '',
      attachments: [],
      pendingFiles: [],
    });
    setIsDialogOpen(true);
  };

  const canSave = form.name.trim() && form.subject.trim() && form.bodyText.trim();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email Templates"
        description="Create reusable email templates with personalisation variables"
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            New Template
          </Button>
        }
      />

      {/* Category filter pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategory('')}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            !selectedCategory ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
          }`}
        >
          All
        </button>
        {(categories as any[])?.map((cat: any) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id === selectedCategory ? '' : cat.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              selectedCategory === cat.id ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Template grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : !(templates as any[])?.length ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-20 text-muted-foreground">
          <FileText className="mb-3 h-12 w-12 opacity-20" />
          <p className="text-lg font-medium">No templates yet</p>
          <p className="mb-4 text-sm">Create your first email template to get started</p>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Create Template
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(templates as any[])?.map((template: any) => (
            <Card key={template.id} className="group relative overflow-hidden transition-shadow hover:shadow-md">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate text-base">{template.name}</CardTitle>
                    {template.category && (
                      <div className="mt-1 flex items-center gap-1">
                        <Tag className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{template.category.name}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Create custom version"
                      onClick={() => openCreateCustom(template)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(template)}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => deleteMutation.mutate(template.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="mb-3 line-clamp-2 text-sm italic text-muted-foreground">
                  "{template.subject}"
                </p>
                <div className="flex flex-wrap gap-1">
                  {template.variables.slice(0, 5).map((v: string) => (
                    <span key={v} className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">
                      {`{{${v}}}`}
                    </span>
                  ))}
                  {template.variables.length > 5 && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      +{template.variables.length - 5}
                    </span>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Updated {formatDate(template.updatedAt)}</p>
                  {template.attachments?.length > 0 && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Paperclip className="h-3 w-3" />
                      {template.attachments.length}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>
            {editingTemplate
              ? 'Edit Template'
              : form.name.startsWith('Custom: ')
                ? 'Create Custom Template'
                : 'Create Template'}
          </DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto">
            <VisualEmailEditor
              value={form}
              onChange={setForm}
              categories={(categories as any[]) || []}
              showNameAndCategory
              templateId={editingTemplate?.id}
              allowPendingAttachments
            />
          </div>

          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => saveMutation.mutate(form)}
              disabled={saveMutation.isPending || !canSave}
            >
              {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingTemplate ? 'Save changes' : 'Create template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
