// Zentraler Router für Commands, Buttons und Modals.
import { MessageFlags } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getSettings } from '../services/settingsService.js';
import { resolveComponent } from '../handlers/componentHandler.js';
import { t } from '../utils/i18n.js';

async function safeReply(interaction, content) {
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  } catch (err) {
    if (err?.code === 10062) return; // Unknown interaction -> ignorieren
    logger.error('safeReply:', err?.message ?? err);
  }
}

export default {
  name: 'interactionCreate',
  async execute(client, interaction) {
    // Settings-Cache vorab füllen, damit das synchrone t() die Guild-Sprache kennt.
    if (interaction.inGuild()) {
      try {
        await getSettings(interaction.guildId);
      } catch (err) {
        logger.error('getSettings (Router):', err?.message ?? err);
      }
    }

    try {
      if (interaction.isChatInputCommand()) {
        const cmd = client.commands.get(interaction.commandName);
        if (!cmd) return;
        const group = interaction.options.getSubcommandGroup(false);
        const sub = interaction.options.getSubcommand(false);
        const label = [interaction.commandName, group, sub].filter(Boolean).join(' ');
        logger.info(`/${label} von ${interaction.user.tag} in ${interaction.guildId}`);
        await cmd.execute(client, interaction);
        return;
      }

      if (interaction.isButton() || interaction.isModalSubmit()) {
        const comp = resolveComponent(client, interaction.customId);
        if (!comp) return;
        logger.info(`Component "${interaction.customId}" von ${interaction.user.tag}`);
        await comp.execute(client, interaction);
        return;
      }
    } catch (err) {
      if (err?.code === 10062) return; // Unknown interaction
      logger.error(`Interaction-Fehler (${interaction.commandName ?? interaction.customId}):`, err);
      const msg = interaction.inGuild() ? t(interaction.guildId, 'error.generic') : '❌ An error occurred.';
      await safeReply(interaction, msg);
    }
  },
};
