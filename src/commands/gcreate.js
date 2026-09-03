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
import { normalizePrizeMode } from '../utils/prizes.js';
import { normalizeWinnerMode } from '../utils/winnerMode.js';
import { t } from '../utils/i18n.js';

export default {
  data: new SlashCommandBuilder()
    .setName('gcreate')
    .setDescription('Create a giveaway in this channel')
    // Sichtbar für alle; der serverseitige isManager-Check (ManageGuild ODER
    // managerRole) entscheidet, sodass die Manager-Rolle ohne Integrations-Override greift.
    .setDMPermission(false)
    // Der Verteilmodus steht als Option am Command, nicht im Modal: Discord
    // erlaubt nur fünf Modal-Felder, und die sind belegt.
    .addStringOption((o) =>
      o
        .setName('mode')
        .setDescription('How multiple prizes are handed out (default: everyone gets all prizes)')
        .setRequired(false)
        .addChoices(
          { name: 'Everyone gets all prizes', value: 'ALL' },
          { name: 'One prize per winner', value: 'INDIVIDUAL' },
        ),
    )
    // How the winners are determined. On the command rather than in the modal
    // as well: the five modal fields are taken, and a choice between two fixed
    // values does not belong in a free-text field anyway.
    .addStringOption((o) =>
      o
        .setName('draw')
        .setDescription('How winners are determined (default: random draw when the giveaway ends)')
        .setRequired(false)
        .addChoices(
          { name: 'Random draw when it ends', value: 'RANDOM' },
          { name: 'First click wins (ends instantly)', value: 'FIRST_CLICK' },
        ),
    ),

  async execute(client, interaction) {
    const guildId = interaction.guildId;
    const settings = await getSettings(guildId);

    // Serverseitiger Manager-Check (ManageGuild ODER managerRole).
    if (!isManager(interaction, settings)) {
      return interaction.reply({ content: t(guildId, 'error.no_permission'), flags: MessageFlags.Ephemeral });
    }

    // INDIVIDUAL: ein Preis pro Gewinner. Die Gewinnerzahl ergibt sich dann aus
    // der Preisliste, das Gewinner-Feld entfällt und macht Platz für die Preise.
    const mode = normalizePrizeMode(interaction.options.getString('mode', false));
    const individual = mode === 'INDIVIDUAL';
    // Both modes travel along in the customId: a modal cannot ask back, and
    // between showModal and submit there is no state the bot holds.
    const winnerMode = normalizeWinnerMode(interaction.options.getString('draw', false));

    const modal = new ModalBuilder()
      .setCustomId(`gw:create:${mode}:${winnerMode}`)
      .setTitle(t(guildId, winnerMode === 'FIRST_CLICK' ? 'modal.title_fast' : 'modal.title'));

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
      // In first-click mode the duration is the deadline, not the runtime until
      // a draw: if nobody clicks, the giveaway still ends.
      .setLabel(t(guildId, winnerMode === 'FIRST_CLICK' ? 'modal.field.deadline' : 'modal.field.duration'))
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('1d2h30m')
      .setMaxLength(32)
      .setRequired(true);

    const winnersInput = new TextInputBuilder()
      .setCustomId('winners')
      .setLabel(t(guildId, winnerMode === 'FIRST_CLICK' ? 'modal.field.fast_winners' : 'modal.field.winners'))
      .setStyle(TextInputStyle.Short)
      .setValue('1')
      .setMaxLength(3)
      .setRequired(true);

    // Ein Preis pro Zeile. Deshalb Paragraph statt Short.
    const prizeInput = new TextInputBuilder()
      .setCustomId('prizes')
      .setLabel(t(guildId, individual ? 'modal.field.prizes_individual' : 'modal.field.prizes'))
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder(t(guildId, 'modal.placeholder.prizes'))
      .setMaxLength(2000)
      .setRequired(individual);

    const rows = [
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(descInput),
      new ActionRowBuilder().addComponents(durationInput),
    ];
    if (!individual) rows.push(new ActionRowBuilder().addComponents(winnersInput));
    rows.push(new ActionRowBuilder().addComponents(prizeInput));
    modal.addComponents(...rows);

    // showModal MUSS die erste Acknowledge-Aktion sein (kein vorheriges reply/defer).
    await interaction.showModal(modal);
  },
};
