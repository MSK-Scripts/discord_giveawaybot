// Schlanker, NUR an localhost gebundener HTTP-Steuer-Endpunkt für das
// msk-shop Web-Dashboard. Alle Mutationen laufen über die bestehenden
// Service-Funktionen, damit Discord-Seiteneffekte (Embed/Button/DMs/Log) und
// der Settings-Cache konsistent bleiben (Single Source of Truth = der Bot).
//
// Sicherheit: bindet an 127.0.0.1 (von außen nicht erreichbar, keine UFW-Regel),
// zusätzlich Shared-Secret-Header (X-Control-Secret, timing-safe) + Prüfung,
// dass der Bot tatsächlich in der angefragten Guild ist.
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { prisma } from '../database/prisma.js';
import { logger } from '../utils/logger.js';
import { getSettings, updateSettings, evict } from './settingsService.js';
import {
  getGiveaway,
  postGiveaway,
  scheduleGiveaway,
  editActiveMessage,
  endGiveaway,
  cancelAndFinalize,
  pauseGiveaway,
  resumeGiveaway,
  rerollAll,
  rerollSingle,
  sendGuildLog,
  refreshActiveEmbeds,
  deleteGiveaway,
  countIssuedCoupons,
  getGuildHistory,
  DELETABLE_STATUSES,
  HISTORY_DEFAULT_DAYS,
  HISTORY_MAX_DAYS,
  EMBED_SETTINGS_KEYS,
} from './giveawayService.js';
import { verifySecret, listPackages } from './tebexService.js';
import {
  listTemplates, getTemplate, getTemplateById, saveTemplate, updateTemplateById,
  deleteTemplateById, countTemplates, normalizeTemplateInput, serializeTemplate,
  templateInputFromGiveaway, MAX_TEMPLATES,
} from './templateService.js';
import {
  normalizePrizeInput, normalizePrizeMode, parsePrizes, serializePrizes,
  parseSlotNumbers, serializeSlotNumbers, parseSlotStrings, serializeSlotStrings, MAX_PRIZES,
} from '../utils/prizes.js';
import { normalizeWinnerMode, WINNER_MODES } from '../utils/winnerMode.js';
import {
  normalizeRoleArray, normalizeBonusRoles, serializeRoleArray, serializeBonusRoles,
} from '../utils/roles.js';
import { overrides } from '../utils/eligibility.js';
import { encryptSecret, decryptSecret, secretHint, checkEncryptionKey } from '../utils/secretBox.js';
import { parseDuration } from '../utils/duration.js';
import { userProfile } from '../utils/profile.js';
import { parseStartAt } from '../utils/schedule.js';
import { t, SUPPORTED_LANGS } from '../utils/i18n.js';

let server = null;
const GUILD_RE = /^\d{17,20}$/;
const USER_RE = /^\d{17,20}$/;
const ID_RE = /^[A-Z0-9]{4,12}$/;
const ACTOR = '🌐 Dashboard';
const TOO_LARGE = Symbol('too_large'); // Sentinel: Body-Limit überschritten (kann von JSON.parse nie erzeugt werden)

const SETTINGS_KEYS = [
  'lang', 'embedColor', 'buttonEmoji', 'buttonStyle', 'blacklist', 'whitelist',
  'bonusRoles', 'minAccountDays', 'minMemberDays', 'managerRole', 'notifyRole',
  'logChannel', 'reminderMinutes', 'claimMessage',
];

/**
 * Settings für das Dashboard aufbereiten.
 *
 * Das verschlüsselte Tebex-Secret verlässt den Bot NIE über diesen Weg. Nach
 * außen geht nur, ob eines hinterlegt ist, die letzten vier Zeichen und wann es
 * gesetzt wurde. Den Klartext gibt es ausschließlich über /tebex/reveal, und
 * das nur für den Guild-Besitzer.
 */
function publicSettings(settings) {
  const { tebexSecret, tebexSecretHint, tebexSecretSetAt, ...rest } = settings;
  return {
    ...rest,
    tebex: {
      configured: Boolean(tebexSecret),
      hint: tebexSecretHint ?? null,
      setAt: tebexSecretSetAt ? new Date(tebexSecretSetAt).toISOString() : null,
    },
  };
}

/**
 * Ist dieser User der Besitzer der Guild?
 *
 * Bewusst gegen Discord geprüft (`guild.ownerId`) und nicht gegen ein Flag, das
 * der Shop mitschickt. Der Shop ist zwar authentifiziert, aber die Besitzer-
 * Eigenschaft ist hier die einzige Schranke vor einem Vollzugriffs-Schlüssel,
 * und die soll nicht davon abhängen, dass eine zweite Anwendung richtig filtert.
 */
async function isGuildOwner(client, guildId, userId) {
  if (!USER_RE.test(String(userId ?? ''))) return false;
  const guild = client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId).catch(() => null));
  return Boolean(guild) && guild.ownerId === String(userId);
}

function secretOk(req) {
  const secret = process.env.CONTROL_SECRET || '';
  const provided = req.headers['x-control-secret'] || '';
  if (!secret || !provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body ?? {}));
}

function readJson(req) {
  return new Promise((resolve) => {
    let data = '';
    let tooLarge = false;
    req.on('data', (c) => {
      if (tooLarge) return;            // weitere Chunks verwerfen, Socket NICHT zerstören
      data += c;
      if (data.length > 1_000_000) tooLarge = true; // 1 MB Schutz
    });
    req.on('end', () => {
      if (tooLarge) return resolve(TOO_LARGE);
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { resolve(null); }
    });
    req.on('error', () => resolve(null));
  });
}

/** Date -> ISO, JSON-Spalten -> Array/Objekt für das Dashboard. */
function serializeGiveaway(g, extra = {}) {
  const arr = (v) => { try { const x = JSON.parse(v ?? '[]'); return Array.isArray(x) ? x : []; } catch { return []; } };
  const obj = (v) => { try { const x = JSON.parse(v ?? '{}'); return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; } catch { return {}; } };
  return {
    id: g.id,
    guildId: g.guildId,
    channelId: g.channelId,
    messageId: g.messageId,
    hostId: g.hostId,
    title: g.title,
    description: g.description,
    prizes: parsePrizes(g.prizes),
    prizeMode: normalizePrizeMode(g.prizeMode),
    winnerMode: normalizeWinnerMode(g.winnerMode),
    winnersCount: g.winnersCount,
    status: g.status,
    // Planned start of a SCHEDULED giveaway (null for one posted right away).
    startAt: g.startAt ? new Date(g.startAt).toISOString() : null,
    endAt: g.endAt ? new Date(g.endAt).toISOString() : null,
    pausedAt: g.pausedAt ? new Date(g.pausedAt).toISOString() : null,
    createdAt: g.createdAt ? new Date(g.createdAt).toISOString() : null,
    endedAt: g.endedAt ? new Date(g.endedAt).toISOString() : null,
    // null heißt: das Giveaway hat nichts Eigenes, es gilt die serverweite
    // Einstellung. Das Dashboard braucht den Unterschied zu einer leeren Liste,
    // sonst kann es "erbt" nicht von "hier gilt bewusst keine" unterscheiden.
    blacklistRoles: overrides(g.blacklistRoles) ? arr(g.blacklistRoles) : null,
    whitelistRoles: overrides(g.whitelistRoles) ? arr(g.whitelistRoles) : null,
    bonusRoles: overrides(g.bonusRoles) ? obj(g.bonusRoles) : null,
    couponPercent: g.couponPercent ?? null,
    couponPackages: arr(g.couponPackages),
    couponPackagesPerPrize: parseSlotNumbers(g.couponPackagesPerPrize),
    couponManualCode: g.couponManualCode ?? null,
    couponManualCodesPerPrize: parseSlotStrings(g.couponManualCodesPerPrize),
    couponManualNote: g.couponManualNote ?? null,
    couponValidDays: g.couponValidDays ?? null,
    ...extra,
  };
}

/**
 * Prüft die Bedingungs-Felder je Giveaway aus dem Dashboard.
 *
 * Dieselben drei Angaben gibt es serverweit in den Settings. Was hier ankommt,
 * ERSETZT sie für dieses eine Giveaway (aufgelöst in resolveGiveawayEligibility).
 * `null` ist deshalb ein eigener Fall und keine leere Liste: es heißt "nichts
 * eigenes, nimm die serverweite Einstellung".
 *
 * Rückgabe sind die geprüften Werte als Array/Objekt (oder null), nicht als
 * JSON-Text: `postGiveaway` braucht sie so, und `serializeEligibility` macht
 * daraus die Spaltenwerte fürs Update.
 * @returns {{ ok: true, values: object } | { ok: false, error: string }}
 */
function parseEligibilityInput(body) {
  const values = {};

  for (const key of ['blacklistRoles', 'whitelistRoles']) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    if (body[key] === null) { values[key] = null; continue; }
    const res = normalizeRoleArray(body[key]);
    if (!res.ok) return { ok: false, error: res.error };
    values[key] = res.roles;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'bonusRoles')) {
    if (body.bonusRoles === null) {
      values.bonusRoles = null;
    } else {
      const res = normalizeBonusRoles(body.bonusRoles);
      if (!res.ok) return { ok: false, error: res.error };
      values.bonusRoles = res.bonus;
    }
  }

  return { ok: true, values };
}

/**
 * Geprüfte Bedingungs-Werte -> Spaltenwerte (JSON-Text oder NULL).
 *
 * Geprüft wird auf `undefined`, nicht auf Wahrheitswert: `null` muss in die
 * Spalte, sonst käme man vom Überschreiben nie wieder zurück zur
 * Server-Einstellung.
 */
function serializeEligibility(values) {
  const data = {};
  if (values.blacklistRoles !== undefined) {
    data.blacklistRoles = values.blacklistRoles === null ? null : serializeRoleArray(values.blacklistRoles);
  }
  if (values.whitelistRoles !== undefined) {
    data.whitelistRoles = values.whitelistRoles === null ? null : serializeRoleArray(values.whitelistRoles);
  }
  if (values.bonusRoles !== undefined) {
    data.bonusRoles = values.bonusRoles === null ? null : serializeBonusRoles(values.bonusRoles);
  }
  return data;
}

/**
 * Prüft und normalisiert die Coupon-Felder aus dem Dashboard.
 * @returns {{ ok: true, data: object } | { ok: false, error: string }}
 */
function parseCouponInput(body) {
  const data = {};

  if (Object.prototype.hasOwnProperty.call(body, 'couponPercent')) {
    const raw = body.couponPercent;
    if (raw === null || raw === '') {
      data.couponPercent = null; // Coupon für dieses Giveaway abschalten
    } else {
      const percent = Number(raw);
      if (!Number.isInteger(percent) || percent < 1 || percent > 100) return { ok: false, error: 'invalid_percent' };
      data.couponPercent = percent;
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'couponPackages')) {
    const list = Array.isArray(body.couponPackages) ? body.couponPackages : [];
    const ids = list.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
    if (ids.length > 50) return { ok: false, error: 'too_many_packages' };
    data.couponPackages = JSON.stringify([...new Set(ids)]);
  }

  // Paketauswahl je Preis-Slot (nur INDIVIDUAL). Ein leerer Slot ist erlaubt und
  // bedeutet "hier gilt die gemeinsame Auswahl", siehe tebexService.
  if (Object.prototype.hasOwnProperty.call(body, 'couponPackagesPerPrize')) {
    const rows = body.couponPackagesPerPrize;
    if (rows != null && !Array.isArray(rows)) return { ok: false, error: 'invalid_packages' };
    if (Array.isArray(rows) && rows.length > MAX_PRIZES) return { ok: false, error: 'too_many_prizes' };
    if (Array.isArray(rows) && rows.some((row) => Array.isArray(row) && row.length > 50)) {
      return { ok: false, error: 'too_many_packages' };
    }
    data.couponPackagesPerPrize = serializeSlotNumbers(rows ?? []);
  }

  // Fest eingetragene Codes (fremder Shop). Bewusst ohne Store-Prüfung: sie
  // funktionieren gerade dann, wenn die Guild gar keinen eigenen Store hat.
  if (Object.prototype.hasOwnProperty.call(body, 'couponManualCode')) {
    const code = String(body.couponManualCode ?? '').trim().slice(0, 128);
    data.couponManualCode = code || null;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'couponManualCodesPerPrize')) {
    const rows = body.couponManualCodesPerPrize;
    if (rows != null && !Array.isArray(rows)) return { ok: false, error: 'invalid_codes' };
    if (Array.isArray(rows) && rows.length > MAX_PRIZES) return { ok: false, error: 'too_many_prizes' };
    data.couponManualCodesPerPrize = serializeSlotStrings(rows ?? []);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'couponManualNote')) {
    const note = String(body.couponManualNote ?? '').trim().slice(0, 500);
    data.couponManualNote = note || null;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'couponValidDays')) {
    const raw = body.couponValidDays;
    if (raw === null || raw === '') {
      data.couponValidDays = null; // läuft nie ab
    } else {
      const days = Number(raw);
      if (!Number.isInteger(days) || days < 1 || days > 3650) return { ok: false, error: 'invalid_validity' };
      data.couponValidDays = days;
    }
  }

  return { ok: true, data };
}

// ── Endpoint-Handler ──────────────────────────────────────────────────────────

async function listGiveaways(guildId) {
  const rows = await prisma.giveaway.findMany({
    where: { guildId },
    orderBy: [{ createdAt: 'desc' }],
    take: 100,
  });
  const out = [];
  for (const g of rows) {
    const entryCount = await prisma.entry.count({ where: { giveawayId: g.id } });
    // Names come only from the database here. The list never asks Discord: a
    // hundred giveaways times their winners would be a burst of REST calls on
    // every page load. Winners from before the names were stored show null.
    const winners = g.status === 'ENDED'
      ? await prisma.winner.findMany({
        where: { giveawayId: g.id, rerolled: false },
        select: { userId: true, prizeIndex: true, displayName: true, avatarUrl: true },
        orderBy: [{ prizeIndex: 'asc' }, { pickedAt: 'asc' }],
      })
      : [];
    // winnerIds bleibt für die Liste erhalten, winners trägt zusätzlich den Preis-Slot.
    out.push(serializeGiveaway(g, { entryCount, winnerIds: winners.map((w) => w.userId), winners }));
  }
  return out;
}

// At most this many user lookups per detail request, for winners drawn before
// the names were stored. Above that the rest stays null; the shop shows the ID.
const MAX_NAME_LOOKUPS = 25;

/**
 * Fills in missing winner names from the user (not the member) for display.
 *
 * Read-only on purpose: nothing is written back. A name looked up today is the
 * global name of today, not the server nickname of the day the person won, and
 * storing it would pass it off as the latter. `client.users.fetch` answers from
 * the discord.js cache when it can, so repeated views of the same giveaway stay
 * cheap. A failed lookup (deleted account) leaves the name null.
 */
async function fillMissingNames(client, winners) {
  const missing = winners.filter((w) => !w.displayName).slice(0, MAX_NAME_LOOKUPS);
  await Promise.all(missing.map(async (w) => {
    try {
      const profile = userProfile(await client.users.fetch(w.userId));
      if (profile.displayName) w.displayName = profile.displayName;
      if (!w.avatarUrl && profile.avatarUrl) w.avatarUrl = profile.avatarUrl;
    } catch {
      // unknown or deleted user -> stays null
    }
  }));
  return winners;
}

async function getGiveawayDetail(client, guildId, id) {
  const g = await getGiveaway(id, guildId);
  if (!g) return null;
  const entryCount = await prisma.entry.count({ where: { giveawayId: id } });
  const winners = await prisma.winner.findMany({
    where: { giveawayId: id },
    select: { userId: true, rerolled: true, prizeIndex: true, displayName: true, avatarUrl: true },
    orderBy: [{ prizeIndex: 'asc' }, { pickedAt: 'asc' }],
  });
  await fillMissingNames(client, winners);
  // Codes handed out and not revoked. They stay valid in the store when the
  // giveaway is deleted, which is what the dashboard warns about.
  const couponsIssued = await countIssuedCoupons(id);
  return serializeGiveaway(g, { entryCount, winners, couponsIssued });
}

/**
 * `days` of GET /history: a whole number 1..365, default 90 when absent.
 * Anything else is refused rather than clamped, so a typo in the shop shows up.
 */
function parseHistoryDays(raw) {
  if (raw === null || raw === '') return { ok: true, days: HISTORY_DEFAULT_DAYS };
  if (!/^\d{1,3}$/.test(raw)) return { ok: false };
  const days = Number(raw);
  return days >= 1 && days <= HISTORY_MAX_DAYS ? { ok: true, days } : { ok: false };
}

/**
 * POST /giveaway/delete: only for ENDED, CANCELLED and SCHEDULED giveaways.
 * A running one answers 409 still_running and has to be ended or cancelled
 * first. Answers with the number of coupon codes that were handed out.
 */
async function deleteGiveawayEndpoint(client, guildId, body) {
  const id = String(body?.id ?? '').trim().toUpperCase();
  if (!ID_RE.test(id)) return { status: 400, body: { error: 'invalid_id' } };
  const giveaway = await getGiveaway(id, guildId);
  if (!giveaway) return { status: 404, body: { error: 'not_found' } };
  if (!DELETABLE_STATUSES.includes(giveaway.status)) return { status: 409, body: { error: 'still_running' } };

  const settings = await getSettings(guildId);
  const res = await deleteGiveaway(client, giveaway, settings, { actor: ACTOR });
  if (!res.ok) return { status: res.error === 'not_found' ? 404 : 409, body: { error: res.error } };
  return { status: 200, body: { ok: true, couponsIssued: res.couponsIssued, message: res.message } };
}

/**
 * The winner selection coming from the dashboard.
 *
 * Validated rather than quietly normalised to RANDOM: a typo would otherwise be
 * acknowledged as "saved" while the giveaway ran in the wrong mode, and that is
 * not cosmetic here — it decides when the prize is gone. Same line as
 * `invalid_lang` and `utils/roles.js`.
 *
 * @returns {{ok: true, mode: string|undefined} | {ok: false, error: string}}
 */
function parseWinnerModeInput(body, key = 'winnerMode') {
  if (!Object.prototype.hasOwnProperty.call(body ?? {}, key) || body[key] == null) return { ok: true, mode: undefined };
  const value = String(body[key]).trim().toUpperCase();
  if (!WINNER_MODES.includes(value)) return { ok: false, error: 'invalid_winner_mode' };
  return { ok: true, mode: value };
}

/**
 * Validates the body of POST /giveaway/create.
 *
 * Pure: no database and no Discord, which is what lets the preview take the
 * same body through the same checks without writing or posting anything. The
 * channel is only checked for its shape here; whether it exists is the
 * caller's business (create fetches it, the preview does not need one).
 *
 * @param {object} body
 * @param {{requireChannel?: boolean}} opts the preview may leave the channel out
 * @returns {{ok: true, channelId: string|null, input: object, coupon: object} | {ok: false, error: string}}
 */
function parseCreateBody(body, { requireChannel = true } = {}) {
  const b = body || {};
  const { channelId, title, description, prizes, prizeMode, winnersCount, duration } = b;
  if (requireChannel || channelId != null) {
    if (!GUILD_RE.test(String(channelId ?? ''))) return { ok: false, error: 'invalid_channel' };
  }
  if (!title || !description) return { ok: false, error: 'missing_fields' };

  const dur = parseDuration(String(duration ?? ''));
  if (!dur.ok) return { ok: false, error: 'invalid_duration' };

  const winners = Number(winnersCount);
  if (!Number.isInteger(winners) || winners < 1 || winners > 100) return { ok: false, error: 'invalid_winners' };

  // Preise + Modus; im INDIVIDUAL-Modus ersetzt die Preisanzahl die Gewinnerzahl.
  const prizeInput = normalizePrizeInput({ prizes, mode: prizeMode, winnersCount: winners });
  if (!prizeInput.ok) return { ok: false, error: prizeInput.error };

  const coupon = parseCouponInput(b);
  if (!coupon.ok) return { ok: false, error: coupon.error };

  const elig = parseEligibilityInput(b);
  if (!elig.ok) return { ok: false, error: elig.error };

  const draw = parseWinnerModeInput(b);
  if (!draw.ok) return { ok: false, error: draw.error };

  // Optional start time. With one the giveaway is SCHEDULED and the duration
  // counts from the start, not from now.
  const start = parseStartAt(b.startAt);
  if (!start.ok) return { ok: false, error: start.error };
  const from = start.startAt ? start.startAt.getTime() : Date.now();

  return {
    ok: true,
    channelId: channelId == null ? null : String(channelId),
    coupon: coupon.data,
    input: {
      title: String(title).slice(0, 256),
      description: String(description).slice(0, 2000),
      prizes: prizeInput.prizes,
      prizeMode: prizeInput.mode,
      winnerMode: draw.mode ?? 'RANDOM',
      winnersCount: prizeInput.winnersCount,
      startAt: start.startAt,
      endAt: new Date(from + dur.ms),
      ...elig.values, // stehen im Embed, müssen also vor dem Posten im Datensatz sein
    },
  };
}

async function createGiveawayEndpoint(client, guildId, body) {
  const parsed = parseCreateBody(body);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };

  const channel = await client.channels.fetch(parsed.channelId).catch(() => null);
  if (!channel || channel.guildId !== guildId || typeof channel.isTextBased !== 'function' || !channel.isTextBased()) {
    return { status: 400, body: { error: 'invalid_channel' } };
  }

  const settings = await getSettings(guildId);
  const input = { guildId, hostId: client.user.id, ...parsed.input };
  // A start time means: store it now, post it then (the scheduler does that).
  const id = input.startAt
    ? await scheduleGiveaway(client, channel, settings, input)
    : await postGiveaway(client, channel, settings, input);

  // Coupon-Konfiguration nachtragen: sie steht in keinem Embed, die Nachricht
  // muss dafür also nicht neu gebaut werden.
  if (Object.keys(parsed.coupon).length) {
    await prisma.giveaway.update({ where: { id }, data: parsed.coupon });
  }
  return {
    status: 200,
    body: {
      id,
      status: input.startAt ? 'SCHEDULED' : 'ACTIVE',
      startAt: input.startAt ? input.startAt.toISOString() : null,
      endAt: input.endAt.toISOString(),
    },
  };
}

// Statuses in which a giveaway's content can still be edited. A SCHEDULED one
// has no message yet, so editing it only changes the row it will be posted from.
const EDITABLE_STATUSES = ['ACTIVE', 'PAUSED', 'SCHEDULED'];

/**
 * `startAt` and `duration` in an edit: only for a SCHEDULED giveaway.
 *
 * A new start keeps the duration (endAt moves with it), a new duration counts
 * from the (new or existing) start. Sending either for a giveaway that already
 * runs is refused with 409 not_scheduled instead of being ignored, so the
 * dashboard cannot believe it moved something it did not.
 *
 * @returns {{ok: true, touched: boolean, data: object} | {ok: false, status: number, error: string}}
 */
function parseScheduleEdit(giveaway, body) {
  const wantsStart = body?.startAt != null && body.startAt !== '';
  const wantsDuration = body?.duration != null && body.duration !== '';
  if (!wantsStart && !wantsDuration) return { ok: true, touched: false, data: {} };
  if (giveaway.status !== 'SCHEDULED') return { ok: false, status: 409, error: 'not_scheduled' };

  const currentStart = new Date(giveaway.startAt ?? giveaway.createdAt).getTime();
  let startMs = currentStart;
  if (wantsStart) {
    const start = parseStartAt(body.startAt);
    if (!start.ok) return { ok: false, status: 400, error: start.error };
    startMs = start.startAt.getTime();
  }

  let durationMs = new Date(giveaway.endAt).getTime() - currentStart;
  if (wantsDuration) {
    const dur = parseDuration(String(body.duration));
    if (!dur.ok) return { ok: false, status: 400, error: 'invalid_duration' };
    durationMs = dur.ms;
  }

  return { ok: true, touched: true, data: { startAt: new Date(startMs), endAt: new Date(startMs + durationMs) } };
}

async function editGiveawayEndpoint(client, guildId, body) {
  const id = String(body?.id ?? '').trim().toUpperCase();
  if (!ID_RE.test(id)) return { status: 400, body: { error: 'invalid_id' } };
  const giveaway = await getGiveaway(id, guildId);
  if (!giveaway) return { status: 404, body: { error: 'not_found' } };
  if (!EDITABLE_STATUSES.includes(giveaway.status)) return { status: 409, body: { error: 'not_active' } };

  const settings = await getSettings(guildId);
  const data = {};

  // Start time and duration can only move while the giveaway has not started.
  // Once it runs, its end is changed with /giveaway/extend.
  const timing = parseScheduleEdit(giveaway, body);
  if (!timing.ok) return { status: timing.status, body: { error: timing.error } };
  Object.assign(data, timing.data);

  if (body.title != null) data.title = String(body.title).trim().slice(0, 256);
  if (body.description != null) data.description = String(body.description).trim().slice(0, 2000);
  if (body.winnersCount != null) {
    const w = Number(body.winnersCount);
    if (!Number.isInteger(w) || w < 1 || w > 100) return { status: 400, body: { error: 'invalid_winners' } };
    data.winnersCount = w;
  }

  // Preise und Modus gehören zusammen: fehlt eines, gilt der bestehende Wert,
  // sonst passt die abgeleitete Gewinnerzahl nicht mehr zur Liste.
  if (body.prizes != null || body.prizeMode != null) {
    const input = normalizePrizeInput({
      prizes: body.prizes != null ? body.prizes : parsePrizes(giveaway.prizes),
      mode: body.prizeMode ?? giveaway.prizeMode,
      winnersCount: data.winnersCount ?? giveaway.winnersCount,
    });
    if (!input.ok) return { status: 400, body: { error: input.error } };
    data.prizes = serializePrizes(input.prizes);
    data.prizeMode = input.mode;
    data.winnersCount = input.winnersCount;
  } else if (data.winnersCount != null && normalizePrizeMode(giveaway.prizeMode) === 'INDIVIDUAL' && parsePrizes(giveaway.prizes).length) {
    // Ein Preis pro Gewinner: die Zahl folgt der Preisliste, nicht der Eingabe.
    return { status: 400, body: { error: 'winners_locked' } };
  }

  // Switching while the giveaway runs is allowed but ends nothing: entries that
  // already exist keep their order, and ending waits for the next click or the
  // deadline. An edit must not hand out prizes.
  const draw = parseWinnerModeInput(body);
  if (!draw.ok) return { status: 400, body: { error: draw.error } };
  if (draw.mode) data.winnerMode = draw.mode;

  const coupon = parseCouponInput(body);
  if (!coupon.ok) return { status: 400, body: { error: coupon.error } };
  Object.assign(data, coupon.data);

  const elig = parseEligibilityInput(body);
  if (!elig.ok) return { status: 400, body: { error: elig.error } };
  Object.assign(data, serializeEligibility(elig.values));

  if (Object.keys(data).length === 0) return { status: 400, body: { error: 'nothing' } };

  // Moving the start is conditional on the giveaway still being SCHEDULED: the
  // scheduler may have started it since the read above, and a running giveaway
  // must not get its end time rewritten by a schedule edit.
  let updated;
  if (timing.touched) {
    const res = await prisma.giveaway.updateMany({ where: { id, guildId, status: 'SCHEDULED' }, data });
    if (res.count === 0) return { status: 409, body: { error: 'not_scheduled' } };
    updated = await prisma.giveaway.findUnique({ where: { id } });
  } else {
    updated = await prisma.giveaway.update({ where: { id }, data });
  }
  await editActiveMessage(client, updated, settings, {
    disabled: updated.status !== 'ACTIVE',
    paused: updated.status === 'PAUSED',
  });
  await sendGuildLog(client, settings, t(guildId, 'log.edited', { id, title: updated.title, user: ACTOR }));
  return { status: 200, body: { ok: true, giveaway: serializeGiveaway(updated) } };
}

async function extendGiveawayEndpoint(client, guildId, body) {
  const id = String(body?.id ?? '').trim().toUpperCase();
  if (!ID_RE.test(id)) return { status: 400, body: { error: 'invalid_id' } };
  const giveaway = await getGiveaway(id, guildId);
  if (!giveaway) return { status: 404, body: { error: 'not_found' } };
  // Not started yet: its end moves with a schedule edit (startAt/duration).
  if (giveaway.status === 'SCHEDULED') return { status: 409, body: { error: 'not_started' } };
  if (giveaway.status !== 'ACTIVE' && giveaway.status !== 'PAUSED') return { status: 409, body: { error: 'not_active' } };

  const dur = parseDuration(String(body?.duration ?? ''));
  if (!dur.ok) return { status: 400, body: { error: 'invalid_duration' } };

  const settings = await getSettings(guildId);
  const newEndAt = new Date(new Date(giveaway.endAt).getTime() + dur.ms);
  const data = { endAt: newEndAt };
  const reminderMin = Number(settings.reminderMinutes) || 0;
  if (reminderMin > 0) {
    const r = new Date(newEndAt.getTime() - reminderMin * 60000);
    if (r.getTime() > Date.now()) { data.reminderAt = r; data.reminderSent = false; }
  }
  const updated = await prisma.giveaway.update({ where: { id }, data });
  await editActiveMessage(client, updated, settings, {
    disabled: updated.status !== 'ACTIVE',
    paused: updated.status === 'PAUSED',
  });
  await sendGuildLog(client, settings, t(guildId, 'log.extended', { id, title: updated.title, user: ACTOR }));
  return { status: 200, body: { ok: true, endAt: newEndAt.toISOString() } };
}

// ── Vorlagen ────────────────────────────────────────────────────────────────
// Dieselben Service-Funktionen wie /gtemplate, inklusive derselben Prüfung
// (normalizeTemplateInput). Das Dashboard darf hier nichts erlauben, was der
// Command ablehnt, und umgekehrt.

async function saveTemplateEndpoint(client, guildId, body) {
  const rawId = body?.id;
  const editing = rawId !== undefined && rawId !== null && rawId !== '';

  // Beim Bearbeiten zählt der bestehende Datensatz für alles, was nicht
  // mitgeschickt wurde — sonst würde eine Änderung am Titel die Preise leeren.
  const current = editing ? await getTemplateById(guildId, rawId) : null;
  if (editing && !current) return { status: 404, body: { error: 'not_found' } };

  const input = normalizeTemplateInput(body ?? {}, { partial: editing, current });
  if (!input.ok) return { status: 400, body: { error: input.error } };

  const settings = await getSettings(guildId);

  if (editing) {
    const res = await updateTemplateById(guildId, current.id, input.data);
    if (!res.ok) return { status: res.error === 'name_taken' ? 409 : 404, body: { error: res.error } };
    await sendGuildLog(client, settings, t(guildId, 'log.template_saved', { name: res.template.name, user: ACTOR }));
    return { status: 200, body: { ok: true, template: serializeTemplate(res.template) } };
  }

  const existing = await getTemplate(guildId, input.data.name);
  if (existing) return { status: 409, body: { error: 'name_taken' } };
  if ((await countTemplates(guildId)) >= MAX_TEMPLATES) {
    return { status: 409, body: { error: 'template_limit', max: MAX_TEMPLATES } };
  }

  const created = await saveTemplate(guildId, input.data);
  await sendGuildLog(client, settings, t(guildId, 'log.template_saved', { name: created.name, user: ACTOR }));
  return { status: 200, body: { ok: true, template: serializeTemplate(created) } };
}

/**
 * Ein bestehendes Giveaway als Vorlage sichern.
 *
 * Eigener Endpunkt statt eines Flags an `/template/save`: hier kommt nur eine
 * Giveaway-ID und ein Name herein, alles andere stammt aus dem Datensatz. Das
 * Dashboard soll die Felder nicht selbst zusammensuchen und dabei etwas
 * auslassen können.
 *
 * Ein vorhandener Name wird überschrieben (wie bei `/gtemplate from`), sonst
 * bliebe nur der Umweg über Löschen und neu anlegen.
 */
async function templateFromGiveawayEndpoint(client, guildId, body) {
  const id = String(body?.id ?? '').trim().toUpperCase();
  if (!ID_RE.test(id)) return { status: 400, body: { error: 'invalid_id' } };
  const giveaway = await getGiveaway(id, guildId);
  if (!giveaway) return { status: 404, body: { error: 'not_found' } };

  const name = String(body?.name ?? giveaway.title ?? '').trim();
  const input = normalizeTemplateInput(templateInputFromGiveaway(giveaway, name));
  if (!input.ok) return { status: 400, body: { error: input.error } };

  const existing = await getTemplate(guildId, input.data.name);
  if (!existing && (await countTemplates(guildId)) >= MAX_TEMPLATES) {
    return { status: 409, body: { error: 'template_limit', max: MAX_TEMPLATES } };
  }

  const saved = await saveTemplate(guildId, input.data);
  const settings = await getSettings(guildId);
  await sendGuildLog(client, settings, t(guildId, 'log.template_from', { name: saved.name, id, user: ACTOR }));
  return { status: 200, body: { ok: true, overwritten: Boolean(existing), template: serializeTemplate(saved) } };
}

async function deleteTemplateEndpoint(client, guildId, body) {
  const tpl = await getTemplateById(guildId, body?.id);
  if (!tpl) return { status: 404, body: { error: 'not_found' } };
  await deleteTemplateById(guildId, tpl.id);
  const settings = await getSettings(guildId);
  await sendGuildLog(client, settings, t(guildId, 'log.template_deleted', { name: tpl.name, user: ACTOR }));
  return { status: 200, body: { ok: true } };
}

async function lifecycleEndpoint(client, guildId, action, body) {
  const id = String(body?.id ?? '').trim().toUpperCase();
  if (!ID_RE.test(id)) return { status: 400, body: { error: 'invalid_id' } };
  const giveaway = await getGiveaway(id, guildId);
  if (!giveaway) return { status: 404, body: { error: 'not_found' } };
  const settings = await getSettings(guildId);

  // A scheduled giveaway has no message, no entries and no winners yet. The
  // only lifecycle action that makes sense for it is cancelling.
  if (giveaway.status === 'SCHEDULED' && action !== 'cancel') {
    return { status: 409, body: { error: 'not_started' } };
  }

  switch (action) {
    case 'end': {
      if (giveaway.status !== 'ACTIVE') return { status: 409, body: { error: 'not_active' } };
      const result = await endGiveaway(giveaway, client);
      if (result === null) return { status: 409, body: { error: 'not_active' } }; // the DB claim went to someone else
      return { status: 200, body: { ok: true, winners: result } };
    }
    case 'cancel':
      if (giveaway.status !== 'ACTIVE' && giveaway.status !== 'SCHEDULED') return { status: 409, body: { error: 'not_active' } };
      await cancelAndFinalize(client, giveaway, settings, { actor: ACTOR });
      return { status: 200, body: { ok: true } };
    case 'pause':
      if (giveaway.status !== 'ACTIVE') return { status: 409, body: { error: 'not_active' } };
      await pauseGiveaway(client, giveaway, settings);
      return { status: 200, body: { ok: true } };
    case 'resume':
      if (giveaway.status !== 'PAUSED') return { status: 409, body: { error: 'not_paused' } };
      await resumeGiveaway(client, giveaway, settings);
      return { status: 200, body: { ok: true } };
    case 'reroll': {
      if (giveaway.status !== 'ENDED') return { status: 409, body: { error: 'not_ended' } };
      if (body?.winnerId) {
        const res = await rerollSingle(client, giveaway, settings, String(body.winnerId), { actor: ACTOR });
        if (res.error) return { status: 409, body: { error: res.error } };
        return { status: 200, body: { ok: true, newWinner: res.newWinner } };
      }
      const winners = await rerollAll(client, giveaway, settings, { actor: ACTOR });
      if (winners.length === 0) return { status: 409, body: { error: 'no_valid' } };
      return { status: 200, body: { ok: true, winners } };
    }
    default:
      return { status: 404, body: { error: 'unknown_action' } };
  }
}

async function updateSettingsEndpoint(client, guildId, body) {
  const partial = {};
  for (const k of SETTINGS_KEYS) {
    if (body && Object.prototype.hasOwnProperty.call(body, k)) partial[k] = body[k];
  }
  if (Object.keys(partial).length === 0) return { status: 400, body: { error: 'nothing' } };

  // Die drei Rollen-Felder werden geprüft statt roh in die Spalte geschrieben.
  // Sie landen als JSON-Text in der DB, und eine kaputte Rollen-ID fällt dort
  // nicht auf: sie greift einfach nie, und niemand erfährt warum.
  for (const key of ['blacklist', 'whitelist']) {
    if (!Object.prototype.hasOwnProperty.call(partial, key)) continue;
    const res = normalizeRoleArray(partial[key]);
    if (!res.ok) return { status: 400, body: { error: res.error } };
    partial[key] = res.roles;
  }
  if (Object.prototype.hasOwnProperty.call(partial, 'bonusRoles')) {
    const res = normalizeBonusRoles(partial.bonusRoles);
    if (!res.ok) return { status: 400, body: { error: res.error } };
    partial.bonusRoles = res.bonus;
  }

  // Eine unbekannte Sprache fällt beim Rendern still auf Englisch zurück. Im
  // Dashboard stünde sie als gespeichert, im Discord käme sie nie an — also
  // hier ablehnen statt sie in die Spalte zu schreiben.
  if (Object.prototype.hasOwnProperty.call(partial, 'lang') && !SUPPORTED_LANGS.includes(partial.lang)) {
    return { status: 400, body: { error: 'invalid_lang' } };
  }
  const updated = await updateSettings(guildId, partial);

  // Steht die Änderung im Embed, müssen die laufenden Giveaways nachziehen.
  if (Object.keys(partial).some((k) => EMBED_SETTINGS_KEYS.includes(k))) {
    await refreshActiveEmbeds(client, guildId, updated);
  }
  return { status: 200, body: { ok: true, settings: publicSettings(updated) } };
}

// ── Tebex-Store der Guild (nur der Guild-Besitzer) ───────────────────────────

/**
 * Hinterlegt das Plugin-Secret.
 *
 * Wird vor dem Speichern gegen Tebex geprüft, damit ein Tippfehler sofort
 * auffällt und nicht erst Wochen später, wenn ein Giveaway endet und der
 * Gewinner leer ausgeht.
 */
async function setTebexSecret(guildId, body) {
  const key = checkEncryptionKey();
  if (!key.ok) return { status: 503, body: { error: 'encryption_unavailable', detail: key.error } };

  const secret = String(body?.secret ?? '').trim();
  if (secret.length < 20 || secret.length > 200) return { status: 400, body: { error: 'invalid_secret' } };

  const check = await verifySecret(secret);
  if (!check.ok) return { status: 400, body: { error: check.error === 'invalid_secret' ? 'invalid_secret' : 'tebex_unreachable' } };

  await prisma.guildSettings.update({
    where: { guildId },
    data: {
      tebexSecret: encryptSecret(secret),
      tebexSecretHint: secretHint(secret),
      tebexSecretSetAt: new Date(),
    },
  });
  evict(guildId); // der Cache hält sonst den alten Blob
  return { status: 200, body: { ok: true, store: check.store, hint: secretHint(secret) } };
}

/** Gibt den Klartext zurück. Nur für den Besitzer, und nur auf ausdrückliche Anfrage. */
async function revealTebexSecret(client, guildId, settings) {
  if (!settings.tebexSecret) return { status: 404, body: { error: 'not_configured' } };
  try {
    const plaintext = decryptSecret(settings.tebexSecret);
    logger.warn(`tebex(${guildId}): Plugin-Secret im Klartext ausgegeben (Dashboard, Guild-Besitzer).`);
    return { status: 200, body: { secret: plaintext } };
  } catch (err) {
    return { status: 500, body: { error: 'decrypt_failed', detail: err.message } };
  }
}

/** Entfernt Secret und Store-Angaben wieder. */
async function clearTebex(guildId) {
  await prisma.guildSettings.update({
    where: { guildId },
    data: { tebexSecret: null, tebexSecretHint: null, tebexSecretSetAt: null },
  });
  evict(guildId);
  return { status: 200, body: { ok: true } };
}

/** Öffentlicher Headless-Token und Store-Adresse (kein Geheimnis). */
async function setTebexStore(guildId, body) {
  const data = {};
  if (body?.publicToken != null) {
    const token = String(body.publicToken).trim();
    if (token.length > 100) return { status: 400, body: { error: 'invalid_token' } };
    data.tebexPublicToken = token || null;
  }
  if (body?.storeUrl != null) {
    const url = String(body.storeUrl).trim();
    if (url && !/^https:\/\/[\w.-]+/i.test(url)) return { status: 400, body: { error: 'invalid_url' } };
    data.tebexStoreUrl = url.slice(0, 300) || null;
  }
  if (Object.keys(data).length === 0) return { status: 400, body: { error: 'nothing' } };

  await prisma.guildSettings.update({ where: { guildId }, data });
  evict(guildId);
  return { status: 200, body: { ok: true } };
}

/**
 * Name, icon and member count of the guild, straight from the client cache.
 *
 * No REST call: the gateway delivers all of it with GUILD_CREATE, and the guild
 * check in front of every endpoint has already proved the guild is cached.
 * Without the GuildMembers intent `memberCount` is the number Discord sent at
 * that moment and is not kept up to date by join/leave events, so it is a
 * display value, not a statistic.
 */
function guildInfo(client, guildId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return null;
  const iconUrl = typeof guild.iconURL === 'function' ? guild.iconURL({ size: 128 }) : null;
  return {
    id: guild.id ?? guildId,
    name: guild.name ?? null,
    iconUrl: iconUrl ?? null,
    memberCount: Number.isInteger(guild.memberCount) ? guild.memberCount : null,
  };
}

function listRoles(client, guildId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return [];
  return guild.roles.cache
    .filter((r) => r.id !== guildId) // @everyone (Rollen-ID == Guild-ID)
    .map((r) => ({ id: r.id, name: r.name, color: r.hexColor }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function listChannels(client, guildId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return [];
  return guild.channels.cache
    .filter((c) => typeof c.isTextBased === 'function' && c.isTextBased() && !c.isThread?.())
    .map((c) => ({ id: c.id, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ── Router ──────────────────────────────────────────────────────────────────

async function handle(client, req, res) {
  if (!secretOk(req)) return send(res, 401, { error: 'unauthorized' });

  const url = new URL(req.url, 'http://127.0.0.1');
  const path = url.pathname;
  const method = req.method;

  // guildId aus Query (GET) oder Body (POST) — wird gleich geprüft.
  let body = {};
  if (method === 'POST') {
    body = await readJson(req);
    if (body === TOO_LARGE) return send(res, 413, { error: 'payload_too_large' });
    if (body === null) return send(res, 400, { error: 'invalid_json' });
  }
  const guildId = method === 'POST' ? String(body.guildId ?? '') : String(url.searchParams.get('guildId') ?? '');
  if (!GUILD_RE.test(guildId)) return send(res, 400, { error: 'invalid_guild' });
  if (!client.guilds.cache.has(guildId)) return send(res, 403, { error: 'bot_not_in_guild' });

  try {
    if (method === 'GET' && path === '/giveaways') return send(res, 200, { giveaways: await listGiveaways(guildId) });
    if (method === 'GET' && path === '/giveaway') {
      const id = String(url.searchParams.get('id') ?? '').trim().toUpperCase();
      if (!ID_RE.test(id)) return send(res, 400, { error: 'invalid_id' });
      const detail = await getGiveawayDetail(client, guildId, id);
      return detail ? send(res, 200, { giveaway: detail }) : send(res, 404, { error: 'not_found' });
    }
    if (method === 'GET' && path === '/history') {
      const parsed = parseHistoryDays(url.searchParams.get('days'));
      if (!parsed.ok) return send(res, 400, { error: 'invalid_days' });
      return send(res, 200, { days: parsed.days, history: await getGuildHistory(guildId, parsed.days) });
    }
    if (method === 'GET' && path === '/guild') {
      const info = guildInfo(client, guildId);
      return info ? send(res, 200, { guild: info }) : send(res, 403, { error: 'bot_not_in_guild' });
    }
    if (method === 'GET' && path === '/settings') return send(res, 200, { settings: publicSettings(await getSettings(guildId)) });
    if (method === 'GET' && path === '/roles') return send(res, 200, { roles: listRoles(client, guildId) });
    if (method === 'GET' && path === '/channels') return send(res, 200, { channels: listChannels(client, guildId) });
    if (method === 'GET' && path === '/templates') {
      return send(res, 200, { templates: (await listTemplates(guildId)).map(serializeTemplate) });
    }

    // ── Tebex: alles hinter dem Guild-Besitzer ───────────────────────────────
    // Ein Plugin-Secret ist Vollzugriff auf den Store. Deshalb strenger als der
    // Rest des Dashboards, der auf ADMINISTRATOR gated ist.
    if (path === '/tebex' || path.startsWith('/tebex/')) {
      const userId = method === 'POST' ? body?.userId : url.searchParams.get('userId');
      if (!(await isGuildOwner(client, guildId, userId))) return send(res, 403, { error: 'owner_only' });

      const settings = await getSettings(guildId);

      if (method === 'GET' && path === '/tebex') {
        return send(res, 200, {
          tebex: {
            ...publicSettings(settings).tebex,
            publicToken: settings.tebexPublicToken ?? null,
            storeUrl: settings.tebexStoreUrl ?? null,
            encryptionReady: checkEncryptionKey().ok,
          },
        });
      }
      if (method === 'GET' && path === '/tebex/packages') {
        return send(res, 200, { packages: await listPackages(settings.tebexPublicToken) });
      }
      if (method === 'POST' && path === '/tebex/secret') {
        const r = await setTebexSecret(guildId, body); return send(res, r.status, r.body);
      }
      if (method === 'POST' && path === '/tebex/reveal') {
        const r = await revealTebexSecret(client, guildId, settings); return send(res, r.status, r.body);
      }
      if (method === 'POST' && path === '/tebex/clear') {
        const r = await clearTebex(guildId); return send(res, r.status, r.body);
      }
      if (method === 'POST' && path === '/tebex/store') {
        const r = await setTebexStore(guildId, body); return send(res, r.status, r.body);
      }
      return send(res, 404, { error: 'not_found' });
    }

    if (method === 'POST' && path === '/giveaway/create') {
      const r = await createGiveawayEndpoint(client, guildId, body); return send(res, r.status, r.body);
    }
    if (method === 'POST' && path === '/giveaway/edit') {
      const r = await editGiveawayEndpoint(client, guildId, body); return send(res, r.status, r.body);
    }
    if (method === 'POST' && path === '/giveaway/extend') {
      const r = await extendGiveawayEndpoint(client, guildId, body); return send(res, r.status, r.body);
    }
    if (method === 'POST' && path === '/giveaway/delete') {
      const r = await deleteGiveawayEndpoint(client, guildId, body); return send(res, r.status, r.body);
    }
    if (method === 'POST' && ['/giveaway/end', '/giveaway/cancel', '/giveaway/pause', '/giveaway/resume', '/giveaway/reroll'].includes(path)) {
      const action = path.split('/').pop();
      const r = await lifecycleEndpoint(client, guildId, action, body); return send(res, r.status, r.body);
    }
    if (method === 'POST' && path === '/template/save') {
      const r = await saveTemplateEndpoint(client, guildId, body); return send(res, r.status, r.body);
    }
    if (method === 'POST' && path === '/template/from') {
      const r = await templateFromGiveawayEndpoint(client, guildId, body); return send(res, r.status, r.body);
    }
    if (method === 'POST' && path === '/template/delete') {
      const r = await deleteTemplateEndpoint(client, guildId, body); return send(res, r.status, r.body);
    }
    if (method === 'POST' && path === '/settings') {
      const r = await updateSettingsEndpoint(client, guildId, body); return send(res, r.status, r.body);
    }

    return send(res, 404, { error: 'not_found' });
  } catch (err) {
    logger.error('controlServer:', err);
    return send(res, 500, { error: 'internal' });
  }
}

/** Startet den localhost-Steuer-Server (no-op ohne CONTROL_SECRET). */
export function startControlServer(client) {
  if (!process.env.CONTROL_SECRET) {
    logger.warn('CONTROL_SECRET fehlt — Web-Dashboard-Steuer-Endpunkt deaktiviert.');
    return;
  }
  const port = Number(process.env.CONTROL_PORT) || 8787;
  if (server) server.close();
  server = createServer((req, res) => {
    handle(client, req, res).catch((err) => {
      logger.error('controlServer (unhandled):', err);
      try { send(res, 500, { error: 'internal' }); } catch { /* ignore */ }
    });
  });
  server.listen(port, '127.0.0.1', () => logger.info(`Control-Server gestartet (127.0.0.1:${port}).`));
}

export function stopControlServer() {
  if (server) server.close();
  server = null;
}

export default startControlServer;
