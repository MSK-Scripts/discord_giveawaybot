// Teilnahme-Button (prefix "gw:join:<id>").
import { MessageFlags } from 'discord.js';
import { getGiveaway, addOrRemoveEntry, scheduleEmbedRefresh } from '../../services/giveawayService.js';
import { getSettings } from '../../services/settingsService.js';
import { checkEligibility } from '../../utils/eligibility.js';
import { t } from '../../utils/i18n.js';

export default {
  prefix: 'gw:join:',
  async execute(client, interaction) {
    const guildId = interaction.guildId;
    const id = interaction.customId.split(':')[2];

    const giveaway = await getGiveaway(id, guildId);
    if (!giveaway) {
      return interaction.reply({ content: t(guildId, 'error.not_found'), flags: MessageFlags.Ephemeral });
    }
    if (giveaway.status === 'PAUSED') {
      return interaction.reply({ content: t(guildId, 'error.paused'), flags: MessageFlags.Ephemeral });
    }
    if (giveaway.status !== 'ACTIVE') {
      return interaction.reply({ content: t(guildId, 'error.not_active'), flags: MessageFlags.Ephemeral });
    }

    // Teilnahmebedingungen prüfen (Blacklist/Whitelist/Account-Alter/Zugehörigkeit).
    const settings = await getSettings(guildId);
    const member = interaction.member;
    if (member) {
      const elig = checkEligibility(member, settings);
      if (!elig.ok) {
        return interaction.reply({ content: t(guildId, elig.reason, elig.vars), flags: MessageFlags.Ephemeral });
      }
    }

    const action = await addOrRemoveEntry(id, interaction.user.id);
    const key = action === 'added' ? 'join.success' : 'join.removed';

    // Teilnehmerzahl im Embed gedrosselt aktualisieren (fire-and-forget).
    scheduleEmbedRefresh(client, giveaway, settings);

    return interaction.reply({ content: t(guildId, key), flags: MessageFlags.Ephemeral });
  },
};
