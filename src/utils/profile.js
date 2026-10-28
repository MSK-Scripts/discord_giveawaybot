/**
 * Display name and avatar of a winner, for the dashboard.
 *
 * Captured at draw time from the GuildMember the draw fetched anyway, so it
 * costs no extra REST call and shows the name as it was on that server when the
 * person won (nickname first). Both helpers are tolerant: whatever is missing
 * comes back as null, they never throw.
 */

// VARCHAR(191) and VARCHAR(512) in the Winner table. Discord names are far
// shorter, the limits only keep an odd value from failing the whole insert.
export const MAX_DISPLAY_NAME = 191;
export const MAX_AVATAR_URL = 512;
const AVATAR_SIZE = 128;

function clean(name) {
  if (name == null) return null;
  const value = String(name).trim();
  return value ? value.slice(0, MAX_DISPLAY_NAME) : null;
}

function avatarOf(target) {
  if (typeof target?.displayAvatarURL !== 'function') return null;
  try {
    const url = target.displayAvatarURL({ size: AVATAR_SIZE });
    return typeof url === 'string' && url.length <= MAX_AVATAR_URL ? url : null;
  } catch {
    return null;
  }
}

/**
 * Profile of a guild member: the server nickname, else the global display
 * name, else the username, plus the avatar shown on that server.
 * @returns {{displayName: string|null, avatarUrl: string|null}}
 */
export function memberProfile(member) {
  if (!member) return { displayName: null, avatarUrl: null };
  return {
    displayName: clean(member.displayName ?? member.nickname ?? member.user?.globalName ?? member.user?.username),
    avatarUrl: avatarOf(member),
  };
}

/**
 * Profile of a plain user (no server context): global display name, else the
 * username. Used for winners drawn before the names were stored.
 * @returns {{displayName: string|null, avatarUrl: string|null}}
 */
export function userProfile(user) {
  if (!user) return { displayName: null, avatarUrl: null };
  return {
    displayName: clean(user.globalName ?? user.username),
    avatarUrl: avatarOf(user),
  };
}
