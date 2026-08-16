/**
 * Giveaway-Vorlagen pro Guild (CRUD).
 *
 * Eine Vorlage ist ein vorbereitetes Giveaway ohne Kanal und ohne Endzeitpunkt:
 * Titel, Beschreibung, Dauer, Gewinnerzahl und seit v1.7.0 auch die Preisliste
 * samt Verteilmodus. Ohne die Preise könnte sie seit v1.5.0 nicht mehr abbilden,
 * was ein Giveaway ausmacht — `/gtemplate use` legte bis dahin eines ganz ohne
 * Preise an, obwohl beim Speichern welche gemeint waren.
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
import { parseDuration } from '../utils/duration.js';
import { normalizePrizeInput, parsePrizes, serializePrizes, normalizePrizeMode } from '../utils/prizes.js';

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

  if (Object.keys(data).length === 0) return { ok: false, error: 'nothing' };
  return { ok: true, data };
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
