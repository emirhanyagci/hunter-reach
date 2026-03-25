'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { campaignsApi } from '@/lib/api';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/email-jobs/status-badge';
import { formatDate, formatRelative } from '@/lib/utils';
import { Plus, Send, Users, FileText, Clock, XCircle } from 'lucide-react';
import Link from 'next/link';

export default function CampaignsPage() {
  const queryClient = useQueryClient();

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: campaignsApi.getAll,
  });

  const cancelMutation = useMutation({
    mutationFn: campaignsApi.cancel,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        description="Manage your outbound email campaigns"
        actions={
          <Link href="/dashboard/campaigns/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Campaign
            </Button>
          </Link>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : campaigns?.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-20 text-muted-foreground">
          <Send className="mb-3 h-12 w-12 opacity-20" />
          <p className="text-lg font-medium">No campaigns yet</p>
          <p className="mb-4 text-sm">Create your first campaign to start sending</p>
          <Link href="/dashboard/campaigns/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Campaign
            </Button>
          </Link>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="p-4 text-left font-medium text-muted-foreground">Campaign</th>
                  <th className="p-4 text-left font-medium text-muted-foreground">Template</th>
                  <th className="p-4 text-left font-medium text-muted-foreground">Recipients</th>
                  <th className="p-4 text-left font-medium text-muted-foreground">Status</th>
                  <th className="p-4 text-left font-medium text-muted-foreground">Scheduled</th>
                  <th className="p-4 text-left font-medium text-muted-foreground">Created</th>
                  <th className="p-4" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {campaigns?.map((campaign: any) => (
                  <tr key={campaign.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-4">
                      <p className="font-semibold">{campaign.name}</p>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">{campaign.template?.name}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span>{campaign._count?.campaignContacts || 0}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <StatusBadge status={campaign.status} />
                    </td>
                    <td className="p-4 text-muted-foreground">
                      {campaign.scheduledAt ? (
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-4 w-4" />
                          {formatDate(campaign.scheduledAt)}
                        </div>
                      ) : (
                        <span className="text-green-600 text-xs font-medium">Immediate</span>
                      )}
                    </td>
                    <td className="p-4 text-muted-foreground text-xs">{formatRelative(campaign.createdAt)}</td>
                    <td className="p-4">
                      {['SCHEDULED', 'DRAFT'].includes(campaign.status) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => cancelMutation.mutate(campaign.id)}
                          disabled={cancelMutation.isPending}
                        >
                          <XCircle className="mr-1.5 h-4 w-4" />
                          Cancel
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
