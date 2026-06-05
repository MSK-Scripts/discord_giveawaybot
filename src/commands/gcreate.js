import {
  SlashCommandBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import { getSettings } from '../services/settingsService.js';
import { isManager } from '../utils/permissions.js';
import { t } from '../utils/i18n.js';

export default {
  data: new SlashCommandBuilder()
    .setName('gcreate')
    .setDescription('Create a giveaway in this channel')
    // Sichtbar für alle; der serverseitige isManager-Check (ManageGuild ODER
    // managerRole) entscheidet, sodass die Manager-Rolle ohne Integrations-Override greift.
    .setDMPermission(false),

  async execute(client, interaction) {
    const guildId = interaction.guildId;
    const settings = await getSettings(guildId);

    // Serverseitiger Manager-Check (ManageGuild ODER managerRole).
    if (!isManager(interaction, settings)) {
      return interaction.reply({ content: t(guildId, 'error.no_permission'), flags: MessageFlags.Ephemeral });
    }

    const modal = new ModalBuilder().setCustomId('gw:create').setTitle(t(guildId, 'modal.title'));

    const titleInput = new TextInputBuilder()
      .setCustomId('title')
      .setLabel(t(guildId, 'modal.field.title'))
      .setStyle(TextInputStyle.Short)
      .setMaxLength(256)
      .setRequired(true);

    const descInput = new TextInputBuilder()
      .setCustomId('description')
      .setLabel(t(guildId, 'modal.field.description'))
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(2000)
      .setRequired(true);

    const durationInput = new TextInputBuilder()
      .setCustomId('duration')
      .setLabel(t(guildId, 'modal.field.duration'))
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('1d2h30m')
      .setMaxLength(32)
      .setRequired(true);

    const winnersInput = new TextInputBuilder()
      .setCustomId('winners')
      .setLabel(t(guildId, 'modal.field.winners'))
      .setStyle(TextInputStyle.Short)
      .setValue('1')
      .setMaxLength(3)
      .setRequired(true);

    const prizeInput = new TextInputBuilder()
      .setCustomId('prize')
      .setLabel(t(guildId, 'modal.field.prize'))
      .setStyle(TextInputStyle.Short)
      .setMaxLength(256)
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(descInput),
      new ActionRowBuilder().addComponents(durationInput),
      new ActionRowBuilder().addComponents(winnersInput),
      new ActionRowBuilder().addComponents(prizeInput),
    );

    // showModal MUSS die erste Acknowledge-Aktion sein (kein vorheriges reply/defer).
    await interaction.showModal(modal);
  },
};
