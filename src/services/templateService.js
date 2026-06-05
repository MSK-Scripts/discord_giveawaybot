// Giveaway-Vorlagen pro Guild (CRUD).
import { prisma } from '../database/prisma.js';

export async function saveTemplate(guildId, { name, title, description, duration, winnersCount }) {
  return prisma.giveawayTemplate.upsert({
    where: { guildId_name: { guildId, name } },
    update: { title, description, duration, winnersCount },
    create: { guildId, name, title, description, duration, winnersCount },
  });
}

export async function listTemplates(guildId) {
  return prisma.giveawayTemplate.findMany({ where: { guildId }, orderBy: { name: 'asc' } });
}

export async function getTemplate(guildId, name) {
  return prisma.giveawayTemplate.findUnique({ where: { guildId_name: { guildId, name } } });
}

export async function deleteTemplate(guildId, name) {
  const res = await prisma.giveawayTemplate.deleteMany({ where: { guildId, name } });
  return res.count > 0;
}
