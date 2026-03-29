'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { csvApi } from '@/lib/api';
import { PageHeader } from '@/components/layout/page-header';
import { CsvUploadZone } from '@/components/csv/csv-upload-zone';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/email-jobs/status-badge';
import { formatDate } from '@/lib/utils';
import { FileText, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function ImportsPage() {
  const queryClient = useQueryClient();
  const [selectedImport, setSelectedImport] = useState<string | null>(null);

  const { data: imports, isLoading } = useQuery({
    queryKey: ['csv-imports'],
    queryFn: csvApi.getImports,
  });

  const { data: contacts } = useQuery({
    queryKey: ['import-contacts', selectedImport],
    queryFn: () => csvApi.getImportContacts(selectedImport!),
    enabled: !!selectedImport,
  });

  const handleUploadSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['csv-imports'] });
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="CSV Imports"
        description="Upload Hunter.io CSV exports to import contacts"
      />

      <CsvUploadZone onSuccess={handleUploadSuccess} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Import list */}
        <Card>
          <CardHeader>
            <CardTitle>Import History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading && (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            )}
            {imports?.map((imp: any) => (
              <button
                key={imp.id}
                onClick={() => setSelectedImport(imp.id === selectedImport ? null : imp.id)}
                className={`w-full rounded-lg border p-4 text-left transition-all hover:shadow-sm ${
                  selectedImport === imp.id ? 'border-primary bg-primary/5' : 'hover:border-primary/40'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-lg bg-primary/10 p-2">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="break-words text-sm font-medium" title={imp.filename}>
                        {imp.filename}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDate(imp.createdAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{imp._count?.contacts || 0} contacts</span>
                    <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${selectedImport === imp.id ? 'rotate-90' : ''}`} />
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  <StatusBadge status={imp.status} />
                  {imp.columnNames?.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {imp.columnNames.length} columns
                    </span>
                  )}
                </div>
              </button>
            ))}
            {!isLoading && !imports?.length && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No imports yet. Upload one or more CSVs above.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Contact preview */}
        {selectedImport && contacts && (
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Contact Preview</CardTitle>
              <Link href={`/dashboard/contacts?importId=${selectedImport}`}>
                <Button variant="outline" size="sm">View all</Button>
              </Link>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="pb-2 pr-3 text-left font-medium text-muted-foreground">Email</th>
                      <th className="pb-2 pr-3 text-left font-medium text-muted-foreground">Name</th>
                      <th className="pb-2 pr-3 text-left font-medium text-muted-foreground">Company</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Valid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {contacts.slice(0, 10).map((c: any) => (
                      <tr key={c.id}>
                        <td className="py-2 pr-3 font-medium">{c.email}</td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {[c.firstName, c.lastName].filter(Boolean).join(' ') || '—'}
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">{c.company || '—'}</td>
                        <td className="py-2">
                          {c.isValid ? (
                            <span className="text-green-600">✓</span>
                          ) : (
                            <span className="text-red-500" title={c.validationErrors?.join(', ')}>✗</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {contacts.length > 10 && (
                  <p className="mt-2 text-center text-xs text-muted-foreground">
                    +{contacts.length - 10} more contacts
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
