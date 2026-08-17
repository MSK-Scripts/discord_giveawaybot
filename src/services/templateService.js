/**
 * Giveaway-Vorlagen pro Guild (CRUD).
 *
 * Eine Vorlage ist ein vorbereitetes Giveaway ohne Kanal und ohne Endzeitpunkt:
 * Titel, Beschreibung, Dauer, Gewinnerzahl, seit v1.7.0 die Preisliste samt
 * Verteilmodus und seit v1.9.0 die Teilnahmebedingungen. Ohne die Preise könnte
 * sie seit v1.5.0 nicht mehr abbilden, was ein Giveaway ausmacht — `/gtemplate
 * use` legte bis dahin eines ganz ohne Preise an, obwohl beim Speichern welche
 * gemeint waren.
 *
 * Eine Vorlage entsteht von Hand oder aus einem gelaufenen Giveaway
 * (`templateInputFromGiveaway`). Der zweite Weg ist der übliche: was einmal gut
 * lief, soll sich wiederholen lassen, ohne alles abzuschreiben.
 *
 * Angelegt wird über den Namen (eindeutig je Guild), geändert und gelöscht
 * zusätzlich über die id: nur so lässt sich eine Vorlage umbenennen, ohne dass
 * dabei eine zweite entsteht.
 *
 * Coupons gehören bewusst NICHT dazu. Sie hängen an Paket-IDs eines konkreten
 * Stores, die eine Vorlage über Monate mitschleppen würde, und wären beim
 * Anlegen still veraltet.
 */
import { prisma } from '../database/prisma.js';
import { parseDuration, formatDuration } from '../utils/duration.js';
import { normalizePrizeInput, parsePrizes, serializePrizes, normalizePrizeMode } from '../utils/prizes.js';
import {
  normalizeRoleArray, normalizeBonusRoles, parseRoleArray, parseBonusRoles,
  serializeRoleArray, serializeBonusRoles,
} from '../utils/roles.js';
import { overrides } from '../utils/eligibility.js';

export const MAX_TEMPLATE_NAME = 64;
export const MAX_TEMPLATES = 50;

/**
 * Prüft und normalisiert eine Vorlagen-Eingabe.
 *
 * Zentral, damit Slash-Command und Dashboard nicht getrennt voneinander
 * entscheiden, was eine gültige Vorlage ist. Gleiche Bauart wie
 * `normalizePrizeInput`: ein Ergebnisobjekt statt einer Ausnahme.
 *
 * @param {object} input roher Eingabe-Body
 * @param {boolean} partial true = nur die gesetzten Felder prüfen (Bearbeiten)
 * @param {object} current bestehende Vorlage, für die fehlenden Felder
 * @returns {{ok: true, data: object} | {ok: false, error: string}}
 */
export function normalizeTemplateInput(input = {}, { partial = false, current = null } = {}) {
  const has = (key) => Object.prototype.hasOwnProperty.call(input, key);
  const data = {};

  if (!partial || has('name')) {
    const name = String(input.name ?? '').trim().slice(0, MAX_TEMPLATE_NAME);
    if (!name) return { ok: false, error: 'invalid_name' };
    data.name = name;
  }

  if (!partial || has('title')) {
    const title = String(input.title ?? '').trim().slice(0, 256);
    if (!title) return { ok: false, error: 'missing_fields' };
    data.title = title;
  }

  if (!partial || has('description')) {
    const description = String(input.description ?? '').trim().slice(0, 2000);
    if (!description) return { ok: false, error: 'missing_fields' };
    data.description = description;
  }

  if (!partial || has('duration')) {
    const duration = String(input.duration ?? '').trim();
    if (!parseDuration(duration).ok) return { ok: false, error: 'invalid_duration' };
    data.duration = duration;
  }

  // Preise, Modus und Gewinnerzahl hängen zusammen: im INDIVIDUAL-Modus ist die
  // Gewinnerzahl die Länge der Liste. Deshalb werden sie immer gemeinsam
  // aufgelöst, auch wenn beim Bearbeiten nur eines davon geschickt wurde.
  const touchesPrizes = !partial || has('prizes') || has('prizeMode') || has('winnersCount');
  if (touchesPrizes) {
    const resolved = normalizePrizeInput({
      prizes: has('prizes') ? input.prizes : parsePrizes(current?.prizes),
      mode: has('prizeMode') ? input.prizeMode : (current?.prizeMode ?? 'ALL'),
      winnersCount: has('winnersCount') ? input.winnersCount : (current?.winnersCount ?? 1),
    });
    if (!resolved.ok) return { ok: false, error: resolved.error };

    // Eine Gewinnerzahl, die der Preisliste widerspricht, wird nicht still
    // überschrieben, sondern abgelehnt — dieselbe Linie wie bei /gedit.
    if (has('winnersCount') && resolved.mode === 'INDIVIDUAL' && resolved.prizes.length) {
      const wanted = Number(input.winnersCount);
      if (Number.isInteger(wanted) && wanted !== resolved.winnersCount) {
        return { ok: false, error: 'winners_locked' };
      }
    }

    data.prizes = serializePrizes(resolved.prizes);
    data.prizeMode = resolved.mode;
    data.winnersCount = resolved.winnersCount;
  }

  // Teilnahmebedingungen: `null` heißt "die Vorlage sagt nichts dazu", das
  // daraus erzeugte Giveaway erbt dann die serverweite Einstellung. Eine
  // gesetzte (auch leere) Liste bringt die Vorlage selbst mit.
  for (const key of ['blacklistRoles', 'whitelistRoles']) {
    if (!has(key)) continue;
    if (input[key] === null) { data[key] = null; continue; }
    const res = normalizeRoleArray(input[key]);
    if (!res.ok) return { ok: false, error: res.error };
    data[key] = serializeRoleArray(res.roles);
  }
  if (has('bonusRoles')) {
    if (input.bonusRoles === null) {
      data.bonusRoles = null;
    } else {
      const res = normalizeBonusRoles(input.bonusRoles);
      if (!res.ok) return { ok: false, error: res.error };
      data.bonusRoles = serializeBonusRoles(res.bonus);
    }
  }

  if (Object.keys(data).length === 0) return { ok: false, error: 'nothing' };
  return { ok: true, data };
}

/**
 * Baut die Vorlagen-Eingabe aus einem bestehenden Giveaway.
 *
 * Übernommen wird alles, was eine Vorlage ausmacht: Titel, Beschreibung,
 * Preise, Verteilmodus, Gewinnerzahl und die Bedingungen. Die Dauer entsteht aus
 * der Spanne zwischen Erstellung und geplantem Ende — ein Giveaway speichert
 * einen Zeitpunkt, eine Vorlage eine Dauer.
 *
 * Nicht übernommen: Kanal und Endzeitpunkt (werden beim Anlegen entschieden) und
 * die Coupon-Konfiguration (hängt an Paket-IDs eines konkreten Stores, siehe
 * Kopf dieser Datei).
 *
 * @param {object} giveaway DB-Zeile
 * @param {string} name Name der Vorlage
 * @returns {object} Eingabe für normalizeTemplateInput
 */
export function templateInputFromGiveaway(giveaway, name) {
  const created = giveaway.createdAt ? new Date(giveaway.createdAt).getTime() : Date.now();
  const ends = giveaway.endAt ? new Date(giveaway.endAt).getTime() : created;
  return {
    name,
    title: giveaway.title,
    description: giveaway.description,
    duration: formatDuration(ends - created),
    winnersCount: giveaway.winnersCount,
    prizes: parsePrizes(giveaway.prizes),
    prizeMode: normalizePrizeMode(giveaway.prizeMode),
    // Was das Giveaway geerbt hat, erbt auch die Vorlage: die serverweite
    // Einstellung hier einzufrieren würde eine spätere Änderung daran für jedes
    // Giveaway aus dieser Vorlage aushebeln.
    blacklistRoles: overrides(giveaway.blacklistRoles) ? parseRoleArray(giveaway.blacklistRoles) : null,
    whitelistRoles: overrides(giveaway.whitelistRoles) ? parseRoleArray(giveaway.whitelistRoles) : null,
    bonusRoles: overrides(giveaway.bonusRoles) ? parseBonusRoles(giveaway.bonusRoles) : null,
  };
}

/** Bedingungen einer Vorlage -> Parameter für postGiveaway (null = erben). */
export function templateEligibility(tpl) {
  return {
    blacklistRoles: overrides(tpl.blacklistRoles) ? parseRoleArray(tpl.blacklistRoles) : null,
    whitelistRoles: overrides(tpl.whitelistRoles) ? parseRoleArray(tpl.whitelistRoles) : null,
    bonusRoles: overrides(tpl.bonusRoles) ? parseBonusRoles(tpl.bonusRoles) : null,
  };
}

/** Vorlage -> Objekt fürs Dashboard (JSON-Spalte als Array). */
export function serializeTemplate(tpl) {
  return {
    id: tpl.id,
    name: tpl.name,
    title: tpl.title,
    description: tpl.description,
    duration: tpl.duration,
    winnersCount: tpl.winnersCount,
    prizes: parsePrizes(tpl.prizes),
    prizeMode: normalizePrizeMode(tpl.prizeMode),
    // null = die Vorlage bringt dazu nichts mit, das Giveaway erbt die
    // serverweite Einstellung. Das Dashboard braucht den Unterschied zur leeren
    // Liste, sonst zeigt es "keine Bedingung" für beides.
    ...templateEligibility(tpl),
    createdAt: tpl.createdAt ? new Date(tpl.createdAt).toISOString() : null,
    updatedAt: tpl.updatedAt ? new Date(tpl.updatedAt).toISOString() : null,
  };
}

export async function listTemplates(guildId) {
  return prisma.giveawayTemplate.findMany({ where: { guildId }, orderBy: { name: 'asc' } });
}

export async function countTemplates(guildId) {
  return prisma.giveawayTemplate.count({ where: { guildId } });
}

export async function getTemplate(guildId, name) {
  return prisma.giveawayTemplate.findUnique({ where: { guildId_name: { guildId, name } } });
}

export async function getTemplateById(guildId, id) {
  const tpl = await prisma.giveawayTemplate.findUnique({ where: { id: Number(id) } });
  return tpl && tpl.guildId === guildId ? tpl : null;
}

/** Anlegen oder überschreiben, Schlüssel ist der Name. */
export async function saveTemplate(guildId, data) {
  const { name, ...rest } = data;
  return prisma.giveawayTemplate.upsert({
    where: { guildId_name: { guildId, name } },
    update: rest,
    create: { guildId, name, ...rest },
  });
}

/**
 * Ändern über die id, Umbenennen eingeschlossen.
 *
 * Der Namenskonflikt wird nicht vorab geprüft, sondern am Fehler erkannt: zwei
 * gleichzeitige Umbenennungen kämen sonst beide an der Prüfung vorbei. Nach dem
 * fehlgeschlagenen Schreibvorgang entscheidet der Zustand, wie überall sonst in
 * diesem Projekt.
 */
export async function updateTemplateById(guildId, id, data) {
  const existing = await getTemplateById(guildId, id);
  if (!existing) return { ok: false, error: 'not_found' };
  try {
    const updated = await prisma.giveawayTemplate.update({ where: { id: existing.id }, data });
    return { ok: true, template: updated };
  } catch {
    // Einziger erwarteter Grund: der neue Name ist schon vergeben.
    const clash = data.name ? await getTemplate(guildId, data.name) : null;
    if (clash && clash.id !== existing.id) return { ok: false, error: 'name_taken' };
    throw new Error('template update failed');
  }
}

export async function deleteTemplate(guildId, name) {
  const res = await prisma.giveawayTemplate.deleteMany({ where: { guildId, name } });
  return res.count > 0;
}

export async function deleteTemplateById(guildId, id) {
  const res = await prisma.giveawayTemplate.deleteMany({ where: { guildId, id: Number(id) } });
  return res.count > 0;
}
