// Poll-basierter, restart-sicherer Scheduler.
// Alle 10s: fällige ACTIVE-Giveaways finden und beenden (gleiche Logik wie /gend).
import { prisma } from '../database/prisma.js';
import { logger } from '../utils/logger.js';
import { endGiveaway } from './giveawayService.js';

const TICK_MS = 10_000;
let timer = null;

async function tick(client) {
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
    // endGiveaway ist durch einen In-Memory-Lock gegen Doppel-Beendigung geschützt.
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

export default startScheduler;
