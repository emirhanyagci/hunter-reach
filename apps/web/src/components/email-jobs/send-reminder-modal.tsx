'use client';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { emailJobsApi, templatesApi } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bell, CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface SendReminderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedJobIds: string[];
  onSuccess: () => void;
}

export function SendReminderModal({ open, onOpenChange, selectedJobIds, onSuccess }: SendReminderModalProps) {
  const [templateId, setTemplateId] = useState('');
  const [result, setResult] = useState<{ sent: number; failed: number; results: any[] } | null>(null);

  const { data: templates, isLoading: templatesLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: () => templatesApi.getAll(),
    enabled: open,
  });

  const reminderMutation = useMutation({
    mutationFn: () => emailJobsApi.sendReminder({ emailJobIds: selectedJobIds, templateId }),
    onSuccess: (data) => {
      setResult(data);
      onSuccess();
    },
  });

  const handleClose = () => {
    setTemplateId('');
    setResult(null);
    onOpenChange(false);
  };

  const templateList: any[] = templates ?? [];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Send Reminder Emails
          </DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">{result.sent} reminder{result.sent !== 1 ? 's' : ''} sent successfully</span>
              </div>
              {result.failed > 0 && (
                <div className="flex items-center gap-2 text-red-500">
                  <XCircle className="h-5 w-5" />
                  <span>{result.failed} failed</span>
                </div>
              )}
            </div>
            {result.failed > 0 && (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {result.results
                  .filter((r: any) => !r.success)
                  .map((r: any) => (
                    <div key={r.jobId} className="text-xs text-red-500 flex justify-between">
                      <span>{r.contactEmail}</span>
                      <span>{r.error}</span>
                    </div>
                  ))}
              </div>
            )}
            <Button className="w-full" onClick={handleClose}>Done</Button>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                You are about to send reminder emails to <strong>{selectedJobIds.length}</strong> contact{selectedJobIds.length !== 1 ? 's' : ''} who have not replied.
                The reminder will be sent in the same email thread if possible.
              </p>

              <div className="space-y-2">
                <label className="text-sm font-medium">Reminder Template</label>
                {templatesLoading ? (
                  <div className="h-10 animate-pulse rounded bg-muted" />
                ) : (
                  <Select value={templateId} onValueChange={setTemplateId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a template…" />
                    </SelectTrigger>
                    <SelectContent>
                      {templateList.map((t: any) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                          {t.category?.name && <span className="text-muted-foreground ml-1">· {t.category.name}</span>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
                <p>• Reminders will only be sent to contacts with no replies</p>
                <p>• The template will be personalized with contact data</p>
                <p>• Gender-specific template variants will be applied if available</p>
                <p>• The email will be sent in the original Gmail thread if possible</p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button
                onClick={() => reminderMutation.mutate()}
                disabled={!templateId || reminderMutation.isPending}
              >
                {reminderMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    <Bell className="mr-2 h-4 w-4" />
                    Send {selectedJobIds.length} Reminder{selectedJobIds.length !== 1 ? 's' : ''}
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
