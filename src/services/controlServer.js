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
import { getSettings, updateSettings } from './settingsService.js';
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
import { parseDuration } from '../utils/duration.js';
import { t } from '../utils/i18n.js';

let server = null;
const GUILD_RE = /^\d{17,20}$/;
const ID_RE = /^[A-Z0-9]{4,12}$/;
const ACTOR = '🌐 Dashboard';
const TOO_LARGE = Symbol('too_large'); // Sentinel: Body-Limit überschritten (kann von JSON.parse nie erzeugt werden)

const SETTINGS_KEYS = [
  'lang', 'embedColor', 'buttonEmoji', 'buttonStyle', 'blacklist', 'whitelist',
  'bonusRoles', 'minAccountDays', 'minMemberDays', 'managerRole', 'notifyRole',
  'logChannel', 'reminderMinutes', 'claimMessage',
];

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
    prize: g.prize,
    winnersCount: g.winnersCount,
    status: g.status,
    endAt: g.endAt ? new Date(g.endAt).toISOString() : null,
    pausedAt: g.pausedAt ? new Date(g.pausedAt).toISOString() : null,
    createdAt: g.createdAt ? new Date(g.createdAt).toISOString() : null,
    endedAt: g.endedAt ? new Date(g.endedAt).toISOString() : null,
    blacklistRoles: arr(g.blacklistRoles),
    whitelistRoles: arr(g.whitelistRoles),
    bonusRoles: obj(g.bonusRoles),
    ...extra,
  };
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
      ? await prisma.winner.findMany({ where: { giveawayId: g.id, rerolled: false }, select: { userId: true } })
      : [];
    out.push(serializeGiveaway(g, { entryCount, winnerIds: winners.map((w) => w.userId) }));
  }
  return out;
}

async function getGiveawayDetail(guildId, id) {
  const g = await getGiveaway(id, guildId);
  if (!g) return null;
  const entryCount = await prisma.entry.count({ where: { giveawayId: id } });
  const winners = await prisma.winner.findMany({ where: { giveawayId: id }, select: { userId: true, rerolled: true } });
  return serializeGiveaway(g, { entryCount, winners });
}

async function createGiveawayEndpoint(client, guildId, body) {
  const { channelId, title, description, prize, winnersCount, duration } = body || {};
  if (!GUILD_RE.test(String(channelId ?? ''))) return { status: 400, body: { error: 'invalid_channel' } };
  if (!title || !description) return { status: 400, body: { error: 'missing_fields' } };

  const dur = parseDuration(String(duration ?? ''));
  if (!dur.ok) return { status: 400, body: { error: 'invalid_duration' } };

  const winners = Number(winnersCount);
  if (!Number.isInteger(winners) || winners < 1 || winners > 100) return { status: 400, body: { error: 'invalid_winners' } };

  const channel = await client.channels.fetch(String(channelId)).catch(() => null);
  if (!channel || channel.guildId !== guildId || typeof channel.isTextBased !== 'function' || !channel.isTextBased()) {
    return { status: 400, body: { error: 'invalid_channel' } };
  }

  const settings = await getSettings(guildId);
  const endAt = new Date(Date.now() + dur.ms);
  const id = await postGiveaway(client, channel, settings, {
    guildId,
    hostId: client.user.id,
    title: String(title).slice(0, 256),
    description: String(description).slice(0, 2000),
    prize: prize ? String(prize).slice(0, 256) : null,
    winnersCount: winners,
    endAt,
  });
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
  if (body.prize != null) data.prize = String(body.prize).trim().slice(0, 256) || null;
  if (body.winnersCount != null) {
    const w = Number(body.winnersCount);
    if (!Number.isInteger(w) || w < 1 || w > 100) return { status: 400, body: { error: 'invalid_winners' } };
    data.winnersCount = w;
  }
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
  return { status: 200, body: { ok: true, settings: updated } };
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
    if (method === 'GET' && path === '/settings') return send(res, 200, { settings: await getSettings(guildId) });
    if (method === 'GET' && path === '/roles') return send(res, 200, { roles: listRoles(client, guildId) });
    if (method === 'GET' && path === '/channels') return send(res, 200, { channels: listChannels(client, guildId) });

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
