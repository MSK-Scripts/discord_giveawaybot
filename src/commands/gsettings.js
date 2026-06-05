import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { getSettings, updateSettings } from '../services/settingsService.js';
import {
  getGiveaway,
  setGiveawayBlacklistRoles,
  setGiveawayWhitelistRoles,
  setGiveawayBonusRoles,
} from '../services/giveawayService.js';
import { buildSettingsEmbed } from '../utils/embeds.js';
import { isValidEmoji } from '../utils/emoji.js';
import { t, SUPPORTED_LANGS } from '../utils/i18n.js';

const BUTTON_CHOICES = [
  { name: 'Primary (Blurple)', value: 'PRIMARY' },
  { name: 'Secondary (Grey)', value: 'SECONDARY' },
  { name: 'Success (Green)', value: 'SUCCESS' },
  { name: 'Danger (Red)', value: 'DANGER' },
];

function parseArr(value) {
  try {
    const v = JSON.parse(value ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function parseObj(value) {
  try {
    const v = JSON.parse(value ?? '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName('gsettings')
    .setDescription('View or change the server settings')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((s) => s.setName('show').setDescription('Show the current server settings'))
    .addSubcommandGroup((g) =>
      g
        .setName('set')
        .setDescription('Set or add a setting')
        .addSubcommand((s) =>
          s
            .setName('lang')
            .setDescription('Set the language')
            .addStringOption((o) =>
              o.setName('value').setDescription('Language').setRequired(true).addChoices(...SUPPORTED_LANGS.map((l) => ({ name: l, value: l }))),
            ),
        )
        .addSubcommand((s) =>
          s.setName('color').setDescription('Set the embed color (hex)').addStringOption((o) => o.setName('value').setDescription('#RRGGBB').setRequired(true)),
        )
        .addSubcommand((s) =>
          s.setName('emoji').setDescription('Set the join button emoji').addStringOption((o) => o.setName('value').setDescription('Emoji').setRequired(true)),
        )
        .addSubcommand((s) =>
          s.setName('button').setDescription('Set the join button style').addStringOption((o) => o.setName('value').setDescription('Style').setRequired(true).addChoices(...BUTTON_CHOICES)),
        )
        .addSubcommand((s) =>
          s
            .setName('blacklist')
            .setDescription('Add a blacklist role (optionally only for one giveaway)')
            .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true))
            .addStringOption((o) => o.setName('giveaway_id').setDescription('Only for this giveaway (optional)').setRequired(false)),
        )
        .addSubcommand((s) =>
          s
            .setName('whitelist')
            .setDescription('Add a required (whitelist) role (optionally only for one giveaway)')
            .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true))
            .addStringOption((o) => o.setName('giveaway_id').setDescription('Only for this giveaway (optional)').setRequired(false)),
        )
        .addSubcommand((s) =>
          s
            .setName('bonus')
            .setDescription('Set bonus entries for a role (optionally only for one giveaway)')
            .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true))
            .addIntegerOption((o) => o.setName('amount').setDescription('Extra entries (1-100)').setMinValue(1).setMaxValue(100).setRequired(true))
            .addStringOption((o) => o.setName('giveaway_id').setDescription('Only for this giveaway (optional)').setRequired(false)),
        )
        .addSubcommand((s) =>
          s.setName('manager').setDescription('Set the manager role').addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)),
        )
        .addSubcommand((s) =>
          s.setName('notify').setDescription('Set the notify role').addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)),
        )
        .addSubcommand((s) =>
          s.setName('minaccount').setDescription('Minimum account age in days (0 = off)').addIntegerOption((o) => o.setName('days').setDescription('Days (0-3650)').setMinValue(0).setMaxValue(3650).setRequired(true)),
        )
        .addSubcommand((s) =>
          s.setName('minmember').setDescription('Minimum server membership in days (0 = off)').addIntegerOption((o) => o.setName('days').setDescription('Days (0-3650)').setMinValue(0).setMaxValue(3650).setRequired(true)),
        )
        .addSubcommand((s) =>
          s.setName('log').setDescription('Toggle the log channel (set/clear)').addChannelOption((o) => o.setName('channel').setDescription('Log channel').setRequired(true)),
        )
        .addSubcommand((s) =>
          s
            .setName('reminder')
            .setDescription('"Ending soon" reminder, minutes before the end (0 = off)')
            .addIntegerOption((o) => o.setName('minutes').setDescription('Minutes (0-1440)').setMinValue(0).setMaxValue(1440).setRequired(true)),
        )
        .addSubcommand((s) =>
          s
            .setName('claim')
            .setDescription('Set the claim instructions shown in the winner DM')
            .addStringOption((o) => o.setName('text').setDescription('Claim instructions').setMaxLength(500).setRequired(true)),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName('remove')
        .setDescription('Remove / clear a setting')
        .addSubcommand((s) =>
          s
            .setName('blacklist')
            .setDescription('Remove a blacklist role (optionally only for one giveaway)')
            .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true))
            .addStringOption((o) => o.setName('giveaway_id').setDescription('Only for this giveaway (optional)').setRequired(false)),
        )
        .addSubcommand((s) =>
          s
            .setName('whitelist')
            .setDescription('Remove a whitelist role (optionally only for one giveaway)')
            .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true))
            .addStringOption((o) => o.setName('giveaway_id').setDescription('Only for this giveaway (optional)').setRequired(false)),
        )
        .addSubcommand((s) =>
          s
            .setName('bonus')
            .setDescription('Remove bonus entries for a role (optionally only for one giveaway)')
            .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true))
            .addStringOption((o) => o.setName('giveaway_id').setDescription('Only for this giveaway (optional)').setRequired(false)),
        )
        .addSubcommand((s) =>
          s.setName('manager').setDescription('Remove the manager role').addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)),
        )
        .addSubcommand((s) =>
          s.setName('notify').setDescription('Remove the notify role').addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)),
        )
        .addSubcommand((s) => s.setName('claim').setDescription('Remove the claim instructions')),
    ),

  async execute(client, interaction) {
    const guildId = interaction.guildId;

    // gsettings benötigt ManageGuild (nicht nur managerRole).
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: t(guildId, 'error.no_permission'), flags: MessageFlags.Ephemeral });
    }

    const settings = await getSettings(guildId);
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();
    const reply = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

    if (!group && sub === 'show') {
      return interaction.reply({ embeds: [buildSettingsEmbed(guildId, settings)], flags: MessageFlags.Ephemeral });
    }

    // ── Gemeinsame Blacklist/Whitelist-Logik (serverweit ODER per Giveaway) ──
    // kind: 'blacklist' | 'whitelist'; mode: 'add' | 'remove'
    const handleRoleList = async (kind, mode) => {
      const role = interaction.options.getRole('role', true);
      const gid = interaction.options.getString('giveaway_id', false)?.trim().toUpperCase();
      const roleMention = `<@&${role.id}>`;

      // Liste lesen (per Giveaway oder serverweit)
      let list;
      let giveaway = null;
      if (gid) {
        giveaway = await getGiveaway(gid, guildId);
        if (!giveaway) return reply(t(guildId, 'error.not_found'));
        list = parseArr(kind === 'blacklist' ? giveaway.blacklistRoles : giveaway.whitelistRoles);
      } else {
        list = Array.isArray(settings[kind]) ? [...settings[kind]] : [];
      }

      const idx = list.indexOf(role.id);
      let key;
      if (mode === 'add') {
        if (idx >= 0) key = `settings.set.${kind}_exists`;
        else { list.push(role.id); key = `settings.set.${kind}_added`; }
      } else {
        if (idx < 0) key = `settings.remove.${kind}_absent`;
        else { list.splice(idx, 1); key = `settings.set.${kind}_removed`; }
      }

      // Speichern (nur wenn sich etwas geändert hat)
      const changed = key.endsWith('_added') || key.endsWith('_removed');
      if (changed) {
        if (gid) {
          if (kind === 'blacklist') await setGiveawayBlacklistRoles(gid, list);
          else await setGiveawayWhitelistRoles(gid, list);
        } else {
          await updateSettings(guildId, { [kind]: list });
        }
      }

      const suffix = gid ? t(guildId, 'settings.scope.giveaway', { id: gid }) : '';
      return reply(t(guildId, key, { role: roleMention }) + suffix);
    };

    // ── Bonus-Lose (serverweit ODER per Giveaway) ──
    const handleBonus = async (mode) => {
      const role = interaction.options.getRole('role', true);
      const roleMention = `<@&${role.id}>`;
      const gid = interaction.options.getString('giveaway_id', false)?.trim().toUpperCase();
      const suffix = gid ? t(guildId, 'settings.scope.giveaway', { id: gid }) : '';

      let bonus;
      if (gid) {
        const giveaway = await getGiveaway(gid, guildId);
        if (!giveaway) return reply(t(guildId, 'error.not_found'));
        bonus = parseObj(giveaway.bonusRoles);
      } else {
        bonus = { ...(settings.bonusRoles ?? {}) };
      }

      if (mode === 'set') {
        const amount = interaction.options.getInteger('amount', true);
        bonus[role.id] = amount;
        if (gid) await setGiveawayBonusRoles(gid, bonus);
        else await updateSettings(guildId, { bonusRoles: bonus });
        return reply(t(guildId, 'settings.set.bonus_set', { role: roleMention, amount }) + suffix);
      }
      // remove
      if (!(role.id in bonus)) return reply(t(guildId, 'settings.remove.bonus_absent', { role: roleMention }) + suffix);
      delete bonus[role.id];
      if (gid) await setGiveawayBonusRoles(gid, bonus);
      else await updateSettings(guildId, { bonusRoles: bonus });
      return reply(t(guildId, 'settings.set.bonus_removed', { role: roleMention }) + suffix);
    };

    // ── SET ──────────────────────────────────────────────────────────────────
    if (group === 'set') {
      switch (sub) {
        case 'lang': {
          const value = interaction.options.getString('value', true);
          await updateSettings(guildId, { lang: value });
          return reply(t(value, 'settings.set.lang', { lang: value }));
        }
        case 'color': {
          const raw = interaction.options.getString('value', true).trim();
          if (!/^#?[0-9a-fA-F]{6}$/.test(raw)) return reply(t(guildId, 'settings.set.color_invalid'));
          const color = (raw.startsWith('#') ? raw : `#${raw}`).toLowerCase();
          await updateSettings(guildId, { embedColor: color });
          return reply(t(guildId, 'settings.set.color', { color }));
        }
        case 'emoji': {
          const value = interaction.options.getString('value', true).trim();
          if (!isValidEmoji(value)) return reply(t(guildId, 'settings.set.emoji_invalid'));
          await updateSettings(guildId, { buttonEmoji: value });
          return reply(t(guildId, 'settings.set.emoji', { emoji: value }));
        }
        case 'button': {
          const value = interaction.options.getString('value', true);
          await updateSettings(guildId, { buttonStyle: value });
          return reply(t(guildId, 'settings.set.button', { style: value }));
        }
        case 'blacklist':
          return handleRoleList('blacklist', 'add');
        case 'whitelist':
          return handleRoleList('whitelist', 'add');
        case 'bonus':
          return handleBonus('set');
        case 'manager': {
          const role = interaction.options.getRole('role', true);
          await updateSettings(guildId, { managerRole: role.id });
          return reply(t(guildId, 'settings.set.manager_set', { role: `<@&${role.id}>` }));
        }
        case 'notify': {
          const role = interaction.options.getRole('role', true);
          await updateSettings(guildId, { notifyRole: role.id });
          return reply(t(guildId, 'settings.set.notify_set', { role: `<@&${role.id}>` }));
        }
        case 'minaccount': {
          const days = interaction.options.getInteger('days', true);
          await updateSettings(guildId, { minAccountDays: days });
          return reply(days > 0 ? t(guildId, 'settings.set.minaccount_set', { days }) : t(guildId, 'settings.set.minaccount_off'));
        }
        case 'minmember': {
          const days = interaction.options.getInteger('days', true);
          await updateSettings(guildId, { minMemberDays: days });
          return reply(days > 0 ? t(guildId, 'settings.set.minmember_set', { days }) : t(guildId, 'settings.set.minmember_off'));
        }
        case 'log': {
          const channel = interaction.options.getChannel('channel', true);
          const clear = settings.logChannel === channel.id;
          await updateSettings(guildId, { logChannel: clear ? null : channel.id });
          return reply(clear ? t(guildId, 'settings.set.log_cleared') : t(guildId, 'settings.set.log_set', { channel: `<#${channel.id}>` }));
        }
        case 'reminder': {
          const minutes = interaction.options.getInteger('minutes', true);
          await updateSettings(guildId, { reminderMinutes: minutes });
          return reply(minutes > 0 ? t(guildId, 'settings.set.reminder_set', { minutes }) : t(guildId, 'settings.set.reminder_off'));
        }
        case 'claim': {
          const text = interaction.options.getString('text', true).trim();
          await updateSettings(guildId, { claimMessage: text });
          return reply(t(guildId, 'settings.set.claim_set'));
        }
        default:
          return reply(t(guildId, 'error.generic'));
      }
    }

    // ── REMOVE ─────────────────────────────────────────────────────────────────
    if (group === 'remove') {
      switch (sub) {
        case 'blacklist':
          return handleRoleList('blacklist', 'remove');
        case 'whitelist':
          return handleRoleList('whitelist', 'remove');
        case 'bonus':
          return handleBonus('remove');
        case 'manager': {
          const role = interaction.options.getRole('role', true);
          if (settings.managerRole !== role.id) return reply(t(guildId, 'settings.remove.manager_mismatch', { role: `<@&${role.id}>` }));
          await updateSettings(guildId, { managerRole: null });
          return reply(t(guildId, 'settings.set.manager_cleared'));
        }
        case 'notify': {
          const role = interaction.options.getRole('role', true);
          if (settings.notifyRole !== role.id) return reply(t(guildId, 'settings.remove.notify_mismatch', { role: `<@&${role.id}>` }));
          await updateSettings(guildId, { notifyRole: null });
          return reply(t(guildId, 'settings.set.notify_cleared'));
        }
        case 'claim': {
          await updateSettings(guildId, { claimMessage: null });
          return reply(t(guildId, 'settings.set.claim_cleared'));
        }
        default:
          return reply(t(guildId, 'error.generic'));
      }
    }
  },
};
