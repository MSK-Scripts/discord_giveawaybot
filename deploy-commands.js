// Registriert die Slash-Commands bei Discord.
//   Standard  : mit GUILD_ID -> Guild-Commands (sofort sichtbar, ideal für Dev),
//               ohne GUILD_ID -> globale Commands.
//   --global  : globale Commands registrieren UND die Guild-Commands der GUILD_ID
//               entfernen (verhindert Duplikate). Propagation kann bis zu 1h dauern.
import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModules } from './src/handlers/loadFiles.js';
import { logger } from './src/utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID?.trim();

  if (!token || !clientId) {
    logger.error('DISCORD_TOKEN und CLIENT_ID müssen in der .env gesetzt sein.');
    process.exit(1);
  }

  const modules = await loadModules(join(__dirname, 'src', 'commands'));
  const body = [];
  for (const { path, module } of modules) {
    const cmd = module.default;
    if (!cmd?.data) {
      logger.warn(`Command ohne data übersprungen: ${path}`);
      continue;
    }
    body.push(cmd.data.toJSON());
  }

  const rest = new REST({ version: '10' }).setToken(token);
  const globalMode = process.argv.includes('--global');

  if (globalMode) {
    await rest.put(Routes.applicationCommands(clientId), { body });
    logger.success(`${body.length} globale Commands registriert (Propagation bis zu 1h).`);
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
      logger.success(`Guild-Commands in ${guildId} entfernt (keine Duplikate).`);
    }
  } else if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
    logger.success(`${body.length} Guild-Commands registriert (Guild ${guildId}).`);
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body });
    logger.success(`${body.length} globale Commands registriert.`);
  }
}

main().catch((err) => {
  logger.error('Deploy-Fehler:', err);
  process.exit(1);
});
