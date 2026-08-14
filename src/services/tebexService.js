/**
 * Tebex-Anbindung: automatische Gewinner-Coupons.
 *
 * Jede Guild hat ihren EIGENEN Store. Der Bot ist nicht an msk-scripts.de
 * gebunden, deshalb liegt das Plugin-Secret pro Guild in den Settings
 * (verschlüsselt, siehe utils/secretBox.js) und der Bot ruft plugin.tebex.io
 * direkt auf, statt über den msk-shop zu gehen. Der Umweg brächte nichts, weil
 * der Bot den Schlüssel ohnehin hält, und würde fremde Stores durch fremde
 * Infrastruktur schleifen.
 *
 * Jeder Gewinner bekommt einen eigenen Code. Beim Reroll wird der Code des
 * ersetzten Gewinners widerrufen, sonst behielte er seinen Rabatt.
 *
 * Fehler sind hier nie fatal: schlägt die Coupon-Erzeugung fehl, bleibt das
 * Giveaway beendet und der Gewinner bekommt die normale DM. Gleiche Linie wie
 * resultPublisher.
 */
import { customAlphabet } from 'nanoid';
import { prisma } from '../database/prisma.js';
import { logger } from '../utils/logger.js';
import { decryptSecret } from '../utils/secretBox.js';

const BASE_URL = 'https://plugin.tebex.io';
const TIMEOUT_MS = 10_000;

// Coupon-Codes werden abgetippt: keine mehrdeutigen Zeichen (0/O/1/I).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const nanoCode = customAlphabet(CODE_ALPHABET, 10);

/** @returns {string} z.B. "GW-A7K2M9PQRS" */
function generateCouponCode() {
  return `GW-${nanoCode()}`;
}

/**
 * Ruft die Plugin-API einer fremden Guild auf.
 * @param {string} secret Klartext-Plugin-Secret der Guild
 */
async function pluginFetch(secret, path, { method = 'GET', body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'X-Tebex-Secret': secret,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`Tebex ${method} ${path}: HTTP ${res.status}${text ? ` — ${text.slice(0, 200)}` : ''}`);
      err.status = res.status;
      throw err;
    }
    if (res.status === 204) return null;
    return await res.json().catch(() => null);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Holt das entschlüsselte Secret einer Guild.
 * @returns {string|null} null, wenn keines hinterlegt oder nicht entschlüsselbar
 */
function resolveSecret(settings, guildId) {
  if (!settings?.tebexSecret) return null;
  try {
    return decryptSecret(settings.tebexSecret);
  } catch (err) {
    // Typischer Fall: TEBEX_SECRET_KEY wurde getauscht, die alten Blobs passen
    // nicht mehr. Laut sagen, sonst sucht man den Fehler bei Tebex.
    logger.error(`tebex(${guildId}): Secret nicht entschlüsselbar (falscher oder fehlender TEBEX_SECRET_KEY?):`, err.message);
    return null;
  }
}

/** Ist für diese Guild und dieses Giveaway ein Coupon konfiguriert? */
export function couponConfigured(settings, giveaway) {
  const percent = Number(giveaway?.couponPercent);
  return Boolean(settings?.tebexSecret) && Number.isInteger(percent) && percent > 0 && percent <= 100;
}

function parsePackages(value) {
  try {
    const list = JSON.parse(value ?? '[]');
    if (!Array.isArray(list)) return [];
    return list.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
  } catch {
    return [];
  }
}

/** `yyyy-mm-dd`, wie die Coupon-API es erwartet. */
function formatExpiry(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Prüft ein Secret gegen Tebex und liefert den Store-Namen zurück.
 * Wird vom Dashboard beim Eintragen benutzt, damit ein Tippfehler sofort
 * auffällt statt erst beim Beenden eines Giveaways.
 * @returns {Promise<{ ok: true, store: string } | { ok: false, error: string }>}
 */
export async function verifySecret(secret) {
  try {
    const info = await pluginFetch(secret, '/information');
    return { ok: true, store: info?.account?.name ?? info?.server?.name ?? 'Tebex Store' };
  } catch (err) {
    if (err.status === 403 || err.status === 401) return { ok: false, error: 'invalid_secret' };
    return { ok: false, error: err.message };
  }
}

/**
 * Pakete des Guild-Stores für die Auswahl im Dashboard.
 *
 * Kommt über die HEADLESS-API mit dem öffentlichen Token, nicht über die
 * Plugin-API: deren `GET /packages` ist deprecated. Der öffentliche Token steht
 * bei jedem Tebex-Shop ohnehin im Frontend, er ist kein Geheimnis.
 *
 * @returns {Promise<Array<{id:number,name:string,price:number}>>}
 */
export async function listPackages(publicToken) {
  if (!publicToken) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://headless.tebex.io/api/accounts/${encodeURIComponent(publicToken)}/packages`,
      { headers: { Accept: 'application/json' }, signal: controller.signal },
    );
    if (!res.ok) return [];
    const json = await res.json().catch(() => null);
    const list = Array.isArray(json?.data) ? json.data : [];
    return list.map((p) => ({
      id: Number(p.id),
      name: String(p.name ?? ''),
      price: Number(p.total_price ?? p.base_price ?? 0),
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Legt einen Coupon für EINEN Gewinner an und speichert ihn.
 *
 * @returns {Promise<{code:string, expiresAt:Date|null}|null>} null bei Fehler
 */
async function issueOne(secret, giveaway, userId) {
  const percent = Number(giveaway.couponPercent);
  const packages = parsePackages(giveaway.couponPackages);
  const validDays = Number(giveaway.couponValidDays) || 0;

  const expiresAt = validDays > 0 ? new Date(Date.now() + validDays * 86_400_000) : null;
  const code = generateCouponCode();

  const body = {
    code,
    // Ohne Paketauswahl gilt der Rabatt auf den ganzen Warenkorb.
    effective_on: packages.length ? 'package' : 'cart',
    packages,
    categories: [],
    discount_type: 'percentage',
    discount_amount: 0,
    discount_percentage: percent,
    // Ein Gewinner, eine Einlösung.
    redeem_unlimited: false,
    expire_limit: 1,
    expire_never: expiresAt === null,
    ...(expiresAt ? { expire_date: formatExpiry(expiresAt) } : {}),
    basket_type: 'both',
    minimum: 0,
    discount_application_method: 0,
    note: `Giveaway ${giveaway.id} — winner ${userId}`,
  };

  const created = await pluginFetch(secret, '/coupons', { method: 'POST', body });
  const tebexId = Number(created?.id ?? created?.data?.id) || null;

  await prisma.giveawayCoupon.upsert({
    where: { giveawayId_userId: { giveawayId: giveaway.id, userId } },
    update: { code, tebexId, percent, expiresAt, revokedAt: null },
    create: { giveawayId: giveaway.id, userId, code, tebexId, percent, expiresAt },
  });

  return { code, expiresAt };
}

/**
 * Stellt für jeden Gewinner einen eigenen Coupon aus.
 *
 * Ein Fehlschlag bei einem Gewinner stoppt die anderen nicht — besser ein
 * Gewinner ohne Code als alle ohne.
 *
 * @returns {Promise<Map<string, {code:string, expiresAt:Date|null}>>} userId -> Coupon
 */
export async function issueCoupons(settings, giveaway, winnerIds) {
  const issued = new Map();
  if (!winnerIds?.length || !couponConfigured(settings, giveaway)) return issued;

  const secret = resolveSecret(settings, giveaway.guildId);
  if (!secret) return issued;

  for (const userId of winnerIds) {
    try {
      const coupon = await issueOne(secret, giveaway, userId);
      if (coupon) issued.set(userId, coupon);
    } catch (err) {
      logger.warn(`tebex(${giveaway.guildId}): Coupon für ${userId} in Giveaway ${giveaway.id} fehlgeschlagen:`, err?.message ?? err);
    }
  }
  return issued;
}

/**
 * Widerruft die Coupons der angegebenen Gewinner (Reroll).
 * Der Datensatz bleibt mit `revokedAt` stehen, damit nachvollziehbar ist, was
 * ausgestellt war.
 */
export async function revokeCoupons(settings, giveaway, userIds) {
  if (!userIds?.length || !settings?.tebexSecret) return;

  const secret = resolveSecret(settings, giveaway.guildId);
  if (!secret) return;

  const rows = await prisma.giveawayCoupon.findMany({
    where: { giveawayId: giveaway.id, userId: { in: userIds }, revokedAt: null },
  });

  for (const row of rows) {
    if (row.tebexId) {
      try {
        await pluginFetch(secret, `/coupons/${encodeURIComponent(row.tebexId)}`, { method: 'DELETE' });
      } catch (err) {
        // Schon im Panel gelöscht oder eingelöst: nicht schlimm, wir markieren
        // trotzdem, sonst versucht es jeder weitere Reroll erneut.
        logger.warn(`tebex(${giveaway.guildId}): Coupon ${row.code} nicht widerrufbar:`, err?.message ?? err);
      }
    }
    await prisma.giveawayCoupon.update({
      where: { giveawayId_userId: { giveawayId: giveaway.id, userId: row.userId } },
      data: { revokedAt: new Date() },
    });
  }
}

/** Aktive (nicht widerrufene) Coupons eines Giveaways, userId -> Code. */
export async function getActiveCoupons(giveawayId) {
  const rows = await prisma.giveawayCoupon.findMany({ where: { giveawayId, revokedAt: null } });
  return new Map(rows.map((r) => [r.userId, { code: r.code, expiresAt: r.expiresAt }]));
}
