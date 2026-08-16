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
  editActiveMessage,
  endGiveaway,
  cancelAndFinalize,
  pauseGiveaway,
  resumeGiveaway,
  rerollAll,
  rerollSingle,
  sendGuildLog,
} from './giveawayService.js';
import { verifySecret, listPackages } from './tebexService.js';
import {
  listTemplates, getTemplate, getTemplateById, saveTemplate, updateTemplateById,
  deleteTemplateById, countTemplates, normalizeTemplateInput, serializeTemplate, MAX_TEMPLATES,
} from './templateService.js';
import {
  normalizePrizeInput, normalizePrizeMode, parsePrizes, serializePrizes,
  parseSlotNumbers, serializeSlotNumbers, parseSlotStrings, serializeSlotStrings, MAX_PRIZES,
} from '../utils/prizes.js';
import { encryptSecret, decryptSecret, secretHint, checkEncryptionKey } from '../utils/secretBox.js';
import { parseDuration } from '../utils/duration.js';
import { t } from '../utils/i18n.js';

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
    winnersCount: g.winnersCount,
    status: g.status,
    endAt: g.endAt ? new Date(g.endAt).toISOString() : null,
    pausedAt: g.pausedAt ? new Date(g.pausedAt).toISOString() : null,
    createdAt: g.createdAt ? new Date(g.createdAt).toISOString() : null,
    endedAt: g.endedAt ? new Date(g.endedAt).toISOString() : null,
    blacklistRoles: arr(g.blacklistRoles),
    whitelistRoles: arr(g.whitelistRoles),
    bonusRoles: obj(g.bonusRoles),
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
    const winners = g.status === 'ENDED'
      ? await prisma.winner.findMany({
        where: { giveawayId: g.id, rerolled: false },
        select: { userId: true, prizeIndex: true },
        orderBy: [{ prizeIndex: 'asc' }, { pickedAt: 'asc' }],
      })
      : [];
    // winnerIds bleibt für die Liste erhalten, winners trägt zusätzlich den Preis-Slot.
    out.push(serializeGiveaway(g, { entryCount, winnerIds: winners.map((w) => w.userId), winners }));
  }
  return out;
}

async function getGiveawayDetail(guildId, id) {
  const g = await getGiveaway(id, guildId);
  if (!g) return null;
  const entryCount = await prisma.entry.count({ where: { giveawayId: id } });
  const winners = await prisma.winner.findMany({
    where: { giveawayId: id },
    select: { userId: true, rerolled: true, prizeIndex: true },
    orderBy: [{ prizeIndex: 'asc' }, { pickedAt: 'asc' }],
  });
  return serializeGiveaway(g, { entryCount, winners });
}

async function createGiveawayEndpoint(client, guildId, body) {
  const { channelId, title, description, prizes, prizeMode, winnersCount, duration } = body || {};
  if (!GUILD_RE.test(String(channelId ?? ''))) return { status: 400, body: { error: 'invalid_channel' } };
  if (!title || !description) return { status: 400, body: { error: 'missing_fields' } };

  const dur = parseDuration(String(duration ?? ''));
  if (!dur.ok) return { status: 400, body: { error: 'invalid_duration' } };

  const winners = Number(winnersCount);
  if (!Number.isInteger(winners) || winners < 1 || winners > 100) return { status: 400, body: { error: 'invalid_winners' } };

  // Preise + Modus; im INDIVIDUAL-Modus ersetzt die Preisanzahl die Gewinnerzahl.
  const prizeInput = normalizePrizeInput({ prizes, mode: prizeMode, winnersCount: winners });
  if (!prizeInput.ok) return { status: 400, body: { error: prizeInput.error } };

  const channel = await client.channels.fetch(String(channelId)).catch(() => null);
  if (!channel || channel.guildId !== guildId || typeof channel.isTextBased !== 'function' || !channel.isTextBased()) {
    return { status: 400, body: { error: 'invalid_channel' } };
  }

  const coupon = parseCouponInput(body || {});
  if (!coupon.ok) return { status: 400, body: { error: coupon.error } };

  const settings = await getSettings(guildId);
  const endAt = new Date(Date.now() + dur.ms);
  const id = await postGiveaway(client, channel, settings, {
    guildId,
    hostId: client.user.id,
    title: String(title).slice(0, 256),
    description: String(description).slice(0, 2000),
    prizes: prizeInput.prizes,
    prizeMode: prizeInput.mode,
    winnersCount: prizeInput.winnersCount,
    endAt,
  });

  // Coupon-Konfiguration nachtragen: sie steht in keinem Embed, die Nachricht
  // muss dafür also nicht neu gebaut werden.
  if (Object.keys(coupon.data).length) {
    await prisma.giveaway.update({ where: { id }, data: coupon.data });
  }
  return { status: 200, body: { id } };
}

async function editGiveawayEndpoint(client, guildId, body) {
  const id = String(body?.id ?? '').trim().toUpperCase();
  if (!ID_RE.test(id)) return { status: 400, body: { error: 'invalid_id' } };
  const giveaway = await getGiveaway(id, guildId);
  if (!giveaway) return { status: 404, body: { error: 'not_found' } };
  if (giveaway.status !== 'ACTIVE' && giveaway.status !== 'PAUSED') return { status: 409, body: { error: 'not_active' } };

  const settings = await getSettings(guildId);
  const data = {};
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

  const coupon = parseCouponInput(body);
  if (!coupon.ok) return { status: 400, body: { error: coupon.error } };
  Object.assign(data, coupon.data);

  if (Object.keys(data).length === 0) return { status: 400, body: { error: 'nothing' } };

  const updated = await prisma.giveaway.update({ where: { id }, data });
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

  switch (action) {
    case 'end': {
      if (giveaway.status !== 'ACTIVE') return { status: 409, body: { error: 'not_active' } };
      const result = await endGiveaway(giveaway, client);
      if (result === null) return { status: 409, body: { error: 'not_active' } }; // the DB claim went to someone else
      return { status: 200, body: { ok: true, winners: result } };
    }
    case 'cancel':
      if (giveaway.status !== 'ACTIVE') return { status: 409, body: { error: 'not_active' } };
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

async function updateSettingsEndpoint(guildId, body) {
  const partial = {};
  for (const k of SETTINGS_KEYS) {
    if (body && Object.prototype.hasOwnProperty.call(body, k)) partial[k] = body[k];
  }
  if (Object.keys(partial).length === 0) return { status: 400, body: { error: 'nothing' } };
  const updated = await updateSettings(guildId, partial);
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
      const detail = await getGiveawayDetail(guildId, id);
      return detail ? send(res, 200, { giveaway: detail }) : send(res, 404, { error: 'not_found' });
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
    if (method === 'POST' && ['/giveaway/end', '/giveaway/cancel', '/giveaway/pause', '/giveaway/resume', '/giveaway/reroll'].includes(path)) {
      const action = path.split('/').pop();
      const r = await lifecycleEndpoint(client, guildId, action, body); return send(res, r.status, r.body);
    }
    if (method === 'POST' && path === '/template/save') {
      const r = await saveTemplateEndpoint(client, guildId, body); return send(res, r.status, r.body);
    }
    if (method === 'POST' && path === '/template/delete') {
      const r = await deleteTemplateEndpoint(client, guildId, body); return send(res, r.status, r.body);
    }
    if (method === 'POST' && path === '/settings') {
      const r = await updateSettingsEndpoint(guildId, body); return send(res, r.status, r.body);
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
