// Teilnahme-Button (prefix "gw:join:<id>").
import { MessageFlags } from 'discord.js';
import {
  getGiveaway,
  addOrRemoveEntry,
  scheduleEmbedRefresh,
  endIfFirstClickComplete,
} from '../../services/giveawayService.js';
import { getSettings } from '../../services/settingsService.js';
import { checkEligibility, resolveGiveawayEligibility } from '../../utils/eligibility.js';
import { isFirstClick } from '../../utils/winnerMode.js';
import { logger } from '../../utils/logger.js';
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
      // In first-click mode "no longer active" is the normal case rather than a
      // mishap: somebody was faster. It should be phrased that way too.
      const key = isFirstClick(giveaway) && giveaway.status === 'ENDED' ? 'error.too_late' : 'error.not_active';
      return interaction.reply({ content: t(guildId, key), flags: MessageFlags.Ephemeral });
    }

    // Teilnahmebedingungen prüfen (Blacklist/Whitelist/Account-Alter/Zugehörigkeit).
    const settings = await getSettings(guildId);
    const member = interaction.member;
    if (member) {
      // Eigene Bedingungen des Giveaways gehen vor, sonst gelten die serverweiten.
      const effective = resolveGiveawayEligibility(settings, giveaway);
      const elig = checkEligibility(member, effective);
      if (!elig.ok) {
        return interaction.reply({ content: t(guildId, elig.reason, elig.vars), flags: MessageFlags.Ephemeral });
      }
    }

    const fast = isFirstClick(giveaway);
    // In first-click mode the entry is final: a second click must not hand back
    // a prize that has already been won.
    const action = await addOrRemoveEntry(id, interaction.user.id, { toggle: !fast });
    const key = { added: 'join.success', removed: 'join.removed', already: 'join.already' }[action];

    if (fast) {
      // Answer first (the interaction has three seconds), then check whether
      // this filled the giveaway. endGiveaway draws, posts, sends DMs and
      // issues coupons, which would blow that deadline.
      const reply = interaction.reply({ content: t(guildId, key), flags: MessageFlags.Ephemeral });
      endIfFirstClickComplete(client, giveaway)
        .then((ended) => {
          // Not full yet (several winners) -> update the entry count in the
          // embed as usual. If the giveaway has ended in the meantime,
          // refreshActiveEmbed leaves the message alone anyway.
          if (ended === null) scheduleEmbedRefresh(client, giveaway, settings);
        })
        .catch((err) => logger.error(`endIfFirstClickComplete(${id}):`, err));
      return reply;
    }

    // Throttled update of the entry count in the embed (fire-and-forget).
    scheduleEmbedRefresh(client, giveaway, settings);

    return interaction.reply({ content: t(guildId, key), flags: MessageFlags.Ephemeral });
  },
};
