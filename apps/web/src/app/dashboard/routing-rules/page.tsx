'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { routingRulesApi, templatesApi } from '@/lib/api';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Plus, Trash2, Pencil, Save, X, GitBranch, AlertCircle,
  GripVertical,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const CATEGORY_COLORS: Record<string, string> = {
  Executive: 'bg-purple-100 text-purple-700 border-purple-200',
  Technical: 'bg-blue-100 text-blue-700 border-blue-200',
  HR: 'bg-green-100 text-green-700 border-green-200',
  Sales: 'bg-orange-100 text-orange-700 border-orange-200',
  Marketing: 'bg-pink-100 text-pink-700 border-pink-200',
};

function getCategoryColor(name: string) {
  return CATEGORY_COLORS[name] ?? 'bg-muted text-muted-foreground border-border';
}

interface RuleFormState {
  categoryName: string;
  keywords: string;
  templateId: string;
  priority: number;
}

const emptyForm: RuleFormState = { categoryName: '', keywords: '', templateId: '', priority: 0 };

const PRESET_CATEGORIES = [
  {
    name: 'Executive',
    keywords: 'CEO, CTO, CFO, COO, CPO, CMO, VP, Director, Head, Founder, Co-Founder, President, Managing Director, Partner',
  },
  {
    name: 'Technical',
    keywords: 'Engineer, Developer, Architect, DevOps, SRE, QA, Data Scientist, ML, AI, Frontend, Backend, Fullstack, Infrastructure, Platform',
  },
  {
    name: 'HR',
    keywords: 'HR, Human Resources, Recruiter, Talent, People, Hiring, Workforce, Recruitment, Culture',
  },
  {
    name: 'Sales',
    keywords: 'Sales, Account Executive, AE, BDR, SDR, Business Development, Revenue, Growth, Commercial',
  },
  {
    name: 'Marketing',
    keywords: 'Marketing, Brand, Content, SEO, Growth, Digital, Product Marketing, Demand Gen',
  },
];

export default function RoutingRulesPage() {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RuleFormState>(emptyForm);
  const [editForm, setEditForm] = useState<RuleFormState>(emptyForm);
  const [keywordInput, setKeywordInput] = useState('');
  const [editKeywordInput, setEditKeywordInput] = useState('');

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['routing-rules'],
    queryFn: routingRulesApi.getAll,
  });

  const { data: templatesRaw } = useQuery({
    queryKey: ['templates-routing'],
    queryFn: () => templatesApi.getAll(),
  });
  const templates: any[] = Array.isArray(templatesRaw) ? templatesRaw : [];

  const createMutation = useMutation({
    mutationFn: routingRulesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routing-rules'] });
      setShowAddForm(false);
      setForm(emptyForm);
      setKeywordInput('');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => routingRulesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routing-rules'] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: routingRulesApi.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['routing-rules'] }),
  });

  const parseKeywords = (raw: string) =>
    raw.split(',').map((k) => k.trim()).filter(Boolean);

  const handleCreate = () => {
    const keywords = parseKeywords(keywordInput || form.keywords);
    if (!form.categoryName.trim() || !keywords.length) return;
    createMutation.mutate({
      categoryName: form.categoryName.trim(),
      keywords,
      templateId: form.templateId || undefined,
      priority: form.priority,
    });
  };

  const startEdit = (rule: any) => {
    setEditingId(rule.id);
    setEditForm({
      categoryName: rule.categoryName,
      keywords: rule.keywords.join(', '),
      templateId: rule.templateId ?? '',
      priority: rule.priority,
    });
    setEditKeywordInput(rule.keywords.join(', '));
  };

  const handleUpdate = (id: string) => {
    const keywords = parseKeywords(editKeywordInput || editForm.keywords);
    updateMutation.mutate({
      id,
      data: {
        categoryName: editForm.categoryName.trim(),
        keywords,
        templateId: editForm.templateId || undefined,
        priority: editForm.priority,
      },
    });
  };

  const applyPreset = (preset: typeof PRESET_CATEGORIES[0]) => {
    setForm({ ...emptyForm, categoryName: preset.name, keywords: preset.keywords, priority: 0 });
    setKeywordInput(preset.keywords);
    setShowAddForm(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Routing Rules"
        description="Define how contacts are automatically matched to email templates based on their job title"
        actions={
          <Button onClick={() => setShowAddForm(true)} disabled={showAddForm}>
            <Plus className="mr-2 h-4 w-4" />
            Add Rule
          </Button>
        }
      />

      {/* How it works */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <GitBranch className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-1">How routing works</p>
              <p className="text-blue-700">
                When creating a campaign, the system checks each contact's job title against these rules.
                If a match is found, the contact is assigned that rule's template automatically.
                Rules are evaluated by priority (highest first). Contacts that don't match any rule
                will be marked as "unmatched" — you can assign them manually in the campaign review step.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick presets */}
      {(rules as any[]).length === 0 && !showAddForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick start with presets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Choose a preset to create common routing rules instantly. You can edit them afterwards.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {PRESET_CATEGORIES.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => applyPreset(preset)}
                  className="rounded-xl border p-3 text-left transition-all hover:border-primary/40 hover:bg-primary/5 hover:shadow-sm"
                >
                  <p className="text-sm font-semibold">{preset.name}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{preset.keywords}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add form */}
      {showAddForm && (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                New Routing Rule
              </span>
              <Button variant="ghost" size="sm" onClick={() => { setShowAddForm(false); setForm(emptyForm); setKeywordInput(''); }}>
                <X className="h-4 w-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Category name <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="e.g. Executive, Technical, HR"
                  value={form.categoryName}
                  onChange={(e) => setForm({ ...form, categoryName: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 0 })}
                />
                <p className="text-xs text-muted-foreground">Higher number = evaluated first</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Keywords (comma-separated) <span className="text-destructive">*</span></Label>
              <Input
                placeholder="CEO, CTO, VP, Director, Head, Founder"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Job title is checked case-insensitively. A contact matches if their title contains any keyword.
              </p>
              {keywordInput && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {parseKeywords(keywordInput).map((kw) => (
                    <span key={kw} className={cn('rounded-full border px-2.5 py-0.5 text-xs font-medium', getCategoryColor(form.categoryName))}>
                      {kw}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Assign template</Label>
              <Select value={form.templateId} onValueChange={(v) => setForm({ ...form, templateId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a template (optional)…" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                      {t.category && <span className="ml-1 text-muted-foreground">({t.category.name})</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                You can also assign templates later when creating a campaign.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setShowAddForm(false); setForm(emptyForm); setKeywordInput(''); }}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={createMutation.isPending || !form.categoryName.trim() || !keywordInput.trim()}
              >
                <Save className="mr-2 h-4 w-4" />
                Save Rule
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rules list */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : (rules as any[]).length === 0 && !showAddForm ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <GitBranch className="mb-3 h-12 w-12 opacity-20" />
            <p className="text-lg font-medium">No routing rules yet</p>
            <p className="mb-4 text-sm">Add rules to automatically assign templates based on job titles</p>
            <Button onClick={() => setShowAddForm(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add First Rule
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(rules as any[]).map((rule: any) => (
            <Card key={rule.id} className={cn(editingId === rule.id && 'border-primary/40')}>
              {editingId === rule.id ? (
                /* Edit mode */
                <CardContent className="space-y-4 p-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Category name</Label>
                      <Input
                        value={editForm.categoryName}
                        onChange={(e) => setEditForm({ ...editForm, categoryName: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Priority</Label>
                      <Input
                        type="number"
                        min={0}
                        value={editForm.priority}
                        onChange={(e) => setEditForm({ ...editForm, priority: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Keywords (comma-separated)</Label>
                    <Input
                      value={editKeywordInput}
                      onChange={(e) => setEditKeywordInput(e.target.value)}
                    />
                    {editKeywordInput && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {parseKeywords(editKeywordInput).map((kw) => (
                          <span key={kw} className={cn('rounded-full border px-2.5 py-0.5 text-xs font-medium', getCategoryColor(editForm.categoryName))}>
                            {kw}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label>Assign template</Label>
                    <Select value={editForm.templateId} onValueChange={(v) => setEditForm({ ...editForm, templateId: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="No template assigned…" />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map((t: any) => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>
                      <X className="mr-1.5 h-3.5 w-3.5" /> Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleUpdate(rule.id)}
                      disabled={updateMutation.isPending}
                    >
                      <Save className="mr-1.5 h-3.5 w-3.5" /> Save
                    </Button>
                  </div>
                </CardContent>
              ) : (
                /* View mode */
                <CardContent className="flex items-start gap-4 p-4">
                  <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-semibold', getCategoryColor(rule.categoryName))}>
                        {rule.categoryName}
                      </span>
                      {rule.priority > 0 && (
                        <span className="text-xs text-muted-foreground">Priority {rule.priority}</span>
                      )}
                      {rule.template ? (
                        <span className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs text-foreground">
                          → {rule.template.name}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 rounded-full border border-yellow-200 bg-yellow-50 px-2.5 py-0.5 text-xs text-yellow-700">
                          <AlertCircle className="h-3 w-3" />
                          No template assigned
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {rule.keywords.map((kw: string) => (
                        <Badge key={kw} variant="outline" className="text-xs font-normal">
                          {kw}
                        </Badge>
                      ))}
                      {(rule.exactPhrases ?? []).map((phrase: string) => (
                        <Badge key={`exact:${phrase}`} variant="secondary" className="text-xs font-normal">
                          = {phrase}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="sm" onClick={() => startEdit(rule)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteMutation.mutate(rule.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}

          <Button variant="outline" className="w-full" onClick={() => setShowAddForm(true)} disabled={showAddForm}>
            <Plus className="mr-2 h-4 w-4" />
            Add Another Rule
          </Button>
        </div>
      )}
    </div>
  );
}
