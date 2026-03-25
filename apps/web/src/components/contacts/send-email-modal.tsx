'use client';
import { useState, useEffect, useCallback } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Send, Mail, Building, ArrowLeft, Loader2, Paperclip, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { templatesApi, campaignsApi } from '@/lib/api';

interface Contact {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  jobTitle?: string | null;
}

interface SendEmailModalProps {
  contact: Contact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'template' | 'compose';

export function SendEmailModal({ contact, open, onOpenChange }: SendEmailModalProps) {
  const [step, setStep] = useState<Step>('template');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedGender, setSelectedGender] = useState<'male' | 'female' | 'default'>('default');
  const [detectedGender, setDetectedGender] = useState<{ gender: 'male' | 'female'; probability: number } | null>(null);
  const [isDetectingGender, setIsDetectingGender] = useState(false);
  const [customSubject, setCustomSubject] = useState('');
  const [customBodyHtml, setCustomBodyHtml] = useState('');
  const [success, setSuccess] = useState(false);

  const { data: templates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: () => templatesApi.getAll(),
    enabled: open,
  });

  const selectedTemplate = (templates as any[]).find((t) => t.id === selectedTemplateId);

  const hasGenderVariants = selectedTemplate && (
    selectedTemplate.maleSubject || selectedTemplate.maleBodyHtml ||
    selectedTemplate.femaleSubject || selectedTemplate.femaleBodyHtml
  );

  const getVariantContent = useCallback((gender: string, template: any) => {
    if (!template) return { subject: '', bodyHtml: '' };
    if (gender === 'male') {
      return {
        subject: template.maleSubject || template.subject,
        bodyHtml: template.maleBodyHtml || template.bodyHtml,
      };
    }
    if (gender === 'female') {
      return {
        subject: template.femaleSubject || template.subject,
        bodyHtml: template.femaleBodyHtml || template.bodyHtml,
      };
    }
    return { subject: template.subject, bodyHtml: template.bodyHtml };
  }, []);

  // Detect gender and populate content when template is selected
  useEffect(() => {
    if (!selectedTemplateId || !contact || step !== 'compose') return;

    // Populate with default content first
    const defaultContent = getVariantContent('default', selectedTemplate);
    setCustomSubject(defaultContent.subject);
    setCustomBodyHtml(defaultContent.bodyHtml);
    setDetectedGender(null);
    setSelectedGender('default');

    if (!contact.firstName) return;

    setIsDetectingGender(true);
    campaignsApi
      .detectGenders([contact.id])
      .then((results: any[]) => {
        const result = results[0];
        if (result?.autoAssigned && result?.gender) {
          setDetectedGender({ gender: result.gender, probability: result.probability });
          setSelectedGender(result.gender);
          const content = getVariantContent(result.gender, selectedTemplate);
          setCustomSubject(content.subject);
          setCustomBodyHtml(content.bodyHtml);
        }
      })
      .catch(() => {})
      .finally(() => setIsDetectingGender(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplateId, step]);

  const handleGenderChange = (gender: 'male' | 'female' | 'default') => {
    setSelectedGender(gender);
    const content = getVariantContent(gender, selectedTemplate);
    setCustomSubject(content.subject);
    setCustomBodyHtml(content.bodyHtml);
  };

  const sendMutation = useMutation({
    mutationFn: () =>
      templatesApi.sendToContact({
        contactId: contact!.id,
        templateId: selectedTemplateId,
        gender: selectedGender !== 'default' ? selectedGender : undefined,
        customSubject,
        customBodyHtml,
      }),
    onSuccess: () => {
      setSuccess(true);
    },
  });

  const reset = () => {
    setStep('template');
    setSelectedTemplateId('');
    setSelectedGender('default');
    setDetectedGender(null);
    setCustomSubject('');
    setCustomBodyHtml('');
    setSuccess(false);
    sendMutation.reset();
  };

  const handleOpenChange = (open: boolean) => {
    onOpenChange(open);
    if (!open) reset();
  };

  const handleTemplateSelect = (id: string) => {
    setSelectedTemplateId(id);
    setStep('compose');
  };

  const contactName = [contact?.firstName, contact?.lastName].filter(Boolean).join(' ');

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            {step === 'template' ? 'Send Email — Choose Template' : 'Compose Email'}
          </DialogTitle>
        </DialogHeader>

        {/* Contact summary bar */}
        {contact && (
          <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-sm shrink-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-xs shrink-0">
              {(contactName || contact.email).slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              {contactName && <p className="font-medium truncate">{contactName}</p>}
              <p className={`text-muted-foreground truncate ${contactName ? 'text-xs' : 'font-medium'}`}>
                {contact.email}
              </p>
            </div>
            {contact.company && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                <Building className="h-3 w-3" />
                <span className="max-w-32 truncate">{contact.company}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto min-h-0">
          {success ? (
            // Success state
            <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
                <CheckCircle2 className="h-7 w-7 text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-base">Email sent!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Successfully delivered to <span className="font-medium">{contact?.email}</span>
                </p>
              </div>
            </div>
          ) : step === 'template' ? (
            // Step 1: Template selection
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                Select a template to send to this contact.
              </p>
              {(templates as any[]).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                  <Mail className="h-8 w-8 opacity-20" />
                  <p className="text-sm">No templates found.</p>
                  <p className="text-xs">Create a template first from the Templates page.</p>
                </div>
              ) : (
                <div className="grid gap-2">
                  {(templates as any[]).map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleTemplateSelect(t.id)}
                      className="text-left rounded-lg border p-3 hover:border-primary hover:bg-primary/5 transition-colors w-full"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-sm">{t.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1 font-mono">
                            {t.subject}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                          {t.category && (
                            <Badge variant="secondary" className="text-xs">{t.category.name}</Badge>
                          )}
                          {(t.maleSubject || t.maleBodyHtml || t.femaleSubject || t.femaleBodyHtml) && (
                            <Badge variant="outline" className="text-xs">♂/♀ variants</Badge>
                          )}
                          {t.attachments?.length > 0 && (
                            <Badge variant="outline" className="text-xs">
                              <Paperclip className="mr-1 h-2.5 w-2.5" />
                              {t.attachments.length}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            // Step 2: Compose
            <div className="space-y-4 py-2">
              {/* Gender selector */}
              {hasGenderVariants && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Gender variant</Label>
                    {isDetectingGender ? (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Detecting…
                      </span>
                    ) : detectedGender ? (
                      <span className="text-xs text-muted-foreground">
                        Auto-detected:{' '}
                        <span className="font-medium capitalize">{detectedGender.gender}</span>
                        {' '}({Math.round(detectedGender.probability * 100)}% confidence)
                      </span>
                    ) : null}
                  </div>
                  <Select
                    value={selectedGender}
                    onValueChange={(v) => handleGenderChange(v as any)}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default</SelectItem>
                      <SelectItem value="male">Male variant</SelectItem>
                      <SelectItem value="female">Female variant</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Subject */}
              <div className="space-y-1.5">
                <Label htmlFor="email-subject">Subject</Label>
                <Input
                  id="email-subject"
                  value={customSubject}
                  onChange={(e) => setCustomSubject(e.target.value)}
                  placeholder="Email subject…"
                />
              </div>

              {/* Body */}
              <div className="space-y-1.5">
                <Label>Body</Label>
                <Tabs defaultValue="preview">
                  <TabsList className="h-8">
                    <TabsTrigger value="preview" className="text-xs h-7">Preview</TabsTrigger>
                    <TabsTrigger value="edit" className="text-xs h-7">Edit HTML</TabsTrigger>
                  </TabsList>
                  <TabsContent value="preview" className="mt-2">
                    <div className="h-56 overflow-auto rounded-lg border bg-white">
                      <iframe
                        srcDoc={customBodyHtml}
                        className="w-full h-full"
                        sandbox="allow-same-origin"
                        title="Email preview"
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Template variables (e.g. <code className="font-mono bg-muted px-1 rounded">{'{{first_name}}'}</code>) will be replaced with contact data on send.
                    </p>
                  </TabsContent>
                  <TabsContent value="edit" className="mt-2">
                    <Textarea
                      value={customBodyHtml}
                      onChange={(e) => setCustomBodyHtml(e.target.value)}
                      className="h-56 font-mono text-xs resize-none"
                      placeholder="Email HTML body…"
                    />
                  </TabsContent>
                </Tabs>
              </div>

              {/* Attachments info */}
              {selectedTemplate?.attachments?.length > 0 && (
                <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  <Paperclip className="h-3.5 w-3.5 shrink-0" />
                  {selectedTemplate.attachments.length} attachment
                  {selectedTemplate.attachments.length > 1 ? 's' : ''} will be included:{' '}
                  {selectedTemplate.attachments.map((a: any) => a.originalName).join(', ')}
                </div>
              )}

              {/* Error state */}
              {sendMutation.isError && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {(sendMutation.error as any)?.response?.data?.message || 'Failed to send email. Please try again.'}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 shrink-0 pt-2 border-t">
          {success ? (
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Close
            </Button>
          ) : step === 'compose' ? (
            <>
              <Button variant="outline" onClick={() => { setStep('template'); sendMutation.reset(); }}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={() => sendMutation.mutate()}
                disabled={sendMutation.isPending || !customSubject.trim() || !customBodyHtml.trim()}
              >
                {sendMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Send Email
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
