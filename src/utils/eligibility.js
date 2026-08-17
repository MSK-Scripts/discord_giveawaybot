// Prüft, ob ein GuildMember an einem Giveaway teilnehmen darf.
// Genutzt vom Teilnahme-Button (sofort) und nachträglich bei der Ziehung.
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {import('discord.js').GuildMember} member
 * @param {object} settings  (blacklist/whitelist als Array, min*Days als Zahl)
 * @returns {{ ok: true } | { ok: false, reason: string, vars?: object }}
 *          reason ist ein i18n-Key (join.*).
 */
export function checkEligibility(member, settings) {
  const blacklist = Array.isArray(settings.blacklist) ? settings.blacklist : [];
  const whitelist = Array.isArray(settings.whitelist) ? settings.whitelist : [];

  // Blacklist: eine geblacklistete Rolle schließt aus.
  if (blacklist.length && member.roles.cache.hasAny(...blacklist)) {
    return { ok: false, reason: 'join.blacklisted' };
  }

  // Whitelist: ist gesetzt, muss der Member mindestens eine der Rollen haben.
  if (whitelist.length && !member.roles.cache.hasAny(...whitelist)) {
    return { ok: false, reason: 'join.not_whitelisted' };
  }

  // Mindest-Account-Alter.
  const minAccountDays = settings.minAccountDays ?? 0;
  if (minAccountDays > 0) {
    const ageDays = (Date.now() - member.user.createdTimestamp) / DAY_MS;
    if (ageDays < minAccountDays) {
      return { ok: false, reason: 'join.account_too_new', vars: { days: minAccountDays } };
    }
  }

  // Mindest-Server-Zugehörigkeit.
  const minMemberDays = settings.minMemberDays ?? 0;
  if (minMemberDays > 0 && member.joinedTimestamp) {
    const memberDays = (Date.now() - member.joinedTimestamp) / DAY_MS;
    if (memberDays < minMemberDays) {
      return { ok: false, reason: 'join.member_too_new', vars: { days: minMemberDays } };
    }
  }

  return { ok: true };
}

/** Bonus-Lose eines Members aus den bonusRoles berechnen (Gesamtgewicht = 1 + Bonus). */
export function ticketWeight(member, settings) {
  const bonus = settings.bonusRoles && typeof settings.bonusRoles === 'object' ? settings.bonusRoles : {};
  let extra = 0;
  for (const [roleId, amount] of Object.entries(bonus)) {
    const n = Number(amount);
    if (Number.isFinite(n) && n > 0 && member.roles.cache.has(roleId)) extra += n;
  }
  return 1 + extra;
}

function parseRoleArray(value) {
  try {
    const v = JSON.parse(value ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function parseRoleObject(value) {
  try {
    const v = JSON.parse(value ?? '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/**
 * Löst die Bedingungen auf, die für EIN Giveaway gelten.
 *
 * Ein Giveaway darf die serverweiten Listen ersetzen, nicht ergänzen: was am
 * Giveaway steht, gilt statt der Einstellung aus `GuildSettings`. Der leere Fall
 * ist deshalb ein eigener Zustand und keine leere Liste — `null` (Spalte nicht
 * gesetzt) heißt "hier steht nichts, nimm die serverweite", eine gesetzte leere
 * Liste heißt "für dieses Giveaway gilt keine".
 *
 * Die drei Angaben sind unabhängig voneinander: ein Giveaway kann eine eigene
 * Blacklist haben und die Bonus-Lose weiter vom Server erben.
 *
 * Bis v1.8.0 wurden beide Ebenen vereinigt und die Bonus-Lose addiert. Das war
 * an dem Tag nicht mehr zu retten, an dem jemand eine serverweite Blacklist für
 * ein einzelnes Giveaway aufheben wollte: additiv geht das nicht.
 *
 * @returns ein settings-ähnliches Objekt für checkEligibility()/ticketWeight().
 */
export function resolveGiveawayEligibility(settings, giveaway) {
  return {
    ...settings,
    blacklist: overrides(giveaway?.blacklistRoles)
      ? parseRoleArray(giveaway.blacklistRoles)
      : (settings.blacklist ?? []),
    whitelist: overrides(giveaway?.whitelistRoles)
      ? parseRoleArray(giveaway.whitelistRoles)
      : (settings.whitelist ?? []),
    bonusRoles: overrides(giveaway?.bonusRoles)
      ? parseRoleObject(giveaway.bonusRoles)
      : (settings.bonusRoles ?? {}),
  };
}

/**
 * Hat das Giveaway für dieses Feld einen eigenen Wert?
 *
 * `null` und `undefined` heißen nein. Der Leerstring wird mitgenommen, weil eine
 * alte Zeile ihn tragen kann und er dasselbe meint wie NULL.
 */
export function overrides(raw) {
  return raw !== null && raw !== undefined && raw !== '';
}

/**
 * Der Stand, auf dem eine einzelne Änderung am Giveaway aufsetzt (Copy-on-Write).
 *
 * `/gsettings … giveaway_id` ändert immer nur eine Rolle. Hat das Giveaway noch
 * nichts Eigenes, wird dafür die serverweite Liste kopiert und dann geändert.
 * Ohne diese Kopie würde ein einzelnes `add` die Server-Liste ersetzen: der
 * Aufrufer wollte eine Rolle ergänzen und hätte alle übrigen abgeschaltet.
 *
 * @param {string|null|undefined} raw Spaltenwert des Giveaways
 * @param {string[]} serverList serverweite Liste
 */
export function listToEdit(raw, serverList) {
  return overrides(raw) ? parseRoleArray(raw) : [...(serverList ?? [])];
}

/** Wie `listToEdit`, für die Bonus-Lose. */
export function bonusToEdit(raw, serverBonus) {
  return overrides(raw) ? parseRoleObject(raw) : { ...(serverBonus ?? {}) };
}

export default checkEligibility;
