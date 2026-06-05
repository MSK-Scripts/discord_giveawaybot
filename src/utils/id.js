// Kurze, gut tippbare Giveaway-IDs (6 Zeichen).
// Alphabet ohne mehrdeutige Zeichen (0/O/1/I) -> Großbuchstaben + Ziffern 2-9.
import { customAlphabet } from 'nanoid';
import { prisma } from '../database/prisma.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ID_LENGTH = 6;
const MAX_RETRIES = 10;

const nano = customAlphabet(ALPHABET, ID_LENGTH);

/**
 * Generiert eine eindeutige, noch nicht in der DB vorhandene Giveaway-ID.
 * @returns {Promise<string>}
 */
export async function generateGiveawayId() {
  for (let i = 0; i < MAX_RETRIES; i++) {
    const id = nano();
    const existing = await prisma.giveaway.findUnique({ where: { id } });
    if (!existing) return id;
  }
  throw new Error('Konnte keine eindeutige Giveaway-ID generieren (zu viele Kollisionen).');
}

export default generateGiveawayId;
