/**
 * Scheduled giveaways: stored now, posted by the scheduler at startAt.
 *
 * Three things are at stake. The message must go out exactly once, even when
 * ticks overlap (the same atomic claim as for ending). A post that fails must
 * leave a CANCELLED giveaway and a log line behind, never a silently deleted
 * one. And everything that counts or lists giveaways has to know the new
 * status, or a scheduled giveaway is invisible until it starts.
 *
 * Skipped without TEST_DATABASE_URL, see tests/helpers/db.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { openTestDb, skipDb, cleanup, createTestGiveaway, testGuildId } from './helpers/db.js';

const prisma = await openTestDb();
const skip = skipDb;

const service = skip ? {} : await import('../src/services/giveawayService.js');
const scheduler = skip ? {} : await import('../src/services/scheduler.js');
const settingsService = skip ? {} : await import('../src/services/settingsService.js');
const i18n = skip ? {} : await import('../src/utils/i18n.js');
if (!skip) i18n.loadLocales();

const CHANNEL = '100000000000000001';
const LOG = '100000000000000009';
const HOUR = 3_600_000;

test.after(async () => {
  await cleanup(prisma);
  await prisma?.$disconnect();
});

/**
 * A client whose giveaway channel records posts (or fails them) and whose log
 * channel records log lines. `onSend` runs inside channel.send before it
 * answers, so a test can act while a post is in flight.
 */
function schedulingClient({ failWith = null, onSend = null, missingChannel = false } = {}) {
  const client = { sent: [], logs: [], deleted: [] };
  const channel = {
    id: CHANNEL,
    async send(payload) {
      if (onSend) await onSend();
      if (failWith) throw failWith;
      client.sent.push(payload);
      const id = `msg-${client.sent.length}`;
      return { id, async delete() { client.deleted.push(id); } };
    },
    messages: { async fetch() { return { async edit() {} }; } },
  };
  const logChannel = { id: LOG, async send(payload) { client.logs.push(payload.content); return {}; } };
  return Object.assign(client, {
    user: { id: '999999999999999999' },
    guilds: { fetch: async () => { throw new Error('Unknown Guild'); }, cache: { get: () => null } },
    channels: {
      fetch: async (id) => {
        if (id === LOG) return logChannel;
        if (missingChannel) throw Object.assign(new Error('Unknown Channel'), { code: 10003 });
        return channel;
      },
    },
    users: { fetch: async () => null },
  });
}

async function scheduled(overrides = {}) {
  const guildId = testGuildId();
  await prisma.guildSettings.create({ data: { guildId, logChannel: LOG } });
  settingsService.evict(guildId);
  const startAt = overrides.startAt ?? new Date(Date.now() - 1000);
  return createTestGiveaway(prisma, guildId, {
    status: 'SCHEDULED',
    startAt,
    endAt: new Date(startAt.getTime() + HOUR),
    ...overrides,
  });
}

const row = (id) => prisma.giveaway.findUnique({ where: { id } });
const footerOf = (payload) => (payload.embeds[0].data ?? payload.embeds[0]).footer.text;

test('a due scheduled giveaway is claimed, posted once and logged', { skip }, async () => {
  const gw = await scheduled();
  const client = schedulingClient();

  await scheduler.runSchedulerTick(client);
  const after = await row(gw.id);
  assert.equal(after.status, 'ACTIVE');
  assert.equal(after.messageId, 'msg-1');
  assert.equal(client.sent.length, 1);
  assert.ok(footerOf(client.sent[0]).includes(gw.id), 'the real giveaway embed, with its ID');
  assert.ok(client.logs.some((l) => l.includes(gw.id) && l.includes('started')));

  await scheduler.runSchedulerTick(client);
  assert.equal(client.sent.length, 1, 'a second tick does not post again');
});

test('concurrent starts post the message exactly once', { skip }, async () => {
  const gw = await scheduled();
  const client = schedulingClient({ onSend: () => new Promise((r) => setTimeout(r, 100)) });

  const results = await Promise.all([1, 2, 3, 4].map(() => service.startScheduledGiveaway(client, gw)));
  assert.equal(results.filter((r) => r?.ok).length, 1, 'one claim wins');
  assert.equal(results.filter((r) => r === null).length, 3, 'the others find nothing to do');
  assert.equal(client.sent.length, 1);
});

test('a scheduled giveaway in the future is left alone', { skip }, async () => {
  const gw = await scheduled({ startAt: new Date(Date.now() + HOUR) });
  const client = schedulingClient();
  await scheduler.runSchedulerTick(client);
  assert.equal((await row(gw.id)).status, 'SCHEDULED');
  assert.equal(client.sent.length, 0);
});

test('a failed post cancels the giveaway, logs why and keeps the row', { skip }, async () => {
  const gw = await scheduled();
  const client = schedulingClient({ failWith: new Error('Missing Permissions') });

  await scheduler.runSchedulerTick(client);
  const after = await row(gw.id);
  assert.ok(after, 'never deleted');
  assert.equal(after.status, 'CANCELLED');
  assert.ok(after.endedAt);
  assert.equal(after.messageId, null);
  const line = client.logs.find((l) => l.includes(gw.id));
  assert.ok(line?.includes('could not be posted'), 'the log channel says what happened');
  assert.ok(line?.includes('Missing Permissions'), 'and why');

  await scheduler.runSchedulerTick(client);
  assert.equal(client.logs.filter((l) => l.includes(gw.id)).length, 1, 'no retry loop on a cancelled giveaway');
});

test('a deleted channel cancels the giveaway the same way', { skip }, async () => {
  const gw = await scheduled();
  await scheduler.runSchedulerTick(schedulingClient({ missingChannel: true }));
  assert.equal((await row(gw.id)).status, 'CANCELLED');
});

test('a start that comes late keeps the full duration', { skip }, async () => {
  const startAt = new Date(Date.now() - 2 * HOUR);
  const gw = await scheduled({ startAt, endAt: new Date(startAt.getTime() + 3 * HOUR) });
  const before = Date.now();
  await scheduler.runSchedulerTick(schedulingClient());
  const after = await row(gw.id);
  assert.equal(after.status, 'ACTIVE');
  assert.ok(after.startAt.getTime() >= before, 'startAt is when it really went out');
  assert.ok(Math.abs(after.endAt.getTime() - (after.startAt.getTime() + 3 * HOUR)) < 2_000, 'three hours from the real start');
});

test('a giveaway cancelled while its message goes out gets the message taken down', { skip }, async () => {
  const gw = await scheduled();
  const client = schedulingClient({
    onSend: () => prisma.giveaway.update({ where: { id: gw.id }, data: { status: 'CANCELLED', endedAt: new Date() } }),
  });
  const res = await service.startScheduledGiveaway(client, gw);
  assert.deepEqual(res, { ok: false, error: 'gone' });
  assert.deepEqual(client.deleted, ['msg-1'], 'no dead button left in the channel');
  assert.equal((await row(gw.id)).status, 'CANCELLED');
});

test('cancelling a scheduled giveaway touches no message', { skip }, async () => {
  const gw = await scheduled({ startAt: new Date(Date.now() + HOUR) });
  const client = schedulingClient();
  const settings = await settingsService.getSettings(gw.guildId);
  await service.cancelAndFinalize(client, gw, settings, { actor: 'test' });
  assert.equal((await row(gw.id)).status, 'CANCELLED');
  assert.equal(client.sent.length, 0);
  assert.ok(client.logs.some((l) => l.includes(gw.id)), 'logged like any cancel');
});

test('stats and /glist know the scheduled status', { skip }, async () => {
  const gw = await scheduled({ startAt: new Date(Date.now() + HOUR) });
  await createTestGiveaway(prisma, gw.guildId, { endAt: new Date(Date.now() + 2 * HOUR) });

  const stats = await service.getGuildStats(gw.guildId);
  assert.equal(stats.scheduled, 1);
  assert.equal(stats.active, 1);
  assert.equal(stats.total, 2, 'the total includes scheduled giveaways');

  const listed = await service.listActive(gw.guildId);
  assert.deepEqual(listed.map((g) => g.status).sort(), ['ACTIVE', 'SCHEDULED']);

  const { buildListEmbed, buildStatsEmbed, buildInfoEmbed } = await import('../src/utils/embeds.js');
  const settings = await settingsService.getSettings(gw.guildId);
  const list = buildListEmbed(gw.guildId, listed, settings).toJSON();
  const field = list.fields?.find((f) => f.name === i18n.t('en', 'list.scheduled_title'));
  assert.ok(field?.value.includes(gw.id), 'the scheduled one has its own field');
  assert.ok(!list.description.includes(gw.id), 'and is not listed as running');

  const statsEmbed = buildStatsEmbed(gw.guildId, settings, stats).toJSON();
  assert.ok(statsEmbed.fields.some((f) => f.name === i18n.t('en', 'giveaway.status.scheduled') && f.value === '1'));

  const info = buildInfoEmbed(gw.guildId, gw, { settings }).toJSON();
  assert.ok(info.fields.some((f) => f.name === i18n.t('en', 'info.field.starts')));
  assert.ok(info.fields.some((f) => f.value === i18n.t('en', 'giveaway.status.scheduled')));
});

// ── the slash command path ──────────────────────────────────────────────────

function fakeInteraction(guildId, { customId, options = {}, fields = {} } = {}) {
  const replies = [];
  const modals = [];
  return {
    replies,
    modals,
    guildId,
    customId,
    channelId: CHANNEL,
    user: { id: '300000000000000001' },
    memberPermissions: { has: () => true }, // Manage Server
    options: { getString: (name) => options[name] ?? null },
    fields: { getTextInputValue: (id) => fields[id] ?? '' },
    channel: {
      id: CHANNEL,
      permissionsFor: () => ({ has: () => true }),
      async send() { throw new Error('a scheduled giveaway must not be posted on submit'); },
    },
    async reply(payload) { replies.push(payload); },
    async showModal(modal) { modals.push(modal); },
  };
}

test('/gcreate refuses an invalid start_in before the modal opens, and carries a valid one', { skip }, async () => {
  const gcreate = (await import('../src/commands/gcreate.js')).default;
  assert.ok(gcreate.data.toJSON().options.some((o) => o.name === 'start_in'), 'the option is registered');

  const guildId = testGuildId();
  const bad = fakeInteraction(guildId, { options: { start_in: 'soon' } });
  await gcreate.execute(schedulingClient(), bad);
  assert.equal(bad.modals.length, 0);
  assert.equal(bad.replies[0].content, i18n.t(guildId, 'create.invalid_start'));

  const good = fakeInteraction(guildId, { options: { start_in: '2h' } });
  await gcreate.execute(schedulingClient(), good);
  assert.equal(good.modals.length, 1);
  assert.match(good.modals[0].data.custom_id, /^gw:create:ALL:RANDOM:7200000$/);

  const now = fakeInteraction(guildId, {});
  await gcreate.execute(schedulingClient(), now);
  assert.equal(now.modals[0].data.custom_id, 'gw:create:ALL:RANDOM', 'without start_in the customId stays as before');
});

test('the /gcreate modal schedules instead of posting when a start came along', { skip }, async () => {
  const modal = (await import('../src/components/modals/gcreateModal.js')).default;
  const guildId = testGuildId();
  const fields = { title: 'Later', description: 'Text', duration: '1h', winners: '1', prizes: 'Prize' };
  const client = schedulingClient();

  const before = Date.now();
  const interaction = fakeInteraction(guildId, { customId: 'gw:create:ALL:RANDOM:7200000', fields });
  await modal.execute(client, interaction);

  const [gw] = await prisma.giveaway.findMany({ where: { guildId } });
  assert.ok(gw, 'created');
  assert.equal(gw.status, 'SCHEDULED');
  assert.equal(gw.messageId, null);
  assert.ok(gw.startAt.getTime() >= before + 2 * HOUR && gw.startAt.getTime() <= Date.now() + 2 * HOUR);
  assert.equal(gw.endAt.getTime() - gw.startAt.getTime(), HOUR, 'the duration counts from the start');
  assert.equal(client.sent.length, 0);
  assert.ok(interaction.replies[0].content.includes(gw.id));

  const forged = fakeInteraction(guildId, { customId: 'gw:create:ALL:RANDOM:5', fields });
  await modal.execute(client, forged);
  assert.equal(forged.replies[0].content, i18n.t(guildId, 'create.invalid_start'));
  assert.equal(await prisma.giveaway.count({ where: { guildId } }), 1, 'a forged offset creates nothing');
});

test('the commands that need a running giveaway refuse a scheduled one with its start', { skip }, async () => {
  const gw = await scheduled({ startAt: new Date(Date.now() + HOUR), id: `TSCH${Date.now() % 100000}` });
  for (const name of ['gend', 'gpause', 'gresume', 'gextend', 'greroll']) {
    const command = (await import(`../src/commands/${name}.js`)).default;
    const interaction = fakeInteraction(gw.guildId, { options: { id: gw.id, duration: '1h' } });
    interaction.options.getUser = () => null;
    await command.execute(schedulingClient(), interaction);
    assert.ok(interaction.replies[0]?.content.includes('<t:'), `${name} names the start`);
    assert.equal(interaction.replies[0].content, i18n.t(gw.guildId, 'error.scheduled', { starts: `<t:${Math.floor(gw.startAt.getTime() / 1000)}:R>` }));
  }
  assert.equal((await row(gw.id)).status, 'SCHEDULED', 'nothing changed');
});
