import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const SENT_STATUSES = ['SENT', 'REPLIED'] as const;

@Injectable()
export class EmailAnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getDashboard(userId: string, trendDays: number) {
    const days = Math.min(120, Math.max(7, trendDays));
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - days);
    since.setUTCHours(0, 0, 0, 0);

    const [summary, byTemplate, byTag, trends] = await Promise.all([
      this.summary(userId),
      this.byTemplate(userId),
      this.byContactTag(userId),
      this.trends(userId, since),
    ]);

    return { summary, byTemplate, byTag, trends, trendDays: days };
  }

  private async summary(userId: string) {
    const base = { campaign: { userId } };
    const [sent, replied, scheduled, failed] = await Promise.all([
      this.prisma.emailJob.count({
        where: { ...base, status: { in: [...SENT_STATUSES] } },
      }),
      this.prisma.emailJob.count({
        where: {
          ...base,
          status: { in: [...SENT_STATUSES] },
          OR: [{ status: 'REPLIED' }, { replyCount: { gt: 0 } }],
        },
      }),
      this.prisma.emailJob.count({ where: { ...base, status: 'SCHEDULED' } }),
      this.prisma.emailJob.count({ where: { ...base, status: 'FAILED' } }),
    ]);
    const replyRate = sent > 0 ? replied / sent : 0;
    return { sent, replied, replyRate, scheduled, failed };
  }

  private async byTemplate(userId: string) {
    const whereBase = { campaign: { userId }, status: { in: [...SENT_STATUSES] } };
    const [sentGroups, replyGroups] = await Promise.all([
      this.prisma.emailJob.groupBy({
        by: ['templateId'],
        where: whereBase,
        _count: { _all: true },
      }),
      this.prisma.emailJob.groupBy({
        by: ['templateId'],
        where: {
          ...whereBase,
          OR: [{ status: 'REPLIED' }, { replyCount: { gt: 0 } }],
        },
        _count: { _all: true },
      }),
    ]);

    const ids = [
      ...new Set(
        [...sentGroups.map((g) => g.templateId), ...replyGroups.map((g) => g.templateId)].filter(
          (id): id is string => id != null,
        ),
      ),
    ];
    const templates =
      ids.length > 0
        ? await this.prisma.template.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
          })
        : [];
    const nameById = new Map(templates.map((t) => [t.id, t.name]));

    const replyMap = new Map(replyGroups.map((g) => [g.templateId, g._count._all]));

    const rows = sentGroups.map((g) => {
      const sent = g._count._all;
      const replies = replyMap.get(g.templateId) ?? 0;
      const templateName = g.templateId
        ? (nameById.get(g.templateId) ?? 'Unknown template')
        : 'Custom / campaign body';
      return {
        templateId: g.templateId,
        templateName,
        sent,
        replies,
        replyRate: sent > 0 ? replies / sent : 0,
      };
    });

    rows.sort((a, b) => b.sent - a.sent);
    return rows;
  }

  private async byContactTag(userId: string) {
    type TagRow = { tag: string; sent: bigint; replied: bigint };
    const rows = await this.prisma.$queryRaw<TagRow[]>`
      SELECT
        CASE
          WHEN NULLIF(btrim(u.tag), '') IS NULL THEN '(untagged)'
          ELSE btrim(u.tag)
        END AS tag,
        COUNT(*)::bigint AS sent,
        COUNT(*) FILTER (WHERE ej.reply_count > 0 OR ej.status = 'REPLIED')::bigint AS replied
      FROM email_jobs ej
      INNER JOIN campaigns camp ON camp.id = ej.campaign_id
      INNER JOIN contacts ct ON ct.id = ej.contact_id
      CROSS JOIN LATERAL (
        SELECT *
        FROM unnest(
          CASE
            WHEN ct.tags IS NULL OR cardinality(ct.tags) = 0 THEN ARRAY['']::text[]
            ELSE ct.tags
          END
        ) AS u(tag)
      ) u
      WHERE camp.user_id = ${userId}::uuid
        AND ej.status IN ('SENT', 'REPLIED')
      GROUP BY 1
      ORDER BY sent DESC
    `;

    return rows.map((r) => {
      const sent = Number(r.sent);
      const replies = Number(r.replied);
      return {
        tag: r.tag,
        sent,
        replies,
        replyRate: sent > 0 ? replies / sent : 0,
      };
    });
  }

  private async trends(userId: string, since: Date) {
    type TrendRow = { day: Date; sent: bigint; replies: bigint };
    const rows = await this.prisma.$queryRaw<TrendRow[]>`
      SELECT
        (ej.sent_at AT TIME ZONE 'UTC')::date AS day,
        COUNT(*)::bigint AS sent,
        COUNT(*) FILTER (WHERE ej.reply_count > 0 OR ej.status = 'REPLIED')::bigint AS replies
      FROM email_jobs ej
      INNER JOIN campaigns camp ON camp.id = ej.campaign_id
      WHERE camp.user_id = ${userId}::uuid
        AND ej.status IN ('SENT', 'REPLIED')
        AND ej.sent_at IS NOT NULL
        AND ej.sent_at >= ${since}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    return rows.map((r) => ({
      day: r.day.toISOString().slice(0, 10),
      sent: Number(r.sent),
      replies: Number(r.replies),
    }));
  }
}
