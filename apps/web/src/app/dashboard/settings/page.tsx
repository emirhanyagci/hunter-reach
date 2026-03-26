'use client';
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mail, CheckCircle2, XCircle, Loader2, AlertCircle, ExternalLink, Unlink } from 'lucide-react';
import Cookies from 'js-cookie';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

function SettingsContent() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Show result from OAuth redirect
  useEffect(() => {
    const gmail = searchParams.get('gmail');
    if (gmail === 'connected') setNotice({ type: 'success', msg: 'Gmail successfully connected!' });
    if (gmail === 'error') setNotice({ type: 'error', msg: 'Gmail connection failed. Please try again.' });
  }, [searchParams]);

  const { data: status, isLoading } = useQuery({
    queryKey: ['gmail-status'],
    queryFn: () => api.get('/auth/gmail/status').then(r => r.data),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => api.delete('/auth/gmail/disconnect').then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gmail-status'] });
      setNotice({ type: 'success', msg: 'Gmail disconnected.' });
    },
  });

  const handleConnect = () => {
    const token = Cookies.get('token');
    // Redirect to API OAuth endpoint with JWT so backend knows who is connecting
    window.location.href = `${API_URL}/auth/gmail/connect?token=${token}`;
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="Settings"
        description="Manage your account and email provider"
      />

      {/* Notice banner */}
      {notice && (
        <div className={`flex items-center gap-3 rounded-lg border p-4 text-sm ${
          notice.type === 'success'
            ? 'border-green-200 bg-green-50 text-green-800'
            : 'border-red-200 bg-red-50 text-red-800'
        }`}>
          {notice.type === 'success'
            ? <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
            : <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />}
          <p>{notice.msg}</p>
          <button className="ml-auto text-xs underline opacity-60 hover:opacity-100" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Gmail connection card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Gmail Connection
          </CardTitle>
          <CardDescription>
            Connect your Gmail account to send emails directly from your address via Gmail API.
            Emails will appear in your Sent folder and replies come back to your inbox.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking connection...
            </div>
          ) : status?.connected ? (
            <div className="space-y-4">
              {/* Connected state */}
              <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="font-semibold text-green-800 dark:text-green-200">Gmail Connected</p>
                  <p className="text-sm text-green-700 dark:text-green-300">{status.email}</p>
                </div>
              </div>

              <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  Emails sent from <strong>{status.email}</strong>
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  Appears in your Gmail Sent folder
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  Replies come back to your inbox
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  Lowest spam risk
                </p>
              </div>

              <Button
                variant="outline"
                className="text-destructive hover:text-destructive hover:border-destructive"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
              >
                {disconnectMutation.isPending
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Unlink className="mr-2 h-4 w-4" />}
                Disconnect Gmail
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Disconnected state */}
              <div className="flex items-center gap-3 rounded-xl border border-dashed p-4 text-muted-foreground">
                <XCircle className="h-5 w-5" />
                <p className="text-sm">No Gmail account connected</p>
              </div>

              <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1 text-muted-foreground">
                <p className="font-medium text-foreground mb-2">What you get after connecting:</p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  Send from your real Gmail address
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  Emails show up in Sent folder
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  Lowest possible spam rate
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  No password sharing — secure OAuth
                </p>
              </div>

              <Button onClick={handleConnect} className="w-full sm:w-auto">
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Connect Gmail Account
              </Button>

              <p className="text-xs text-muted-foreground">
                You'll be redirected to Google to authorize HunterReach to send emails on your behalf.
                We only request the <code className="bg-muted px-1 rounded">gmail.send</code> permission.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading settings...</div>}>
      <SettingsContent />
    </Suspense>
  );
}
