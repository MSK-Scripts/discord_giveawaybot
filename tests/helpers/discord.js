/**
 * Minimal stand-ins for the discord.js objects the service layer touches.
 *
 * Only the handful of members the code actually reads are implemented, and the
 * fakes record what was sent so a test can assert "exactly one result message"
 * instead of guessing from the database state.
 */

/** A GuildMember as `checkEligibility` and `ticketWeight` see it. */
export function fakeMember(id, { roles = [], accountAgeDays = 365, memberAgeDays = 365 } = {}) {
  const set = new Set(roles);
  return {
    id,
    user: { id, username: `user${id.slice(-4)}`, createdTimestamp: Date.now() - accountAgeDays * 86_400_000 },
    joinedTimestamp: Date.now() - memberAgeDays * 86_400_000,
    roles: {
      cache: {
        has: (roleId) => set.has(roleId),
        hasAny: (...ids) => ids.some((roleId) => set.has(roleId)),
      },
    },
  };
}

/**
 * A Guild whose member fetch resolves the given users.
 * `delayMs` stretches the fetch so a test can act while a draw is in flight.
 */
export function fakeGuild(memberIds, { delayMs = 0, memberOptions = {} } = {}) {
  const members = new Map(memberIds.map((id) => [id, fakeMember(id, memberOptions[id])]));
  return {
    id: 'fake-guild',
    name: 'Fake Guild',
    members: {
      async fetch(arg) {
        if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
        if (typeof arg === 'string') {
          const member = members.get(arg);
          if (!member) throw new Error('Unknown Member');
          return member;
        }
        return members; // the bulk fetch returns a Collection; only .get() is used
      },
    },
  };
}

/**
 * A Client. `sent` collects every channel.send payload, `edits` every message edit.
 * Without a guild, `guilds.fetch` rejects the way it does for a guild the bot left.
 */
export function fakeClient({ guild = null, channel = true } = {}) {
  const sent = [];
  const edits = [];
  const dms = [];

  const channelStub = {
    id: '100000000000000001',
    async send(payload) {
      sent.push(payload);
      return { id: `msg-${sent.length}` };
    },
    messages: {
      async fetch() {
        return {
          async edit(payload) {
            edits.push(payload);
          },
        };
      },
    },
  };

  return {
    sent,
    edits,
    dms,
    guilds: {
      async fetch() {
        if (!guild) throw new Error('Unknown Guild');
        return guild;
      },
      cache: { get: () => guild },
    },
    channels: {
      async fetch() {
        if (!channel) throw new Error('Unknown Channel');
        return channelStub;
      },
    },
    users: {
      async fetch(userId) {
        return {
          id: userId,
          username: `user${userId.slice(-4)}`,
          async send(payload) {
            dms.push({ userId, payload });
          },
        };
      },
    },
  };
}
