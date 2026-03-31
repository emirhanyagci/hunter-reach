'use client';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, Loader2, UserPlus, UserCog } from 'lucide-react';
import { contactsApi } from '@/lib/api';

interface Contact {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  gender?: string | null;
  linkedin?: string | null;
  phoneNumber?: string | null;
}

interface ContactFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: Contact | null;
}

interface FormValues {
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  jobTitle: string;
  gender: string;
  linkedin: string;
  phoneNumber: string;
}

export function ContactFormModal({ open, onOpenChange, contact }: ContactFormModalProps) {
  const isEdit = !!contact;
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      email: '',
      firstName: '',
      lastName: '',
      company: '',
      jobTitle: '',
      gender: '',
      linkedin: '',
      phoneNumber: '',
    },
  });

  const genderValue = watch('gender');

  useEffect(() => {
    if (open) {
      reset({
        email: contact?.email ?? '',
        firstName: contact?.firstName ?? '',
        lastName: contact?.lastName ?? '',
        company: contact?.company ?? '',
        jobTitle: contact?.jobTitle ?? '',
        gender: contact?.gender ?? '',
        linkedin: contact?.linkedin ?? '',
        phoneNumber: contact?.phoneNumber ?? '',
      });
    }
  }, [open, contact, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        email: values.email,
        firstName: values.firstName || undefined,
        lastName: values.lastName || undefined,
        company: values.company || undefined,
        jobTitle: values.jobTitle || undefined,
        gender: values.gender || undefined,
        linkedin: values.linkedin || undefined,
        phoneNumber: values.phoneNumber || undefined,
      };
      return isEdit
        ? contactsApi.update(contact!.id, payload)
        : contactsApi.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contacts-campaign'] });
      queryClient.invalidateQueries({ queryKey: ['contacts-lookup'] });
      onOpenChange(false);
    },
  });

  const onSubmit = handleSubmit((values) => mutation.mutate(values));

  const apiError = (mutation.error as any)?.response?.data?.message;
  const isDuplicateError =
    (mutation.error as any)?.response?.status === 409;
  const errorMessage =
    apiError || (mutation.isError ? 'Something went wrong. Please try again.' : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? (
              <><UserCog className="h-5 w-5 text-primary" /> Edit Contact</>
            ) : (
              <><UserPlus className="h-5 w-5 text-primary" /> Add Contact</>
            )}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4 py-1">
          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="cf-email">
              Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="cf-email"
              type="email"
              placeholder="contact@example.com"
              {...register('email', { required: 'Email is required' })}
            />
            {errors.email && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" /> {errors.email.message}
              </p>
            )}
          </div>

          {/* First / Last name */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cf-first">First name</Label>
              <Input id="cf-first" placeholder="Jane" {...register('firstName')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cf-last">Last name</Label>
              <Input id="cf-last" placeholder="Smith" {...register('lastName')} />
            </div>
          </div>

          {/* Company */}
          <div className="space-y-1.5">
            <Label htmlFor="cf-company">Company</Label>
            <Input id="cf-company" placeholder="Acme Corp" {...register('company')} />
          </div>

          {/* Job title */}
          <div className="space-y-1.5">
            <Label htmlFor="cf-jobtitle">Job title</Label>
            <Input id="cf-jobtitle" placeholder="VP of Engineering" {...register('jobTitle')} />
          </div>

          {/* Gender & LinkedIn in a row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Gender <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Select
                value={genderValue}
                onValueChange={(v) => setValue('gender', v === 'none' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not specified</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cf-phone">Phone</Label>
              <Input id="cf-phone" placeholder="+1 555 000 0000" {...register('phoneNumber')} />
            </div>
          </div>

          {/* LinkedIn */}
          <div className="space-y-1.5">
            <Label htmlFor="cf-linkedin">LinkedIn URL</Label>
            <Input
              id="cf-linkedin"
              placeholder="https://linkedin.com/in/janesmith"
              {...register('linkedin')}
            />
          </div>

          {errorMessage && (
            <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
              isDuplicateError
                ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200'
                : 'border-destructive/30 bg-destructive/10 text-destructive'
            }`}>
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{Array.isArray(errorMessage) ? errorMessage.join(', ') : errorMessage}</span>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? 'Save changes' : 'Add contact'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
