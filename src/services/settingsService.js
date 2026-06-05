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

/** Cache -> DB -> on-the-fly Default-Insert. Füllt den Cache. */
export async function getSettings(guildId) {
  const cached = cache.get(guildId);
  if (cached) return cached;

  let row = await prisma.guildSettings.findUnique({ where: { guildId } });
  if (!row) {
    row = await prisma.guildSettings.create({ data: { guildId } });
  }
  const settings = deserialize(row);
  cache.set(guildId, settings);
  return settings;
}

/** Default-Settings anlegen (guildCreate). Idempotent. */
export async function createDefaults(guildId) {
  try {
    const row = await prisma.guildSettings.upsert({
      where: { guildId },
      update: {},
      create: { guildId },
    });
    const settings = deserialize(row);
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
