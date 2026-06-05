// Einstiegspunkt: Env laden, Locales laden, Handler registrieren, einloggen.
import 'dotenv/config';
import { client } from './client.js';
import { loadCommands } from './handlers/commandHandler.js';
import { loadEvents } from './handlers/eventHandler.js';
import { loadComponents } from './handlers/componentHandler.js';
import { loadLocales } from './utils/i18n.js';
import { logger } from './utils/logger.js';

process.on('unhandledRejection', (reason) => logger.error('unhandledRejection:', reason));
process.on('uncaughtException', (err) => logger.error('uncaughtException:', err));

async function main() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    logger.error('DISCORD_TOKEN fehlt in der .env.');
    process.exit(1);
  }

  const langs = loadLocales();
  logger.info(`Locales geladen: ${langs.join(', ')}.`);

  await loadCommands(client);
  await loadComponents(client);
  await loadEvents(client);

  await client.login(token);
}

main().catch((err) => {
  logger.error('Fataler Startfehler:', err);
  process.exit(1);
});
