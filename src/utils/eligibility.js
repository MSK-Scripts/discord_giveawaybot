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

export default checkEligibility;
