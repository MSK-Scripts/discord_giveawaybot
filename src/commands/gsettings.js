import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { getSettings, updateSettings } from '../services/settingsService.js';
import { buildSettingsEmbed } from '../utils/embeds.js';
import { isValidEmoji } from '../utils/emoji.js';
import { t } from '../utils/i18n.js';
import { SUPPORTED_LANGS } from '../utils/i18n.js';

const BUTTON_CHOICES = [
  { name: 'Primary (Blurple)', value: 'PRIMARY' },
  { name: 'Secondary (Grey)', value: 'SECONDARY' },
  { name: 'Success (Green)', value: 'SUCCESS' },
  { name: 'Danger (Red)', value: 'DANGER' },
];

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
        .setDescription('Change a setting')
        .addSubcommand((s) =>
          s
            .setName('lang')
            .setDescription('Set the language')
            .addStringOption((o) =>
              o
                .setName('value')
                .setDescription('Language')
                .setRequired(true)
                .addChoices(...SUPPORTED_LANGS.map((l) => ({ name: l, value: l }))),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName('color')
            .setDescription('Set the embed color (hex)')
            .addStringOption((o) => o.setName('value').setDescription('#RRGGBB').setRequired(true)),
        )
        .addSubcommand((s) =>
          s
            .setName('emoji')
            .setDescription('Set the join button emoji')
            .addStringOption((o) => o.setName('value').setDescription('Emoji').setRequired(true)),
        )
        .addSubcommand((s) =>
          s
            .setName('button')
            .setDescription('Set the join button style')
            .addStringOption((o) =>
              o.setName('value').setDescription('Style').setRequired(true).addChoices(...BUTTON_CHOICES),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName('blacklist')
            .setDescription('Toggle a role on the blacklist')
            .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)),
        )
        .addSubcommand((s) =>
          s
            .setName('manager')
            .setDescription('Toggle the manager role (set/clear)')
            .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)),
        )
        .addSubcommand((s) =>
          s
            .setName('notify')
            .setDescription('Toggle the notify role (set/clear)')
            .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)),
        )
        .addSubcommand((s) =>
          s
            .setName('whitelist')
            .setDescription('Toggle a required (whitelist) role')
            .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)),
        )
        .addSubcommand((s) =>
          s
            .setName('bonus')
            .setDescription('Set bonus entries for a role (0 removes)')
            .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true))
            .addIntegerOption((o) => o.setName('amount').setDescription('Extra entries (0-100)').setMinValue(0).setMaxValue(100).setRequired(true)),
        )
        .addSubcommand((s) =>
          s
            .setName('minaccount')
            .setDescription('Minimum account age in days (0 = off)')
            .addIntegerOption((o) => o.setName('days').setDescription('Days (0-3650)').setMinValue(0).setMaxValue(3650).setRequired(true)),
        )
        .addSubcommand((s) =>
          s
            .setName('minmember')
            .setDescription('Minimum server membership in days (0 = off)')
            .addIntegerOption((o) => o.setName('days').setDescription('Days (0-3650)').setMinValue(0).setMaxValue(3650).setRequired(true)),
        )
        .addSubcommand((s) =>
          s
            .setName('log')
            .setDescription('Toggle the log channel (set/clear)')
            .addChannelOption((o) => o.setName('channel').setDescription('Log channel').setRequired(true)),
        ),
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

    if (!group && sub === 'show') {
      return interaction.reply({ embeds: [buildSettingsEmbed(guildId, settings)], flags: MessageFlags.Ephemeral });
    }

    if (group === 'set') {
      const reply = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

      switch (sub) {
        case 'lang': {
          const value = interaction.options.getString('value', true);
          await updateSettings(guildId, { lang: value });
          return reply(t(value, 'settings.set.lang', { lang: value }));
        }
        case 'color': {
          const raw = interaction.options.getString('value', true).trim();
          if (!/^#?[0-9a-fA-F]{6}$/.test(raw)) {
            return reply(t(guildId, 'settings.set.color_invalid'));
          }
          const color = (raw.startsWith('#') ? raw : `#${raw}`).toLowerCase();
          await updateSettings(guildId, { embedColor: color });
          return reply(t(guildId, 'settings.set.color', { color }));
        }
        case 'emoji': {
          const value = interaction.options.getString('value', true).trim();
          if (!isValidEmoji(value)) {
            return reply(t(guildId, 'settings.set.emoji_invalid'));
          }
          await updateSettings(guildId, { buttonEmoji: value });
          return reply(t(guildId, 'settings.set.emoji', { emoji: value }));
        }
        case 'button': {
          const value = interaction.options.getString('value', true);
          await updateSettings(guildId, { buttonStyle: value });
          return reply(t(guildId, 'settings.set.button', { style: value }));
        }
        case 'blacklist': {
          const role = interaction.options.getRole('role', true);
          const list = Array.isArray(settings.blacklist) ? [...settings.blacklist] : [];
          const idx = list.indexOf(role.id);
          let key;
          if (idx >= 0) {
            list.splice(idx, 1);
            key = 'settings.set.blacklist_removed';
          } else {
            list.push(role.id);
            key = 'settings.set.blacklist_added';
          }
          await updateSettings(guildId, { blacklist: list });
          return reply(t(guildId, key, { role: `<@&${role.id}>` }));
        }
        case 'manager': {
          const role = interaction.options.getRole('role', true);
          const clear = settings.managerRole === role.id;
          await updateSettings(guildId, { managerRole: clear ? null : role.id });
          return reply(
            clear
              ? t(guildId, 'settings.set.manager_cleared')
              : t(guildId, 'settings.set.manager_set', { role: `<@&${role.id}>` }),
          );
        }
        case 'notify': {
          const role = interaction.options.getRole('role', true);
          const clear = settings.notifyRole === role.id;
          await updateSettings(guildId, { notifyRole: clear ? null : role.id });
          return reply(
            clear
              ? t(guildId, 'settings.set.notify_cleared')
              : t(guildId, 'settings.set.notify_set', { role: `<@&${role.id}>` }),
          );
        }
        case 'whitelist': {
          const role = interaction.options.getRole('role', true);
          const list = Array.isArray(settings.whitelist) ? [...settings.whitelist] : [];
          const idx = list.indexOf(role.id);
          let key;
          if (idx >= 0) {
            list.splice(idx, 1);
            key = 'settings.set.whitelist_removed';
          } else {
            list.push(role.id);
            key = 'settings.set.whitelist_added';
          }
          await updateSettings(guildId, { whitelist: list });
          return reply(t(guildId, key, { role: `<@&${role.id}>` }));
        }
        case 'bonus': {
          const role = interaction.options.getRole('role', true);
          const amount = interaction.options.getInteger('amount', true);
          const bonus = { ...(settings.bonusRoles ?? {}) };
          if (amount <= 0) {
            delete bonus[role.id];
            await updateSettings(guildId, { bonusRoles: bonus });
            return reply(t(guildId, 'settings.set.bonus_removed', { role: `<@&${role.id}>` }));
          }
          bonus[role.id] = amount;
          await updateSettings(guildId, { bonusRoles: bonus });
          return reply(t(guildId, 'settings.set.bonus_set', { role: `<@&${role.id}>`, amount }));
        }
        case 'minaccount': {
          const days = interaction.options.getInteger('days', true);
          await updateSettings(guildId, { minAccountDays: days });
          return reply(
            days > 0
              ? t(guildId, 'settings.set.minaccount_set', { days })
              : t(guildId, 'settings.set.minaccount_off'),
          );
        }
        case 'minmember': {
          const days = interaction.options.getInteger('days', true);
          await updateSettings(guildId, { minMemberDays: days });
          return reply(
            days > 0
              ? t(guildId, 'settings.set.minmember_set', { days })
              : t(guildId, 'settings.set.minmember_off'),
          );
        }
        case 'log': {
          const channel = interaction.options.getChannel('channel', true);
          const clear = settings.logChannel === channel.id;
          await updateSettings(guildId, { logChannel: clear ? null : channel.id });
          return reply(
            clear
              ? t(guildId, 'settings.set.log_cleared')
              : t(guildId, 'settings.set.log_set', { channel: `<#${channel.id}>` }),
          );
        }
        default:
          return reply(t(guildId, 'error.generic'));
      }
    }
  },
};
