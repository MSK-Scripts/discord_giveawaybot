/**
 * Giveaway templates per guild (CRUD).
 *
 * A template is a prepared giveaway without a channel and without an end date:
 * title, description, duration, number of winners, since v1.7.0 the prize list
 * with its distribution mode, since v1.9.0 the entry conditions and since
 * v1.11.0 the way the winners are determined. Without the prizes it could not
 * describe what a giveaway is any more from v1.5.0 on: until then `/gtemplate
 * use` created one with no prizes at all, even though prizes had been meant
 * when the template was saved.
 *
 * A template is written by hand or built from a giveaway that already ran
 * (`templateInputFromGiveaway`). The second way is the usual one: whatever
 * worked once should be repeatable without typing it out again.
 *
 * Creating goes through the name (unique per guild), changing and deleting also
 * through the id: that is the only way to rename a template without ending up
 * with a second one.
 *
 * Coupons deliberately stay out. They hang on package IDs of one specific
 * store, which a template would drag along for months, and they would be
 * quietly out of date by the time it is used.
 */
import { prisma } from '../database/prisma.js';
import { parseDuration, formatDuration } from '../utils/duration.js';
import { normalizePrizeInput, parsePrizes, serializePrizes, normalizePrizeMode } from '../utils/prizes.js';
import {
  normalizeRoleArray, normalizeBonusRoles, parseRoleArray, parseBonusRoles,
  serializeRoleArray, serializeBonusRoles,
} from '../utils/roles.js';
import { overrides } from '../utils/eligibility.js';
import { normalizeWinnerMode, WINNER_MODES } from '../utils/winnerMode.js';

export const MAX_TEMPLATE_NAME = 64;
export const MAX_TEMPLATES = 50;

/**
 * Validates and normalises a template input.
 *
 * Central, so that the slash command and the dashboard do not each decide on
 * their own what a valid template is. Same shape as `normalizePrizeInput`: a
 * result object instead of an exception.
 *
 * @param {object} input raw input body
 * @param {boolean} partial true = only validate the fields that were sent (editing)
 * @param {object} current the existing template, for the missing fields
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

  // Prizes, mode and number of winners belong together: in INDIVIDUAL mode the
  // number of winners is the length of the list. They are therefore always
  // resolved together, even when an edit only sent one of them.
  const touchesPrizes = !partial || has('prizes') || has('prizeMode') || has('winnersCount');
  if (touchesPrizes) {
    const resolved = normalizePrizeInput({
      prizes: has('prizes') ? input.prizes : parsePrizes(current?.prizes),
      mode: has('prizeMode') ? input.prizeMode : (current?.prizeMode ?? 'ALL'),
      winnersCount: has('winnersCount') ? input.winnersCount : (current?.winnersCount ?? 1),
    });
    if (!resolved.ok) return { ok: false, error: resolved.error };

    // A number of winners that contradicts the prize list is not silently
    // overwritten but refused, the same line as in /gedit.
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

  // The winner selection is not an inherit-or-not like the conditions, it is
  // always set: a template for a quick giveaway is not one without it.
  //
  // Validated rather than quietly normalised: an unknown value from the
  // dashboard would otherwise be acknowledged as saved while the template ran
  // in the wrong mode. With the field absent the existing value applies (or
  // RANDOM).
  if (has('winnerMode') && input.winnerMode != null) {
    const wanted = String(input.winnerMode).trim().toUpperCase();
    if (!WINNER_MODES.includes(wanted)) return { ok: false, error: 'invalid_winner_mode' };
    data.winnerMode = wanted;
  } else if (!partial) {
    data.winnerMode = normalizeWinnerMode(current?.winnerMode);
  }

  // Entry conditions: `null` means "the template says nothing about this", and
  // the giveaway made from it inherits the server-wide setting. A list that is
  // set (an empty one included) is the template's own.
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
 * Builds the template input from an existing giveaway.
 *
 * Everything that makes up a template is taken over: title, description,
 * prizes, distribution mode, number of winners, the winner selection and the
 * conditions. The duration comes from the span between creation and planned
 * end, because a giveaway stores a point in time and a template a duration.
 *
 * Not taken over: channel and end date (both decided when the giveaway is
 * created) and the coupon configuration (it hangs on package IDs of one
 * specific store, see the head of this file).
 *
 * @param {object} giveaway database row
 * @param {string} name name of the template
 * @returns {object} input for normalizeTemplateInput
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
    winnerMode: normalizeWinnerMode(giveaway.winnerMode),
    // What the giveaway inherited, the template inherits too: freezing the
    // server-wide setting in here would cut every giveaway made from this
    // template off from later changes to it.
    blacklistRoles: overrides(giveaway.blacklistRoles) ? parseRoleArray(giveaway.blacklistRoles) : null,
    whitelistRoles: overrides(giveaway.whitelistRoles) ? parseRoleArray(giveaway.whitelistRoles) : null,
    bonusRoles: overrides(giveaway.bonusRoles) ? parseBonusRoles(giveaway.bonusRoles) : null,
  };
}

/** A template's conditions -> parameters for postGiveaway (null = inherit). */
export function templateEligibility(tpl) {
  return {
    blacklistRoles: overrides(tpl.blacklistRoles) ? parseRoleArray(tpl.blacklistRoles) : null,
    whitelistRoles: overrides(tpl.whitelistRoles) ? parseRoleArray(tpl.whitelistRoles) : null,
    bonusRoles: overrides(tpl.bonusRoles) ? parseBonusRoles(tpl.bonusRoles) : null,
  };
}

/** Template -> object for the dashboard (JSON column as an array). */
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
    winnerMode: normalizeWinnerMode(tpl.winnerMode),
    // null = the template brings nothing of its own and the giveaway inherits
    // the server-wide setting. The dashboard needs the difference from an empty
    // list, otherwise it shows "no condition" for both.
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

/** Create or overwrite, keyed by the name. */
export async function saveTemplate(guildId, data) {
  const { name, ...rest } = data;
  return prisma.giveawayTemplate.upsert({
    where: { guildId_name: { guildId, name } },
    update: rest,
    create: { guildId, name, ...rest },
  });
}

/**
 * Change by id, renaming included.
 *
 * The name conflict is not checked beforehand but recognised from the error:
 * two concurrent renames would otherwise both slip past the check. After a
 * failed write the state decides, as everywhere else in this project.
 */
export async function updateTemplateById(guildId, id, data) {
  const existing = await getTemplateById(guildId, id);
  if (!existing) return { ok: false, error: 'not_found' };
  try {
    const updated = await prisma.giveawayTemplate.update({ where: { id: existing.id }, data });
    return { ok: true, template: updated };
  } catch {
    // The only expected reason: the new name is already taken.
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
