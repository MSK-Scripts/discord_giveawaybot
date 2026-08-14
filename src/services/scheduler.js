// Poll-basierter, restart-sicherer Scheduler.
// Alle 10s: "Ending soon"-Reminder versenden + fällige ACTIVE-Giveaways beenden.
import { prisma } from '../database/prisma.js';
import { logger } from '../utils/logger.js';
import { endGiveaway, sendGuildLog } from './giveawayService.js';
import { getSettings } from './settingsService.js';
import { t } from '../utils/i18n.js';

const TICK_MS = 10_000;
let timer = null;

/** "Ending soon"-Reminder posten (einmal pro Giveaway, atomar geclaimt). */
async function sendReminders(client) {
  let due;
  try {
    due = await prisma.giveaway.findMany({
      where: {
        status: 'ACTIVE',
        reminderSent: false,
        reminderAt: { not: null, lte: new Date() },
        endAt: { gt: new Date() },
      },
    });
  } catch (err) {
    logger.error('Reminder-Query (DB-Fehler):', err?.message ?? err);
    return;
  }

  for (const gw of due) {
    // Atomar claimen, damit überlappende Ticks keinen Doppel-Reminder senden.
    try {
      const claimed = await prisma.giveaway.updateMany({
        where: { id: gw.id, reminderSent: false },
        data: { reminderSent: true },
      });
      if (claimed.count === 0) continue;
    } catch {
      continue;
    }

    try {
      const settings = await getSettings(gw.guildId);
      const channel = await client.channels.fetch(gw.channelId).catch(() => null);
      if (!channel) continue;
      const ends = `<t:${Math.floor(new Date(gw.endAt).getTime() / 1000)}:R>`;
      const ping = settings.notifyRole ? `<@&${settings.notifyRole}> ` : '';
      await channel.send({
        content: ping + t(gw.guildId, 'reminder.ending_soon', { title: gw.title, ends }),
        allowedMentions: { roles: settings.notifyRole ? [settings.notifyRole] : [] },
      });
      await sendGuildLog(client, settings, t(gw.guildId, 'log.reminder', { id: gw.id, title: gw.title }));
    } catch (err) {
      logger.warn(`Reminder(${gw.id}):`, err?.message ?? err);
    }
  }
}

/**
 * Ein Durchlauf: Reminder posten, fällige Giveaways beenden.
 * Exportiert als `runSchedulerTick`, damit Tests einen Tick deterministisch
 * auslösen können, statt 10 Sekunden auf das Intervall zu warten.
 */
async function tick(client) {
  await sendReminders(client);

  let due;
  try {
    due = await prisma.giveaway.findMany({
      where: { status: 'ACTIVE', endAt: { lte: new Date() } },
    });
  } catch (err) {
    logger.error('Scheduler-Tick (DB-Fehler):', err?.message ?? err);
    return;
  }

  for (const giveaway of due) {
    // endGiveaway claims ACTIVE -> ENDED atomically in the database and only
    // continues when that claim wins, so overlapping ticks, /gend and the
    // dashboard cannot end the same giveaway twice.
    await endGiveaway(giveaway, client);
  }
}

/** Startet das Poll-Intervall. */
export function startScheduler(client) {
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    tick(client).catch((err) => logger.error('Scheduler:', err));
  }, TICK_MS);
  logger.info(`Scheduler gestartet (Intervall ${TICK_MS / 1000}s).`);
  // Sofort einen ersten Tick, damit nach Neustart abgelaufene Giveaways direkt enden.
  tick(client).catch((err) => logger.error('Scheduler (initial):', err));
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

export { tick as runSchedulerTick };

export default startScheduler;
