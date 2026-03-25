import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Seed default user
  const hash = await bcrypt.hash('password123', 10);
  const user = await prisma.user.upsert({
    where: { email: 'admin@hunterreach.io' },
    update: {},
    create: {
      email: 'admin@hunterreach.io',
      passwordHash: hash,
      name: 'Admin',
    },
  });

  // Seed template categories
  const categories = ['General Outreach', 'CTO', 'HR', 'Internship', 'Partnership'];
  for (const name of categories) {
    await prisma.templateCategory.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  // Seed a sample template (only if none exist for this user)
  const existingTemplate = await prisma.template.findFirst({ where: { userId: user.id } });
  if (!existingTemplate) await prisma.template.create({
    data: {
      userId: user.id,
      name: 'Cold Outreach - General',
      subject: 'Quick question for {{fallback job_title "you"}} at {{company}}',
      bodyHtml: `<p>Hi {{fallback first_name "there"}},</p>
<p>I came across <strong>{{domain}}</strong> and was impressed by what your team is building.</p>
<p>I wanted to reach out personally because I think we could add real value to {{company}}.</p>
<p>Would you be open to a quick 15-minute call this week?</p>
<p>Best,<br/>Your Name</p>`,
      bodyText: `Hi {{fallback first_name "there"}},\n\nI came across {{domain}} and was impressed by what your team is building.\n\nI wanted to reach out personally because I think we could add real value to {{company}}.\n\nWould you be open to a quick 15-minute call this week?\n\nBest,\nYour Name`,
      variables: ['first_name', 'job_title', 'domain', 'company'],
    },
  });

  console.log('✅ Seed complete');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
