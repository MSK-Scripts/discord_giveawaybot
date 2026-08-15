// Giveaway CRUD, winner draw, ending (double-ending guarded by a DB claim).
import { MessageFlags } from 'discord.js';
import { prisma } from '../database/prisma.js';
import { logger } from '../utils/logger.js';
import { getSettings } from './settingsService.js';
import { buildGiveawayEmbed, buildEndedEmbed, buildCancelledEmbed, buildButtonRow, buildResultContent, buildRerollContent } from '../utils/embeds.js';
import { checkEligibility, ticketWeight, mergeGiveawayEligibility } from '../utils/eligibility.js';
import { giveawayPrizes, prizesForWinner, assignPrizes, serializePrizes, normalizePrizeMode, inlinePrizes, bulletList } from '../utils/prizes.js';
import { generateGiveawayId } from '../utils/id.js';
import { publishResult } from './resultPublisher.js';
import { issueCoupons, revokeCoupons } from './tebexService.js';
import { t } from '../utils/i18n.js';

export async function createGiveaway(data) {
  return prisma.giveaway.create({ data });
}

export async function getGiveaway(id, guildId) {
  return prisma.giveaway.findFirst({ where: { id, guildId } });
}

/** Per-Giveaway Blacklist-Rollen setzen (Array -> JSON). */
export async function setGiveawayBlacklistRoles(id, roles) {
  return prisma.giveaway.update({ where: { id }, data: { blacklistRoles: JSON.stringify(roles) } });
}

/** Per-Giveaway Whitelist-Rollen setzen (Array -> JSON). */
export async function setGiveawayWhitelistRoles(id, roles) {
  return prisma.giveaway.update({ where: { id }, data: { whitelistRoles: JSON.stringify(roles) } });
}

/** Per-Giveaway Bonus-Lose setzen (Objekt RoleId->Anzahl -> JSON). */
export async function setGiveawayBonusRoles(id, bonus) {
  return prisma.giveaway.update({ where: { id }, data: { bonusRoles: JSON.stringify(bonus) } });
}

export async function listActive(guildId) {
  return prisma.giveaway.findMany({
    where: { guildId, status: 'ACTIVE' },
    orderBy: { endAt: 'asc' },
  });
}

export async function countEntries(giveawayId) {
  return prisma.entry.count({ where: { giveawayId } });
}

/**
 * Gewinner mit ihrem Preis-Slot, in der Reihenfolge der Preise.
 * @returns {Promise<{userId: string, prizeIndex: number|null}[]>}
 */
export async function getWinners(giveawayId, { onlyActive = false } = {}) {
  return prisma.winner.findMany({
    where: { giveawayId, ...(onlyActive ? { rerolled: false } : {}) },
    select: { userId: true, prizeIndex: true },
    orderBy: [{ prizeIndex: 'asc' }, { pickedAt: 'asc' }],
  });
}

export async function getWinnerIds(giveawayId, { onlyActive = false } = {}) {
  const winners = await getWinners(giveawayId, { onlyActive });
  return winners.map((w) => w.userId);
}

/**
 * Toggles a participation.
 *
 * Read-then-write with an await in between, so two clicks from the same user
 * (double click, or two devices) run into each other. The unique constraint
 * keeps the data correct either way — what is at stake is whether the losing
 * click answers the user with an error.
 *
 * Same rule as `ensureRow` in settingsService: after a failed write the state
 * decides, not the error code. The collision arrives as P2002 for the insert
 * and as a code-less error carrying MySQL 1020 for the delete.
 *
 * @returns {'added'|'removed'}
 */
export async function addOrRemoveEntry(giveawayId, userId) {
  const where = { giveawayId_userId: { giveawayId, userId } };
  const existing = await prisma.entry.findUnique({ where });

  if (existing) {
    // deleteMany, not delete: a concurrent delete makes delete fail, while
    // deleteMany simply reports count 0 — and the row is gone either way.
    await prisma.entry.deleteMany({ where: { giveawayId, userId } });
    return 'removed';
  }

  try {
    await prisma.entry.create({ data: { giveawayId, userId } });
  } catch (err) {
    const row = await prisma.entry.findUnique({ where });
    if (!row) throw err; // the write failed for some other reason
  }
  return 'added';
}

export async function cancelGiveaway(id, guildId) {
  return prisma.giveaway.update({
    where: { id },
    data: { status: 'CANCELLED', endedAt: new Date() },
  });
}

function shuffle(arr) {
  // Fisher-Yates
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Zieht Gewinner. Prüft nachträglich Teilnahmebedingungen (Blacklist/Whitelist/
 * Account-Alter/Server-Zugehörigkeit), berücksichtigt Bonus-Lose (gewichtete
 * Ziehung) und überspringt Mitglieder, die nicht mehr in der Guild sind.
 * Kein GuildMembers-Intent nötig.
 * @returns {Promise<string[]>} userIds der Gewinner
 */
export async function drawWinners(giveaway, guild, settings, { exclude = [] } = {}) {
  const entries = await prisma.entry.findMany({ where: { giveawayId: giveaway.id } });
  let pool = entries.map((e) => e.userId).filter((id) => !exclude.includes(id));
  if (pool.length === 0) return [];

  // Bulk-Fetch (ein REST-Call) mit Einzel-Fallback.
  let membersMap = null;
  try {
    membersMap = await guild.members.fetch({ user: pool });
  } catch {
    membersMap = null;
  }

  // Serverweite + per-Giveaway Blacklist/Whitelist zusammenführen.
  const effective = mergeGiveawayEligibility(settings, giveaway);

  // Gültige Teilnehmer mit Gewicht (1 + Bonus-Lose) sammeln.
  const tickets = []; // userId pro Los (gewichtet)
  for (const id of pool) {
    let member = membersMap?.get(id) ?? null;
    if (!member) {
      try {
        member = await guild.members.fetch(id);
      } catch {
        continue; // 10007 Unknown Member -> nicht mehr in Guild -> überspringen
      }
    }
    if (!checkEligibility(member, effective).ok) continue;
    const weight = ticketWeight(member, effective);
    for (let i = 0; i < weight; i++) tickets.push(id);
  }

  if (tickets.length === 0) return [];

  // Gewichtete Ziehung ohne Zurücklegen: Lose mischen, eindeutige Gewinner sammeln.
  shuffle(tickets);
  const winners = [];
  const seen = new Set();
  for (const id of tickets) {
    if (seen.has(id)) continue;
    seen.add(id);
    winners.push(id);
    if (winners.length >= giveaway.winnersCount) break;
  }
  return winners;
}

// ── Live-Update der Teilnehmerzahl im aktiven Embed (gedrosselt) ──────────────
// Pro Giveaway max. ~1 Edit / THROTTLE_MS; ein Trailing-Edit stellt sicher, dass
// der zuletzt gültige Stand abgebildet wird (Discord-Rate-Limits schonen).
const EMBED_THROTTLE_MS = 4000;
const embedThrottle = new Map(); // giveawayId -> { last: number, timer: NodeJS.Timeout|null }

async function refreshActiveEmbed(client, giveaway, settings) {
  try {
    if (!giveaway.messageId) return;
    const fresh = await prisma.giveaway.findUnique({ where: { id: giveaway.id } });
    if (!fresh || fresh.status !== 'ACTIVE') return; // beendete/abgebrochene nicht anfassen
    const channel = await client.channels.fetch(giveaway.channelId);
    const msg = await channel.messages.fetch(giveaway.messageId);
    const entryCount = await countEntries(giveaway.id);
    await msg.edit({
      embeds: [buildGiveawayEmbed(fresh, settings, { entryCount })],
      components: [buildButtonRow(fresh, settings, { disabled: false })],
    });
  } catch (err) {
    logger.warn(`refreshActiveEmbed(${giveaway.id}):`, err?.message ?? err);
  }
}

/** Plant ein gedrosseltes Embed-Update (fire-and-forget). */
export function scheduleEmbedRefresh(client, giveaway, settings) {
  const id = giveaway.id;
  const state = embedThrottle.get(id) ?? { last: 0, timer: null };
  embedThrottle.set(id, state);

  if (state.timer) return; // ein Trailing-Edit ist bereits eingeplant -> deckt neuesten Stand ab

  const sinceLast = Date.now() - state.last;
  const run = async () => {
    state.timer = null;
    state.last = Date.now();
    await refreshActiveEmbed(client, giveaway, settings);
  };

  if (sinceLast >= EMBED_THROTTLE_MS) {
    run(); // Leading-Edit sofort
  } else {
    state.timer = setTimeout(run, EMBED_THROTTLE_MS - sinceLast); // Trailing-Edit
  }
}

/** Link zur Giveaway-Nachricht (oder null). */
function messageLink(giveaway) {
  if (!giveaway.messageId) return null;
  return `https://discord.com/channels/${giveaway.guildId}/${giveaway.channelId}/${giveaway.messageId}`;
}

/**
 * Schickt jedem Gewinner eine DM (Preis + optionaler Claim-Hinweis + Link).
 * Fehler werden ignoriert.
 *
 * `winners` sind Objekte { userId, prizeIndex }: im INDIVIDUAL-Modus bekommt
 * jeder einen anderen Preis genannt, der Preisteil kann also nicht wie der Rest
 * einmal vorab gebaut werden.
 *
 * `coupons` ist eine Map userId -> { code, expiresAt }. Der Code ist pro
 * Gewinner verschieden und darf deshalb NICHT in den gemeinsamen Textteil.
 */
export async function dmWinners(client, giveaway, settings, winners, { resultUrl = null, coupons = null } = {}) {
  if (!winners?.length) return;
  const g = giveaway.guildId;
  const guildName = client.guilds.cache.get(g)?.name ?? '';
  const link = messageLink(giveaway);
  const prizes = giveawayPrizes(giveaway);

  // Alles, was für alle Gewinner gleich ist.
  let tail = '';
  if (settings.claimMessage) tail += `\n${settings.claimMessage}`;
  if (link) tail += `\n${t(g, 'dm.winner_link', { link })}`;
  if (resultUrl) tail += `\n${t(g, 'result.link', { url: resultUrl })}`;

  for (const { userId, prizeIndex } of winners) {
    const own = prizesForWinner(prizes, giveaway.prizeMode, prizeIndex);
    // Ohne Preisangabe bleibt es beim bisherigen Verhalten: der Titel steht für den Preis.
    let content = own.length > 1
      ? t(g, 'dm.winner_multi', { prizes: bulletList(own), guild: guildName })
      : t(g, 'dm.winner', { prize: own[0] ?? giveaway.title, guild: guildName });
    content += tail;

    const coupon = coupons?.get(userId);
    if (coupon) {
      content += `\n\n${t(g, 'dm.coupon', { code: coupon.code, percent: giveaway.couponPercent })}`;
      content += coupon.expiresAt
        ? `\n${t(g, 'dm.coupon_expires', { date: new Date(coupon.expiresAt).toLocaleDateString('en-CA') })}`
        : `\n${t(g, 'dm.coupon_forever')}`;
      if (settings.tebexStoreUrl) content += `\n${t(g, 'dm.coupon_store', { url: settings.tebexStoreUrl })}`;
    }

    try {
      const user = await client.users.fetch(userId);
      await user.send({ content, flags: MessageFlags.SuppressEmbeds });
    } catch {
      // DMs deaktiviert / blockiert -> überspringen
    }
  }
}

/** Original-Nachricht editieren (Button disabled, Ended-Embed) + Ergebnis posten. */
async function finalizeMessages(client, giveaway, settings, winners, { resultUrl = null, coupons = null } = {}) {
  const entryCount = await countEntries(giveaway.id);
  let channel = null;
  try {
    channel = await client.channels.fetch(giveaway.channelId);
  } catch {
    channel = null;
  }
  if (!channel) return;

  // Original-Embed aktualisieren (gelöschte Nachricht abfangen).
  if (giveaway.messageId) {
    try {
      const msg = await channel.messages.fetch(giveaway.messageId);
      await msg.edit({
        embeds: [buildEndedEmbed(giveaway, settings, { winners, entryCount })],
        components: [buildButtonRow(giveaway, settings, { disabled: true })],
      });
    } catch (err) {
      logger.warn(`finalizeMessages: konnte Original-Nachricht ${giveaway.messageId} nicht editieren:`, err?.message ?? err);
    }
  }

  // Ergebnis-Nachricht posten (mit optionalem Link zur öffentlichen Ergebnis-Seite).
  try {
    let content = buildResultContent(giveaway, winners, entryCount);
    if (resultUrl) content += `\n${t(giveaway.guildId, 'result.link', { url: resultUrl })}`;
    await channel.send({
      content,
      allowedMentions: { users: winners.map((w) => w.userId) },
      flags: MessageFlags.SuppressEmbeds,
    });
  } catch (err) {
    logger.warn(`finalizeMessages: konnte Ergebnis nicht senden:`, err?.message ?? err);
  }

  // Gewinner per DM benachrichtigen (fire-and-forget, Fehler werden geschluckt).
  // Der Coupon-Code steht bewusst NUR hier und nicht in der öffentlichen
  // Ergebnis-Nachricht.
  await dmWinners(client, giveaway, settings, winners, { resultUrl, coupons });
}

/**
 * Ends an active giveaway: draws winners, sets the status, posts the result.
 *
 * Idempotent through an atomic database claim: the ACTIVE -> ENDED transition is a
 * single UPDATE statement, and only the caller whose UPDATE hits a row continues.
 * That holds across processes. An in-memory lock would not: the draw sits between
 * the status check and the status change and spends seconds on REST calls, and in
 * that window a second instance would end the same giveaway twice.
 *
 * The claim deliberately happens BEFORE the draw. If anything fails afterwards the
 * giveaway is ended but has no winner message, which `/greroll <id>` (or
 * `rerollAll`) can fix, since both work on ENDED giveaways and exclude winners
 * that were already recorded. The opposite case, a prize handed out twice, could
 * not be repaired.
 *
 * @returns {Promise<string[]|null>} winnerIds, or null when there was nothing to do
 */
export async function endGiveaway(giveaway, client) {
  const id = giveaway.id;

  let claimed;
  try {
    claimed = await prisma.giveaway.updateMany({
      where: { id, status: 'ACTIVE' },
      data: { status: 'ENDED', endedAt: new Date() },
    });
  } catch (err) {
    logger.error(`endGiveaway(${id}): claim failed:`, err);
    return null;
  }
  if (claimed.count === 0) return null; // already ended/cancelled, or another claim won

  try {
    const fresh = await prisma.giveaway.findUnique({ where: { id } });
    if (!fresh) return null; // deleted between claim and re-read

    const settings = await getSettings(fresh.guildId);
    const guild = await client.guilds.fetch(fresh.guildId).catch(() => null);

    let winnerIds = [];
    if (guild) winnerIds = await drawWinners(fresh, guild, settings, {});

    // Ziehungsreihenfolge = Preisreihenfolge: der erste Gezogene bekommt Preis 1.
    const winners = assignPrizes(winnerIds, fresh.prizeMode);

    if (winners.length) {
      await prisma.winner.createMany({
        data: winners.map(({ userId, prizeIndex }) => ({ giveawayId: id, userId, prizeIndex })),
        skipDuplicates: true,
      });
    }

    // Publish the public result page (returns the URL, or null).
    const resultUrl = await publishResult(client, fresh, settings, winners);

    // Tebex-Coupons: ein eigener Code pro Gewinner, im Store der Guild.
    // No-op, wenn die Guild kein Secret hinterlegt oder das Giveaway keinen
    // Rabatt konfiguriert hat. Fehler brechen das Beenden nicht ab.
    const coupons = await issueCoupons(settings, fresh, winnerIds);

    await finalizeMessages(client, fresh, settings, winners, { resultUrl, coupons });
    await sendGuildLog(client, settings, t(fresh.guildId, 'log.ended', {
      id, title: fresh.title, count: winnerIds.length,
    }));
    if (coupons.size) {
      await sendGuildLog(client, settings, t(fresh.guildId, 'log.coupons', {
        id, count: coupons.size, percent: fresh.couponPercent,
      }));
    }
    return winnerIds;
  } catch (err) {
    logger.error(`endGiveaway(${id}): failed after the claim, giveaway stays ENDED. Draw again with /greroll ${id}:`, err);
    return [];
  }
}

// ── Logging-Channel pro Guild ────────────────────────────────────────────────
/** Postet eine Log-Zeile in den konfigurierten Log-Channel (ohne Pings). */
export async function sendGuildLog(client, settings, content) {
  if (!settings?.logChannel) return;
  try {
    const ch = await client.channels.fetch(settings.logChannel);
    await ch.send({ content, allowedMentions: { parse: [] } });
  } catch (err) {
    logger.warn('sendGuildLog:', err?.message ?? err);
  }
}

// ── Gemeinsame Erstellung (Modal + Vorlage nutzen dies) ──────────────────────
/**
 * Legt ein Giveaway an, postet die Nachricht und speichert die messageId.
 * Bei Sende-Fehler wird der DB-Eintrag wieder entfernt (kein verwaistes Giveaway).
 * @returns {Promise<string>} die Giveaway-ID
 */
export async function postGiveaway(client, channel, settings, { guildId, hostId, title, description, prizes = [], prizeMode = 'ALL', winnersCount, endAt }) {
  const id = await generateGiveawayId();
  // Im INDIVIDUAL-Modus ist die Gewinnerzahl die Anzahl der Preise, nicht die
  // Eingabe. Hier zentral aufgelöst, damit keine Aufrufstelle es vergessen kann.
  const mode = normalizePrizeMode(prizeMode);
  const prizeList = Array.isArray(prizes) ? prizes : [];
  const winners = mode === 'INDIVIDUAL' && prizeList.length ? prizeList.length : winnersCount;
  // "Ending soon"-Reminder einplanen, falls in der Guild aktiviert und noch in der Zukunft.
  const reminderMin = Number(settings.reminderMinutes) || 0;
  let reminderAt = null;
  if (reminderMin > 0) {
    const r = new Date(endAt.getTime() - reminderMin * 60000);
    if (r.getTime() > Date.now()) reminderAt = r;
  }
  const giveaway = await createGiveaway({
    id, guildId, channelId: channel.id, hostId, title, description,
    prizes: serializePrizes(prizeList), prizeMode: mode,
    winnersCount: winners, endAt, status: 'ACTIVE', reminderAt,
  });
  try {
    const content = settings.notifyRole ? `<@&${settings.notifyRole}>` : undefined;
    const msg = await channel.send({
      content,
      embeds: [buildGiveawayEmbed(giveaway, settings, { entryCount: 0 })],
      components: [buildButtonRow(giveaway, settings, { disabled: false })],
      allowedMentions: { roles: settings.notifyRole ? [settings.notifyRole] : [] },
    });
    await prisma.giveaway.update({ where: { id }, data: { messageId: msg.id } });
    await sendGuildLog(client, settings, t(guildId, 'log.created', { id, title, user: `<@${hostId}>` }));
    return id;
  } catch (err) {
    await prisma.giveaway.delete({ where: { id } }).catch(() => {});
    throw err;
  }
}

// ── Pause / Resume ───────────────────────────────────────────────────────────
/** Aktualisiert die aktive Giveaway-Nachricht (Embed + Button-Status). */
export async function editActiveMessage(client, giveaway, settings, { disabled = false, paused = false } = {}) {
  if (!giveaway.messageId) return;
  try {
    const channel = await client.channels.fetch(giveaway.channelId);
    const msg = await channel.messages.fetch(giveaway.messageId);
    const entryCount = await countEntries(giveaway.id);
    const embed = buildGiveawayEmbed(giveaway, settings, { entryCount });
    if (paused) embed.setTitle(`⏸️ ${giveaway.title}`);
    await msg.edit({ embeds: [embed], components: [buildButtonRow(giveaway, settings, { disabled })] });
  } catch (err) {
    logger.warn(`editActiveMessage(${giveaway.id}):`, err?.message ?? err);
  }
}

/** Pausiert ein aktives Giveaway (Button deaktiviert, Timer eingefroren). */
export async function pauseGiveaway(client, giveaway, settings) {
  const updated = await prisma.giveaway.update({
    where: { id: giveaway.id },
    data: { status: 'PAUSED', pausedAt: new Date() },
  });
  await editActiveMessage(client, updated, settings, { disabled: true, paused: true });
  await sendGuildLog(client, settings, t(giveaway.guildId, 'log.paused', { id: giveaway.id, title: giveaway.title }));
  return updated;
}

/** Setzt ein pausiertes Giveaway fort und verlängert endAt um die Pausendauer. */
export async function resumeGiveaway(client, giveaway, settings) {
  const pausedMs = giveaway.pausedAt ? Date.now() - new Date(giveaway.pausedAt).getTime() : 0;
  const newEndAt = new Date(new Date(giveaway.endAt).getTime() + pausedMs);
  const updated = await prisma.giveaway.update({
    where: { id: giveaway.id },
    data: { status: 'ACTIVE', pausedAt: null, endAt: newEndAt },
  });
  await editActiveMessage(client, updated, settings, { disabled: false, paused: false });
  await sendGuildLog(client, settings, t(giveaway.guildId, 'log.resumed', { id: giveaway.id, title: giveaway.title }));
  return updated;
}

// ── Einzelnen Gewinner ersetzen ──────────────────────────────────────────────
/**
 * Ersetzt EINEN Gewinner eines beendeten Giveaways durch einen neuen (zieht 1,
 * schließt alle bisherigen Gewinner aus). Markiert den alten als rerolled.
 *
 * Der Ersatz erbt den Preis-Slot des Ersetzten. Würde er stattdessen hinten
 * angehängt, verschöbe sich im INDIVIDUAL-Modus die Zuordnung aller übrigen
 * Gewinner, obwohl an deren Preis nichts geändert wurde.
 *
 * @returns {Promise<{userId: string, prizeIndex: number|null}|null>} der neue
 *          Gewinner oder null (kein gültiger Ersatz)
 */
export async function replaceWinner(giveaway, guild, settings, oldUserId) {
  const current = await getWinners(giveaway.id); // alle bisherigen Gewinner ausschließen
  const drawn = await drawWinners(giveaway, guild, settings, { exclude: current.map((w) => w.userId) });
  const newWinner = drawn[0] ?? null;

  // Kein gültiger Ersatz -> alten Gewinner NICHT verändern (sonst Dateninkonsistenz).
  if (!newWinner) return null;

  const prizeIndex = current.find((w) => w.userId === oldUserId)?.prizeIndex ?? null;

  await prisma.winner.updateMany({
    where: { giveawayId: giveaway.id, userId: oldUserId },
    data: { rerolled: true },
  });
  await prisma.winner.upsert({
    where: { giveawayId_userId: { giveawayId: giveaway.id, userId: newWinner } },
    update: { rerolled: false, prizeIndex },
    create: { giveawayId: giveaway.id, userId: newWinner, prizeIndex },
  });
  return { userId: newWinner, prizeIndex };
}

// ── Abbrechen mit Discord-Finalisierung (Command + Dashboard teilen sich dies) ─
/**
 * Bricht ein aktives Giveaway ab: Status CANCELLED, Original-Nachricht auf
 * "Cancelled" + Button disabled, Log-Eintrag. Kein Gewinner, keine DMs.
 * @param {string} actor Mention/Label des Auslösers (für den Log)
 * @returns {Promise<object>} das aktualisierte Giveaway
 */
export async function cancelAndFinalize(client, giveaway, settings, { actor } = {}) {
  const updated = await cancelGiveaway(giveaway.id, giveaway.guildId);
  if (giveaway.messageId) {
    try {
      const channel = await client.channels.fetch(giveaway.channelId);
      const msg = await channel.messages.fetch(giveaway.messageId);
      await msg.edit({
        embeds: [buildCancelledEmbed(giveaway, settings)],
        components: [buildButtonRow(giveaway, settings, { disabled: true })],
      });
    } catch (err) {
      logger.warn(`cancelAndFinalize(${giveaway.id}): Original-Nachricht nicht editierbar:`, err?.message ?? err);
    }
  }
  await sendGuildLog(client, settings, t(giveaway.guildId, 'log.cancelled', { id: giveaway.id, title: giveaway.title, user: actor }));
  return updated;
}

// ── Reroll (Command + Dashboard teilen sich dies) ────────────────────────────
/**
 * Zieht ALLE Gewinner eines beendeten Giveaways neu (schließt bisherige aus),
 * postet die Ergebnis-Nachricht, schickt DMs, loggt und aktualisiert die
 * öffentliche Ergebnis-Seite.
 * @returns {Promise<string[]>} neue Gewinner-IDs (leer = kein gültiger Ersatz)
 */
export async function rerollAll(client, giveaway, settings, { actor } = {}) {
  const guild = await client.guilds.fetch(giveaway.guildId).catch(() => null);
  const previousWinners = await getWinnerIds(giveaway.id);
  const newWinnerIds = guild ? await drawWinners(giveaway, guild, settings, { exclude: previousWinners }) : [];
  if (newWinnerIds.length === 0) return [];

  // Alle Gewinner sind neu, also werden auch die Preis-Slots neu vergeben.
  const newWinners = assignPrizes(newWinnerIds, giveaway.prizeMode);

  await prisma.winner.updateMany({ where: { giveawayId: giveaway.id }, data: { rerolled: true } });
  await prisma.winner.createMany({
    data: newWinners.map(({ userId, prizeIndex }) => ({ giveawayId: giveaway.id, userId, prizeIndex })),
    skipDuplicates: true,
  });

  // Die alten Gewinner verlieren ihren Coupon, die neuen bekommen einen eigenen.
  await revokeCoupons(settings, giveaway, previousWinners);
  const coupons = await issueCoupons(settings, giveaway, newWinnerIds);

  const resultUrl = await publishResult(client, giveaway, settings, newWinners);

  try {
    const channel = await client.channels.fetch(giveaway.channelId);
    let content = buildRerollContent(giveaway, newWinners);
    if (resultUrl) content += `\n${t(giveaway.guildId, 'result.link', { url: resultUrl })}`;
    await channel.send({ content, allowedMentions: { users: newWinnerIds }, flags: MessageFlags.SuppressEmbeds });
  } catch (err) {
    logger.warn(`rerollAll(${giveaway.id}): Nachricht konnte nicht gepostet werden:`, err?.message ?? err);
  }

  await dmWinners(client, giveaway, settings, newWinners, { resultUrl, coupons });
  await sendGuildLog(client, settings, t(giveaway.guildId, 'log.rerolled', { id: giveaway.id, title: giveaway.title, user: actor }));
  return newWinnerIds;
}

/**
 * Ersetzt EINEN Gewinner eines beendeten Giveaways. Postet Hinweis, DM, Log und
 * aktualisiert die öffentliche Ergebnis-Seite.
 * @returns {Promise<{newWinner?:string, error?:'not_winner'|'no_valid'}>}
 */
export async function rerollSingle(client, giveaway, settings, oldUserId, { actor } = {}) {
  const activeWinners = await getWinnerIds(giveaway.id, { onlyActive: true });
  if (!activeWinners.includes(oldUserId)) return { error: 'not_winner' };

  const guild = await client.guilds.fetch(giveaway.guildId).catch(() => null);
  const replacement = guild ? await replaceWinner(giveaway, guild, settings, oldUserId) : null;
  if (!replacement) return { error: 'no_valid' };
  const newWinner = replacement.userId;

  // Nur der ersetzte Gewinner verliert seinen Coupon, die übrigen behalten ihren.
  await revokeCoupons(settings, giveaway, [oldUserId]);
  const coupons = await issueCoupons(settings, giveaway, [newWinner]);

  const resultUrl = await publishResult(client, giveaway, settings, await getWinners(giveaway.id, { onlyActive: true }));

  try {
    const channel = await client.channels.fetch(giveaway.channelId);
    // Im INDIVIDUAL-Modus gehört zur Meldung der Preis, um den es geht.
    const own = prizesForWinner(giveawayPrizes(giveaway), giveaway.prizeMode, replacement.prizeIndex);
    const key = normalizePrizeMode(giveaway.prizeMode) === 'INDIVIDUAL' && own.length ? 'reroll.replaced_prize' : 'reroll.replaced';
    await channel.send({
      content: t(giveaway.guildId, key, {
        old: `<@${oldUserId}>`, new: `<@${newWinner}>`, title: giveaway.title, prize: inlinePrizes(own),
      }),
      allowedMentions: { users: [newWinner] },
    });
  } catch (err) {
    logger.warn(`rerollSingle(${giveaway.id}): Nachricht konnte nicht gepostet werden:`, err?.message ?? err);
  }

  await dmWinners(client, giveaway, settings, [replacement], { resultUrl, coupons });
  await sendGuildLog(client, settings, t(giveaway.guildId, 'log.rerolled', { id: giveaway.id, title: giveaway.title, user: actor }));
  return { newWinner };
}

// ── Statistik pro Guild ──────────────────────────────────────────────────────
export async function getGuildStats(guildId) {
  const [active, paused, ended, cancelled, entries, winners] = await prisma.$transaction([
    prisma.giveaway.count({ where: { guildId, status: 'ACTIVE' } }),
    prisma.giveaway.count({ where: { guildId, status: 'PAUSED' } }),
    prisma.giveaway.count({ where: { guildId, status: 'ENDED' } }),
    prisma.giveaway.count({ where: { guildId, status: 'CANCELLED' } }),
    prisma.entry.count({ where: { giveaway: { guildId } } }),
    prisma.winner.count({ where: { giveaway: { guildId }, rerolled: false } }),
  ]);
  return { total: active + paused + ended + cancelled, active, paused, ended, cancelled, entries, winners };
}
