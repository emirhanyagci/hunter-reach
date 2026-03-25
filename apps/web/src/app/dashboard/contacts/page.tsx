'use client';
import { useState, useCallback, Suspense } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { contactsApi } from '@/lib/api';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '@/components/email-jobs/status-badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Trash2, Users, AlertCircle, Linkedin, Mail } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { formatDate } from '@/lib/utils';
import Link from 'next/link';
import { SendEmailModal } from '@/components/contacts/send-email-modal';

function ContactsContent() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [verificationStatus, setVerificationStatus] = useState('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sendEmailContact, setSendEmailContact] = useState<any>(null);

  const importId = searchParams.get('importId');

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', { search, jobTitle, company, verificationStatus, page, importId }],
    queryFn: () => contactsApi.getAll({ search, jobTitle, company, verificationStatus, page, limit: 50, importId }),
  });

  const deleteMutation = useMutation({
    mutationFn: (ids: string[]) => contactsApi.bulkDelete(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      setSelectedIds(new Set());
    },
  });

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selectedIds.size === data?.data?.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data?.data?.map((c: any) => c.id) || []));
    }
  }, [selectedIds.size, data?.data]);

  const contacts = data?.data || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contacts"
        description={`${total.toLocaleString()} contacts in your database`}
        actions={
          selectedIds.size > 0 ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => deleteMutation.mutate([...selectedIds])}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete {selectedIds.size} selected
            </Button>
          ) : (
            <Link href="/dashboard/campaigns/new">
              <Button size="sm">Create Campaign</Button>
            </Link>
          )
        }
      />

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search email, name, company..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <Input
              placeholder="Job title filter"
              value={jobTitle}
              onChange={(e) => { setJobTitle(e.target.value); setPage(1); }}
              className="w-48"
            />
            <Input
              placeholder="Company filter"
              value={company}
              onChange={(e) => { setCompany(e.target.value); setPage(1); }}
              className="w-48"
            />
            <Select value={verificationStatus} onValueChange={(v) => { setVerificationStatus(v === 'all' ? '' : v); setPage(1); }}>
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
            {(search || jobTitle || company || verificationStatus) && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setJobTitle(''); setCompany(''); setVerificationStatus(''); setPage(1); }}>
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : contacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Users className="mb-3 h-12 w-12 opacity-20" />
              <p className="text-lg font-medium">No contacts found</p>
              <p className="text-sm">Try adjusting your filters or upload a CSV</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="p-4">
                      <Checkbox
                        checked={selectedIds.size === contacts.length && contacts.length > 0}
                        onCheckedChange={toggleAll}
                      />
                    </th>
                    <th className="p-4 text-left font-medium text-muted-foreground">Contact</th>
                    <th className="p-4 text-left font-medium text-muted-foreground">Company</th>
                    <th className="p-4 text-left font-medium text-muted-foreground">Job Title</th>
                    <th className="p-4 text-left font-medium text-muted-foreground">Status</th>
                    <th className="p-4 text-left font-medium text-muted-foreground">Score</th>
                    <th className="p-4 text-left font-medium text-muted-foreground">Added</th>
                    <th className="p-4" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {contacts.map((contact: any) => (
                    <tr key={contact.id} className={`transition-colors hover:bg-muted/30 ${selectedIds.has(contact.id) ? 'bg-primary/5' : ''}`}>
                      <td className="p-4">
                        <Checkbox
                          checked={selectedIds.has(contact.id)}
                          onCheckedChange={() => toggleSelect(contact.id)}
                        />
                      </td>
                      <td className="p-4">
                        <div>
                          <p className="font-medium">{contact.email}</p>
                          <p className="text-xs text-muted-foreground">
                            {[contact.firstName, contact.lastName].filter(Boolean).join(' ')}
                          </p>
                          {contact.linkedin && (
                            <a
                              href={contact.linkedin}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-0.5 inline-flex items-center gap-1 text-xs text-[#0077b5] hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Linkedin className="h-3 w-3" />
                              LinkedIn
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-muted-foreground">{contact.company || '—'}</td>
                      <td className="p-4 text-muted-foreground">{contact.jobTitle || '—'}</td>
                      <td className="p-4">
                        {contact.verificationStatus ? (
                          <StatusBadge status={contact.verificationStatus} />
                        ) : contact.isValid ? (
                          <span className="text-xs text-green-600">✓ valid</span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-red-500" title={contact.validationErrors?.join(', ')}>
                            <AlertCircle className="h-3 w-3" /> invalid
                          </span>
                        )}
                      </td>
                      <td className="p-4">
                        {contact.score != null ? (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${contact.score}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">{contact.score}</span>
                          </div>
                        ) : '—'}
                      </td>
                      <td className="p-4 text-xs text-muted-foreground">{formatDate(contact.createdAt)}</td>
                      <td className="p-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-primary"
                          title="Send email"
                          onClick={(e) => { e.stopPropagation(); setSendEmailContact(contact); }}
                        >
                          <Mail className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t p-4">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages} · {total.toLocaleString()} total
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <SendEmailModal
        contact={sendEmailContact}
        open={!!sendEmailContact}
        onOpenChange={(open) => { if (!open) setSendEmailContact(null); }}
      />
    </div>
  );
}

export default function ContactsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading contacts...</div>}>
      <ContactsContent />
    </Suspense>
  );
}
