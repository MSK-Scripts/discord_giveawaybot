// Manager-Check: ManageGuild ODER konfigurierte managerRole.
import { PermissionFlagsBits } from 'discord.js';

/**
 * @param {import('discord.js').Interaction} interaction
 * @param {{ managerRole?: string|null }} settings
 * @returns {boolean}
 */
export function isManager(interaction, settings) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return true;
  }
  const managerRole = settings?.managerRole;
  if (managerRole && interaction.member?.roles?.cache?.has(managerRole)) {
    return true;
  }
  return false;
}

export default isManager;
