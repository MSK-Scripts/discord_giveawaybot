// Guild-Settings mit In-Memory-Cache (Map<guildId, settings>).
// blacklist wird in der DB als JSON-Array-String gehalten; nach außen
// (im Cache/Objekt) als string[] geführt.
import { prisma } from '../database/prisma.js';
import { logger } from '../utils/logger.js';

const cache = new Map();

const DEFAULTS = {
  lang: 'en',
  embedColor: '#00e676',
  buttonEmoji: '🎉',
  buttonStyle: 'PRIMARY',
  blacklist: [],
  whitelist: [],
  bonusRoles: {},
  minAccountDays: 0,
  minMemberDays: 0,
  managerRole: null,
  notifyRole: null,
  logChannel: null,
};

function parseArray(value) {
  try {
    const v = JSON.parse(value ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function parseObject(value) {
  try {
    const v = JSON.parse(value ?? '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** DB-Row (JSON-Strings) -> Settings-Objekt (blacklist/whitelist als Array, bonusRoles als Objekt). */
function deserialize(row) {
  return {
    ...row,
    blacklist: parseArray(row.blacklist),
    whitelist: parseArray(row.whitelist),
    bonusRoles: parseObject(row.bonusRoles),
  };
}

/** Synchron: Sprache aus dem Cache (Default 'en'). Für i18n.t(). */
export function getLang(guildId) {
  return cache.get(guildId)?.lang ?? DEFAULTS.lang;
}

/** Nur Cache-Lesen, ohne DB. */
export function getCached(guildId) {
  return cache.get(guildId);
}

/** Entfernt eine Guild aus dem Cache (z.B. nach Datenlöschung beim Guild-Leave). */
export function evict(guildId) {
  cache.delete(guildId);
}

/**
 * Reads the settings row for a guild and inserts the defaults if it has none yet.
 *
 * Read-then-create is a race: two callers — two concurrent awaits in this process,
 * or two bot processes — can both find nothing and both insert. The loser used to
 * throw P2002 out of here, and the error surfaced far away in whatever called
 * getSettings (that is how a giveaway once died mid-ending).
 *
 * The retry deliberately ignores the error code. Prisma reports this collision in
 * more than one shape depending on how it compiles the write: a plain create fails
 * with P2002, while an upsert against MariaDB fails as a code-less
 * PrismaClientUnknownRequestError carrying MySQL error 1020 ("Record has changed
 * since last read"). What matters is not which error came back but whether the row
 * exists now. If it does, the other writer won and we take their row.
 */
async function ensureRow(guildId) {
  const existing = await prisma.guildSettings.findUnique({ where: { guildId } });
  if (existing) return existing;

  try {
    return await prisma.guildSettings.create({ data: { guildId } });
  } catch (err) {
    const row = await prisma.guildSettings.findUnique({ where: { guildId } });
    if (!row) throw err; // the write failed for some other reason
    return row;
  }
}

/** Cache -> DB -> on-the-fly Default-Insert. Füllt den Cache. */
export async function getSettings(guildId) {
  const cached = cache.get(guildId);
  if (cached) return cached;

  const settings = deserialize(await ensureRow(guildId));
  cache.set(guildId, settings);
  return settings;
}

/** Default-Settings anlegen (guildCreate). Idempotent. */
export async function createDefaults(guildId) {
  try {
    // Same path as getSettings, so this survives a concurrent insert as well.
    const settings = deserialize(await ensureRow(guildId));
    cache.set(guildId, settings);
    return settings;
  } catch (err) {
    logger.error(`createDefaults(${guildId}):`, err);
  }
}

/**
 * Aktualisiert Settings in DB + Cache.
 * @param {string} guildId
 * @param {Partial<{lang,embedColor,buttonEmoji,buttonStyle,blacklist,whitelist,bonusRoles,minAccountDays,minMemberDays,managerRole,notifyRole,logChannel}>} partial
 *        (blacklist/whitelist als string[], bonusRoles als Objekt übergeben — werden serialisiert.)
 */
export async function updateSettings(guildId, partial) {
  await getSettings(guildId); // sicherstellen, dass eine Row existiert

  const data = { ...partial };
  if (Array.isArray(data.blacklist)) data.blacklist = JSON.stringify(data.blacklist);
  if (Array.isArray(data.whitelist)) data.whitelist = JSON.stringify(data.whitelist);
  if (data.bonusRoles && typeof data.bonusRoles === 'object') {
    data.bonusRoles = JSON.stringify(data.bonusRoles);
  }

  const row = await prisma.guildSettings.update({ where: { guildId }, data });
  const settings = deserialize(row);
  cache.set(guildId, settings);
  return settings;
}

export { DEFAULTS };
