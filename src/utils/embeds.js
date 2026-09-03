// Zentrale Embed-/Component-Factory.
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { t } from './i18n.js';
import { parseEmoji } from './emoji.js';
import { resolveGiveawayEligibility } from './eligibility.js';
import { isFirstClick } from './winnerMode.js';
import {
  giveawayPrizes,
  normalizePrizeMode,
  prizesForWinner,
  inlinePrizes,
  bulletList,
  numberedList,
} from './prizes.js';

const STYLE_MAP = {
  PRIMARY: ButtonStyle.Primary,
  SECONDARY: ButtonStyle.Secondary,
  SUCCESS: ButtonStyle.Success,
  DANGER: ButtonStyle.Danger,
};

const DEFAULT_COLOR = '#00e676';

/** Sichere Hex-Auflösung mit Fallback. */
function resolveColor(hex) {
  const value = typeof hex === 'string' ? hex : DEFAULT_COLOR;
  const norm = value.startsWith('#') ? value : `#${value}`;
  if (/^#[0-9a-fA-F]{6}$/.test(norm)) return parseInt(norm.slice(1), 16);
  return parseInt(DEFAULT_COLOR.slice(1), 16);
}

/** Discord-Relativ-Timestamp aus einem Date/ms. */
function rel(date) {
  const ms = date instanceof Date ? date.getTime() : Number(date);
  return `<t:${Math.floor(ms / 1000)}:R>`;
}

/**
 * Teilnahmebedingungen als Text (oder null, wenn keine gesetzt sind).
 * @param {object} eff bereits aufgelöste Bedingungen (resolveGiveawayEligibility)
 */
function requirementsValue(g, eff) {
  const parts = [];
  if (eff.whitelist?.length) parts.push(`${t(g, 'req.whitelist')}: ${eff.whitelist.map((id) => `<@&${id}>`).join(', ')}`);
  if (eff.blacklist?.length) parts.push(`${t(g, 'req.blacklist')}: ${eff.blacklist.map((id) => `<@&${id}>`).join(', ')}`);
  if ((eff.minAccountDays ?? 0) > 0) parts.push(t(g, 'req.minaccount', { days: eff.minAccountDays }));
  if ((eff.minMemberDays ?? 0) > 0) parts.push(t(g, 'req.minmember', { days: eff.minMemberDays }));
  return parts.length ? parts.join('\n') : null;
}

/**
 * Bonus-Lose als Text (oder null, wenn keine gesetzt sind).
 *
 * Bewusst ein eigenes Feld und keine weitere Zeile unter den Bedingungen: ein
 * Bonus verbietet nichts, er erhöht nur die Chance. Unter der Überschrift
 * "Bedingungen" würde er wie eine Hürde aussehen, und genau das Gegenteil soll
 * ankommen — wer die Rolle hat, hat mehr davon.
 * @param {object} eff bereits aufgelöste Bedingungen (resolveGiveawayEligibility)
 */
function bonusValue(g, eff) {
  const lines = Object.entries(eff.bonusRoles ?? {})
    .filter(([, amount]) => Number(amount) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1])) // der größte Bonus zuerst
    .map(([id, amount]) => `<@&${id}> +${amount}`);
  if (!lines.length) return null;
  return `${lines.join('\n')}\n${t(g, 'req.bonus_hint')}`;
}

/**
 * Preis-Feld(er) für ein Embed.
 *
 * Ein einzelner Preis bleibt ein schmales Inline-Feld wie bisher. Mehrere Preise
 * brauchen die volle Breite, und im INDIVIDUAL-Modus ist die Nummerierung
 * bedeutungstragend: Nummer N gehört zu Gewinner N.
 */
function prizeFields(g, giveaway) {
  const prizes = giveawayPrizes(giveaway);
  if (!prizes.length) return [];
  if (prizes.length === 1) {
    return [{ name: t(g, 'giveaway.field.prize'), value: prizes[0].slice(0, 1024), inline: true }];
  }
  const individual = normalizePrizeMode(giveaway.prizeMode) === 'INDIVIDUAL';
  return [{
    name: t(g, individual ? 'giveaway.field.prizes_individual' : 'giveaway.field.prizes'),
    value: (individual ? numberedList(prizes) : bulletList(prizes)).slice(0, 1024),
    inline: false,
  }];
}

/**
 * Gewinner-Zeilen mit ihrem Preis (nur INDIVIDUAL).
 * @param {{userId: string, prizeIndex: number|null}[]} winners
 */
function winnerPrizeLines(g, giveaway, winners) {
  const prizes = giveawayPrizes(giveaway);
  return winners
    .map((w, i) => {
      const own = prizesForWinner(prizes, giveaway.prizeMode, w.prizeIndex);
      const place = (Number.isInteger(w.prizeIndex) ? w.prizeIndex : i) + 1;
      return t(g, 'prize.winner_line', {
        place,
        user: `<@${w.userId}>`,
        prize: own.length ? inlinePrizes(own) : t(g, 'info.none'),
      });
    })
    .join('\n');
}

/** Aktives Giveaway-Embed. */
export function buildGiveawayEmbed(giveaway, settings, { entryCount = 0 } = {}) {
  const g = giveaway.guildId;
  const fast = isFirstClick(giveaway);
  const embed = new EmbedBuilder()
    .setColor(resolveColor(settings.embedColor))
    .setTitle(giveaway.title)
    .setDescription(giveaway.description)
    .addFields(
      // In first-click mode the timestamp is no longer a draw but the deadline
      // by which somebody has to have clicked.
      { name: t(g, fast ? 'giveaway.field.deadline' : 'giveaway.field.ends'), value: rel(giveaway.endAt), inline: true },
      { name: t(g, fast ? 'giveaway.field.fast_winners' : 'giveaway.field.winners'), value: String(giveaway.winnersCount), inline: true },
      { name: t(g, 'giveaway.field.host'), value: `<@${giveaway.hostId}>`, inline: true },
      { name: t(g, 'giveaway.field.entries'), value: String(entryCount), inline: true },
    )
    .setFooter({ text: t(g, 'giveaway.footer', { id: giveaway.id }) })
    .setTimestamp(giveaway.endAt instanceof Date ? giveaway.endAt : new Date(giveaway.endAt));

  // The mode belongs in the embed where it can be seen: it changes what the
  // button means. Somebody expecting "the draw happens later" who instead lost
  // instantly will read that as a bug in the bot.
  if (fast) embed.addFields({ name: t(g, 'giveaway.field.mode'), value: t(g, 'winner.mode.first_click_hint'), inline: false });

  for (const field of prizeFields(g, giveaway)) embed.addFields(field);

  // Einmal auflösen, beide Felder lesen daraus. Was das Giveaway selbst setzt,
  // steht hier statt der serverweiten Einstellung — sonst würde im Embed eine
  // Bedingung stehen, die für dieses Giveaway gar nicht gilt.
  const eff = resolveGiveawayEligibility(settings, giveaway);

  const req = requirementsValue(g, eff);
  if (req) embed.addFields({ name: t(g, 'giveaway.field.requirements'), value: req.slice(0, 1024), inline: false });

  // Bonus entries raise a weight, and a weight only exists in a draw. They do
  // nothing in first-click mode, so showing them here would be a promise the
  // bot does not keep.
  const bonus = fast ? null : bonusValue(g, eff);
  if (bonus) embed.addFields({ name: t(g, 'giveaway.field.bonus'), value: bonus.slice(0, 1024), inline: false });

  return embed;
}

/**
 * Beendetes Giveaway-Embed (umgefärbt, Gewinner ergänzt).
 * @param {{winners?: {userId: string, prizeIndex: number|null}[], entryCount?: number}} opts
 */
export function buildEndedEmbed(giveaway, settings, { winners = [], entryCount = 0 } = {}) {
  const g = giveaway.guildId;
  const individual = normalizePrizeMode(giveaway.prizeMode) === 'INDIVIDUAL' && giveawayPrizes(giveaway).length > 0;

  let winnerValue = t(g, 'info.none');
  if (winners.length) {
    // Im INDIVIDUAL-Modus steht der Preis direkt hinter dem Gewinner — die
    // Zuordnung ist sonst nirgends ablesbar.
    winnerValue = individual
      ? winnerPrizeLines(g, giveaway, winners)
      : winners.map((w) => `<@${w.userId}>`).join(', ');
  }

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle(`${t(g, 'giveaway.ended_title')} — ${giveaway.title}`)
    .setDescription(giveaway.description)
    .addFields(
      { name: t(g, 'giveaway.field.winners'), value: winnerValue.slice(0, 1024), inline: false },
      { name: t(g, 'giveaway.field.host'), value: `<@${giveaway.hostId}>`, inline: true },
      { name: t(g, 'giveaway.field.entries'), value: String(entryCount), inline: true },
    )
    .setFooter({ text: t(g, 'giveaway.footer', { id: giveaway.id }) });

  // Im INDIVIDUAL-Modus steht die Preisliste schon bei den Gewinnern.
  if (!individual) for (const field of prizeFields(g, giveaway)) embed.addFields(field);
  return embed;
}

/** Abgebrochenes Giveaway-Embed. */
export function buildCancelledEmbed(giveaway, settings) {
  const g = giveaway.guildId;
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle(`${t(g, 'giveaway.cancelled_title')} — ${giveaway.title}`)
    .setDescription(giveaway.description)
    .setFooter({ text: t(g, 'giveaway.footer', { id: giveaway.id }) });
}

/** Teilnahme-Button-Row. */
export function buildButtonRow(giveaway, settings, { disabled = false } = {}) {
  const style = STYLE_MAP[settings.buttonStyle] ?? ButtonStyle.Primary;
  const button = new ButtonBuilder()
    .setCustomId(`gw:join:${giveaway.id}`)
    .setLabel(t(giveaway.guildId, isFirstClick(giveaway) ? 'giveaway.button_fast' : 'giveaway.button'))
    .setStyle(style)
    .setDisabled(disabled);

  const emoji = parseEmoji(settings.buttonEmoji);
  if (emoji) {
    try {
      button.setEmoji(emoji);
    } catch {
      // ungültiges Emoji ignorieren -> Button ohne Emoji
    }
  }

  return new ActionRowBuilder().addComponents(button);
}

/**
 * Ergebnis-Nachricht (Text) für /gend bzw. Scheduler.
 * @param {{userId: string, prizeIndex: number|null}[]} winners
 */
export function buildResultContent(giveaway, winners, entryCount = 0) {
  const g = giveaway.guildId;
  if (!winners || winners.length === 0) {
    // Niemand teilgenommen vs. Teilnehmer vorhanden, aber keiner gültig (Blacklist/Guild verlassen).
    const key = entryCount === 0 ? 'end.no_entries' : 'end.no_valid';
    return t(g, key, { title: giveaway.title });
  }
  if (normalizePrizeMode(giveaway.prizeMode) === 'INDIVIDUAL' && giveawayPrizes(giveaway).length) {
    return t(g, 'end.winners_individual', { title: giveaway.title, lines: winnerPrizeLines(g, giveaway, winners) });
  }
  const mentions = winners.map((w) => `<@${w.userId}>`).join(', ');
  // In first-click mode nobody got lucky, somebody clicked fast. Congratulating
  // on a draw that never happened reads wrong — and the difference is exactly
  // what makes this mode fun.
  return t(g, isFirstClick(giveaway) ? 'end.winners_fast' : 'end.winners', { winners: mentions, title: giveaway.title });
}

/** Reroll-Nachricht (Text) — gleiche Logik wie die Ergebnis-Nachricht. */
export function buildRerollContent(giveaway, winners) {
  const g = giveaway.guildId;
  if (normalizePrizeMode(giveaway.prizeMode) === 'INDIVIDUAL' && giveawayPrizes(giveaway).length) {
    return t(g, 'reroll.winners_individual', { title: giveaway.title, lines: winnerPrizeLines(g, giveaway, winners) });
  }
  const mentions = winners.map((w) => `<@${w.userId}>`).join(', ');
  return t(g, 'reroll.winners', { title: giveaway.title, winners: mentions });
}

/** Settings-Übersicht. */
export function buildSettingsEmbed(guildId, settings) {
  const g = guildId;
  const none = t(g, 'settings.none');
  const roleList = (arr) => (arr?.length ? arr.map((id) => `<@&${id}>`).join(', ') : none);
  const bonus = settings.bonusRoles && Object.keys(settings.bonusRoles).length
    ? Object.entries(settings.bonusRoles).map(([id, n]) => `<@&${id}> +${n}`).join(', ')
    : none;
  const ageStr = (d) => (d > 0 ? t(g, 'settings.days', { days: d }) : t(g, 'settings.off'));
  return new EmbedBuilder()
    .setColor(resolveColor(settings.embedColor))
    .setTitle(t(g, 'settings.title'))
    .addFields(
      { name: t(g, 'settings.field.lang'), value: `\`${settings.lang}\``, inline: true },
      { name: t(g, 'settings.field.color'), value: `\`${settings.embedColor}\``, inline: true },
      { name: t(g, 'settings.field.emoji'), value: settings.buttonEmoji, inline: true },
      { name: t(g, 'settings.field.button'), value: `\`${settings.buttonStyle}\``, inline: true },
      { name: t(g, 'settings.field.manager'), value: settings.managerRole ? `<@&${settings.managerRole}>` : none, inline: true },
      { name: t(g, 'settings.field.notify'), value: settings.notifyRole ? `<@&${settings.notifyRole}>` : none, inline: true },
      { name: t(g, 'settings.field.log'), value: settings.logChannel ? `<#${settings.logChannel}>` : none, inline: true },
      { name: t(g, 'settings.field.minaccount'), value: ageStr(settings.minAccountDays ?? 0), inline: true },
      { name: t(g, 'settings.field.minmember'), value: ageStr(settings.minMemberDays ?? 0), inline: true },
      { name: t(g, 'settings.field.reminder'), value: (settings.reminderMinutes ?? 0) > 0 ? t(g, 'settings.minutes', { minutes: settings.reminderMinutes }) : t(g, 'settings.off'), inline: true },
      { name: t(g, 'settings.field.blacklist'), value: roleList(settings.blacklist), inline: false },
      { name: t(g, 'settings.field.whitelist'), value: roleList(settings.whitelist), inline: false },
      { name: t(g, 'settings.field.bonus'), value: bonus, inline: false },
      { name: t(g, 'settings.field.claim'), value: settings.claimMessage ? settings.claimMessage.slice(0, 256) : none, inline: false },
    );
}

/** Statistik-Embed pro Server. */
export function buildStatsEmbed(guildId, settings, stats) {
  const g = guildId;
  const winRate = stats.entries > 0 ? `${((stats.winners / stats.entries) * 100).toFixed(1)} %` : '—';
  return new EmbedBuilder()
    .setColor(resolveColor(settings?.embedColor))
    .setTitle(t(g, 'stats.title'))
    .addFields(
      { name: t(g, 'stats.total'), value: String(stats.total), inline: true },
      { name: t(g, 'giveaway.status.active'), value: String(stats.active), inline: true },
      { name: t(g, 'giveaway.status.paused'), value: String(stats.paused), inline: true },
      { name: t(g, 'giveaway.status.ended'), value: String(stats.ended), inline: true },
      { name: t(g, 'giveaway.status.cancelled'), value: String(stats.cancelled), inline: true },
      { name: t(g, 'stats.entries'), value: String(stats.entries), inline: true },
      { name: t(g, 'stats.winners'), value: String(stats.winners), inline: true },
      { name: t(g, 'stats.winrate'), value: winRate, inline: true },
    );
}

/** Liste aktiver Giveaways. */
export function buildListEmbed(guildId, giveaways, settings) {
  const g = guildId;
  const embed = new EmbedBuilder().setColor(resolveColor(settings?.embedColor)).setTitle(t(g, 'list.title'));
  if (!giveaways.length) {
    embed.setDescription(t(g, 'list.empty'));
    return embed;
  }
  const lines = giveaways.map((gw) =>
    t(g, 'list.entry', {
      id: gw.id,
      title: gw.title,
      channel: gw.channelId,
      ends: rel(gw.endAt),
      winners: gw.winnersCount,
    }),
  );
  embed.setDescription(lines.join('\n'));
  return embed;
}

/** Detail-Embed für /ginfo. */
export function buildInfoEmbed(guildId, giveaway, { entryCount = 0, winnerIds = [], settings } = {}) {
  const g = guildId;
  const statusKey = `giveaway.status.${giveaway.status.toLowerCase()}`;
  const winners = winnerIds.length ? winnerIds.map((id) => `<@${id}>`).join(', ') : t(g, 'info.none');
  const embed = new EmbedBuilder()
    .setColor(resolveColor(settings?.embedColor))
    .setTitle(t(g, 'info.title', { id: giveaway.id }))
    .setDescription(giveaway.title)
    .addFields(
      { name: t(g, 'info.field.status'), value: t(g, statusKey), inline: true },
      { name: t(g, 'info.field.host'), value: `<@${giveaway.hostId}>`, inline: true },
      { name: t(g, 'info.field.channel'), value: `<#${giveaway.channelId}>`, inline: true },
      { name: t(g, 'info.field.entries'), value: String(entryCount), inline: true },
      { name: t(g, 'info.field.winners'), value: String(giveaway.winnersCount), inline: true },
    );

  if (giveaway.status === 'ACTIVE') {
    embed.addFields({ name: t(g, 'info.field.ends'), value: rel(giveaway.endAt), inline: true });
  } else if (giveaway.endedAt) {
    embed.addFields({ name: t(g, 'info.field.ended'), value: rel(giveaway.endedAt), inline: true });
  }
  const prizes = giveawayPrizes(giveaway);
  if (prizes.length > 1) {
    embed.addFields({ name: t(g, 'info.field.prizemode'), value: t(g, `prize.mode.${normalizePrizeMode(giveaway.prizeMode).toLowerCase()}`), inline: true });
  }
  if (isFirstClick(giveaway)) {
    embed.addFields({ name: t(g, 'info.field.winnermode'), value: t(g, 'winner.mode.first_click'), inline: true });
  }
  for (const field of prizeFields(g, giveaway)) embed.addFields(field);

  if (winnerIds.length) {
    embed.addFields({ name: t(g, 'giveaway.field.winners'), value: winners, inline: false });
  }
  return embed;
}

/** Hilfe-Embed mit allen Commands. */
export function buildHelpEmbed(guildId, settings) {
  const g = guildId;
  const cmds = ['gcreate', 'gedit', 'gextend', 'gcancel', 'gend', 'greroll', 'gpause', 'gresume', 'gtemplate', 'glist', 'ginfo', 'gstats', 'ghelp', 'ginvite', 'gsettings'];
  const embed = new EmbedBuilder()
    .setColor(resolveColor(settings?.embedColor))
    .setTitle(t(g, 'help.title'))
    .setFooter({ text: t(g, 'help.footer') });
  for (const c of cmds) {
    embed.addFields({ name: `/${c}`, value: t(g, `help.${c}`) });
  }
  return embed;
}

export { resolveColor, STYLE_MAP };
