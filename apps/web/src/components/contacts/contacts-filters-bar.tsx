'use client';

import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type ContactsFilterFields = {
  search: string;
  jobTitle: string;
  company: string;
  verificationStatus: string;
  emailStatus: string;
  gender: string;
  hasLinkedin: string;
  tag: string;
};

const emptyFilters = (): ContactsFilterFields => ({
  search: '',
  jobTitle: '',
  company: '',
  verificationStatus: '',
  emailStatus: '',
  gender: '',
  hasLinkedin: '',
  tag: '',
});

export function contactsFiltersActive(f: ContactsFilterFields): boolean {
  return Object.values(f).some(Boolean);
}

export function clearContactsFilters(): ContactsFilterFields {
  return emptyFilters();
}

type Props = {
  value: ContactsFilterFields;
  onFiltersChange: (next: ContactsFilterFields) => void;
  /** When true, wraps in Card like the main Contacts page. */
  variant?: 'card' | 'plain';
  className?: string;
};

export function contactsFiltersToQueryParams(
  f: ContactsFilterFields,
  extra?: { page?: number; limit?: number; importId?: string | null },
): Record<string, string | number | boolean | undefined> {
  return {
    ...(f.search.trim() ? { search: f.search.trim() } : {}),
    ...(f.jobTitle.trim() ? { jobTitle: f.jobTitle.trim() } : {}),
    ...(f.company.trim() ? { company: f.company.trim() } : {}),
    ...(f.verificationStatus ? { verificationStatus: f.verificationStatus } : {}),
    ...(f.emailStatus ? { emailStatus: f.emailStatus } : {}),
    ...(f.gender ? { gender: f.gender } : {}),
    ...(f.hasLinkedin === 'yes' ? { hasLinkedin: true } : f.hasLinkedin === 'no' ? { hasLinkedin: false } : {}),
    ...(f.tag.trim() ? { tag: f.tag.trim() } : {}),
    ...(extra?.page != null ? { page: extra.page } : {}),
    ...(extra?.limit != null ? { limit: extra.limit } : {}),
    ...(extra?.importId ? { importId: extra.importId } : {}),
  };
}

export function ContactsFiltersBar({ value, onFiltersChange, variant = 'card', className }: Props) {
  const patch = (partial: Partial<ContactsFilterFields>) => onFiltersChange({ ...value, ...partial });
  const clear = () => onFiltersChange(clearContactsFilters());

  const inner = (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search email, name, company..."
            value={value.search}
            onChange={(e) => patch({ search: e.target.value })}
            className="pl-9"
          />
        </div>
        <Input
          placeholder="Job title"
          value={value.jobTitle}
          onChange={(e) => patch({ jobTitle: e.target.value })}
          className="w-48"
        />
        <Input
          placeholder="Company"
          value={value.company}
          onChange={(e) => patch({ company: e.target.value })}
          className="w-48"
        />
        <Select
          value={value.verificationStatus}
          onValueChange={(v) => patch({ verificationStatus: v === 'all' ? '' : v })}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Verification status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="valid">Valid</SelectItem>
            <SelectItem value="invalid">Invalid</SelectItem>
            <SelectItem value="accept_all">Accept all</SelectItem>
            <SelectItem value="webmail">Webmail</SelectItem>
            <SelectItem value="unknown">Unknown</SelectItem>
          </SelectContent>
        </Select>
        <Select value={value.emailStatus || 'all'} onValueChange={(v) => patch({ emailStatus: v === 'all' ? '' : v })}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Email status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All email statuses</SelectItem>
            <SelectItem value="never_contacted">Never contacted</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="sent">Sent (not replied)</SelectItem>
            <SelectItem value="replied">Replied</SelectItem>
            <SelectItem value="not_replied">Not replied (any stage)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap gap-3">
        <Select value={value.gender || 'all'} onValueChange={(v) => patch({ gender: v === 'all' ? '' : v })}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Gender" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any gender</SelectItem>
            <SelectItem value="male">Male</SelectItem>
            <SelectItem value="female">Female</SelectItem>
            <SelectItem value="_unset">Not set</SelectItem>
          </SelectContent>
        </Select>
        <Select value={value.hasLinkedin || 'all'} onValueChange={(v) => patch({ hasLinkedin: v === 'all' ? '' : v })}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="LinkedIn" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">LinkedIn — any</SelectItem>
            <SelectItem value="yes">Has LinkedIn URL</SelectItem>
            <SelectItem value="no">No LinkedIn</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="Tag / category label"
          value={value.tag}
          onChange={(e) => patch({ tag: e.target.value })}
          className="min-w-48 flex-1 sm:max-w-xs"
        />
        {contactsFiltersActive(value) && (
          <Button variant="ghost" size="sm" type="button" onClick={clear}>
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );

  if (variant === 'plain') {
    return inner;
  }

  return (
    <Card>
      <CardContent className="p-4">{inner}</CardContent>
    </Card>
  );
}
