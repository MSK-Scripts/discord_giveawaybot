// Zentrale Embed-/Component-Factory.
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { t } from './i18n.js';
import { parseEmoji } from './emoji.js';

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

/** Aktives Giveaway-Embed. */
export function buildGiveawayEmbed(giveaway, settings, { entryCount = 0 } = {}) {
  const g = giveaway.guildId;
  return new EmbedBuilder()
    .setColor(resolveColor(settings.embedColor))
    .setTitle(giveaway.title)
    .setDescription(giveaway.description)
    .addFields(
      { name: t(g, 'giveaway.field.ends'), value: rel(giveaway.endAt), inline: true },
      { name: t(g, 'giveaway.field.winners'), value: String(giveaway.winnersCount), inline: true },
      { name: t(g, 'giveaway.field.host'), value: `<@${giveaway.hostId}>`, inline: true },
      { name: t(g, 'giveaway.field.entries'), value: String(entryCount), inline: true },
    )
    .setFooter({ text: t(g, 'giveaway.footer', { id: giveaway.id }) })
    .setTimestamp(giveaway.endAt instanceof Date ? giveaway.endAt : new Date(giveaway.endAt));
}

/** Beendetes Giveaway-Embed (umgefärbt, Gewinner ergänzt). */
export function buildEndedEmbed(giveaway, settings, { winnerIds = [], entryCount = 0 } = {}) {
  const g = giveaway.guildId;
  const winners = winnerIds.length
    ? winnerIds.map((id) => `<@${id}>`).join(', ')
    : t(g, 'info.none');
  return new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle(`${t(g, 'giveaway.ended_title')} — ${giveaway.title}`)
    .setDescription(giveaway.description)
    .addFields(
      { name: t(g, 'giveaway.field.winners'), value: winners, inline: false },
      { name: t(g, 'giveaway.field.host'), value: `<@${giveaway.hostId}>`, inline: true },
      { name: t(g, 'giveaway.field.entries'), value: String(entryCount), inline: true },
    )
    .setFooter({ text: t(g, 'giveaway.footer', { id: giveaway.id }) });
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
    .setLabel(t(giveaway.guildId, 'giveaway.button'))
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

/** Ergebnis-Nachricht (Text) für /gend bzw. Scheduler. */
export function buildResultContent(giveaway, winnerIds, entryCount = 0) {
  const g = giveaway.guildId;
  if (!winnerIds || winnerIds.length === 0) {
    // Niemand teilgenommen vs. Teilnehmer vorhanden, aber keiner gültig (Blacklist/Guild verlassen).
    const key = entryCount === 0 ? 'end.no_entries' : 'end.no_valid';
    return t(g, key, { title: giveaway.title });
  }
  const mentions = winnerIds.map((id) => `<@${id}>`).join(', ');
  return t(g, 'end.winners', { winners: mentions, title: giveaway.title });
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
      { name: t(g, 'settings.field.blacklist'), value: roleList(settings.blacklist), inline: false },
      { name: t(g, 'settings.field.whitelist'), value: roleList(settings.whitelist), inline: false },
      { name: t(g, 'settings.field.bonus'), value: bonus, inline: false },
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
  if (winnerIds.length) {
    embed.addFields({ name: t(g, 'giveaway.field.winners'), value: winners, inline: false });
  }
  return embed;
}

/** Hilfe-Embed mit allen Commands. */
export function buildHelpEmbed(guildId, settings) {
  const g = guildId;
  const cmds = ['gcreate', 'gcancel', 'gend', 'greroll', 'gpause', 'gresume', 'gtemplate', 'glist', 'ginfo', 'ghelp', 'ginvite', 'gsettings'];
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
