// Discord-Client-Instanz. Nur der Guilds-Intent ist nötig (Slash Commands,
// Buttons, Modals laufen darüber). Keine privilegierten Intents.
import { Client, GatewayIntentBits, Collection } from 'discord.js';

export const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// Container für dynamisch geladene Commands/Components.
client.commands = new Collection();
client.components = new Collection(); // exakte customIds
client.componentPrefixes = new Collection(); // prefix -> handler

export default client;
