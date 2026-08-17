/**
 * Entry conditions and bonus tickets. No database, no Discord — runs everywhere.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkEligibility, ticketWeight, resolveGiveawayEligibility, overrides, listToEdit, bonusToEdit,
} from '../src/utils/eligibility.js';
import { fakeMember } from './helpers/discord.js';

const BLOCKED = 'role-blocked';
const ALLOWED = 'role-allowed';
const BONUS = 'role-bonus';

test('an empty blacklist and whitelist let everyone in', () => {
  assert.deepEqual(checkEligibility(fakeMember('1'), { blacklist: [], whitelist: [] }), { ok: true });
});

test('a blacklisted role blocks, and it wins over a held whitelist role', () => {
  const member = fakeMember('1', { roles: [BLOCKED, ALLOWED] });
  const result = checkEligibility(member, { blacklist: [BLOCKED], whitelist: [ALLOWED] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'join.blacklisted');
});

test('a set whitelist requires at least one of its roles', () => {
  const settings = { blacklist: [], whitelist: [ALLOWED] };
  assert.equal(checkEligibility(fakeMember('1', { roles: [ALLOWED] }), settings).ok, true);

  const without = checkEligibility(fakeMember('2', { roles: ['role-other'] }), settings);
  assert.equal(without.ok, false);
  assert.equal(without.reason, 'join.not_whitelisted');
});

test('minimum account and membership age are checked in days', () => {
  const young = fakeMember('1', { accountAgeDays: 3, memberAgeDays: 30 });
  const tooNew = checkEligibility(young, { minAccountDays: 7 });
  assert.equal(tooNew.ok, false);
  assert.equal(tooNew.reason, 'join.account_too_new');
  assert.deepEqual(tooNew.vars, { days: 7 });

  assert.equal(checkEligibility(young, { minAccountDays: 3 }).ok, true, 'exactly the minimum is enough');

  const fresh = fakeMember('2', { accountAgeDays: 400, memberAgeDays: 1 });
  assert.equal(checkEligibility(fresh, { minMemberDays: 7 }).reason, 'join.member_too_new');
  assert.equal(checkEligibility(fresh, { minMemberDays: 0 }).ok, true, '0 turns the check off');
});

test('bonus roles add tickets, everyone starts with one', () => {
  assert.equal(ticketWeight(fakeMember('1'), {}), 1);
  assert.equal(ticketWeight(fakeMember('1', { roles: [BONUS] }), { bonusRoles: { [BONUS]: 4 } }), 5);
  assert.equal(ticketWeight(fakeMember('1'), { bonusRoles: { [BONUS]: 4 } }), 1, 'without the role, no bonus');

  // Several bonus roles stack.
  const both = fakeMember('1', { roles: [BONUS, ALLOWED] });
  assert.equal(ticketWeight(both, { bonusRoles: { [BONUS]: 2, [ALLOWED]: 3 } }), 6);

  // Garbage in the JSON column must not produce NaN tickets.
  assert.equal(ticketWeight(both, { bonusRoles: { [BONUS]: 'nope', [ALLOWED]: -5 } }), 1);
});

test('per-giveaway roles replace the server-wide ones', () => {
  const settings = { blacklist: ['g-black'], whitelist: ['g-white'], bonusRoles: { [BONUS]: 2 } };
  const giveaway = {
    blacklistRoles: JSON.stringify(['gw-black']),
    whitelistRoles: JSON.stringify(['gw-white']),
    bonusRoles: JSON.stringify({ [BONUS]: 3, 'gw-bonus': 1 }),
  };

  const eff = resolveGiveawayEligibility(settings, giveaway);
  assert.deepEqual(eff.blacklist, ['gw-black'], 'the server-wide role does not come along');
  assert.deepEqual(eff.whitelist, ['gw-white']);
  assert.deepEqual(eff.bonusRoles, { [BONUS]: 3, 'gw-bonus': 1 }, 'not added to the server-wide 2');
});

test('a field the giveaway does not set keeps the server-wide value', () => {
  const settings = { blacklist: ['g-black'], whitelist: ['g-white'], bonusRoles: { [BONUS]: 2 } };

  // Every field on its own: null means "nothing of its own here".
  const nothing = resolveGiveawayEligibility(settings, { blacklistRoles: null, whitelistRoles: null, bonusRoles: null });
  assert.deepEqual(nothing.blacklist, ['g-black']);
  assert.deepEqual(nothing.whitelist, ['g-white']);
  assert.deepEqual(nothing.bonusRoles, { [BONUS]: 2 });

  // Mixed: an own blacklist, the rest inherited.
  const mixed = resolveGiveawayEligibility(settings, { blacklistRoles: JSON.stringify(['gw-black']) });
  assert.deepEqual(mixed.blacklist, ['gw-black']);
  assert.deepEqual(mixed.whitelist, ['g-white'], 'untouched fields stay server-wide');
  assert.deepEqual(mixed.bonusRoles, { [BONUS]: 2 });
});

test('an empty list is an override, not an absent one', () => {
  // This is the whole point of the distinction: a giveaway may switch the
  // server-wide blacklist off for itself.
  const settings = { blacklist: ['g-black'], whitelist: ['g-white'], bonusRoles: { [BONUS]: 2 } };
  const eff = resolveGiveawayEligibility(settings, {
    blacklistRoles: '[]', whitelistRoles: '[]', bonusRoles: '{}',
  });
  assert.deepEqual(eff.blacklist, []);
  assert.deepEqual(eff.whitelist, []);
  assert.deepEqual(eff.bonusRoles, {});

  assert.equal(overrides('[]'), true);
  assert.equal(overrides(null), false);
  assert.equal(overrides(undefined), false);
  assert.equal(overrides(''), false, 'an old empty string means the same as NULL');
});

test('the first single change to a giveaway starts from the server-wide list', () => {
  // /gsettings … giveaway_id changes one role at a time. Starting from an empty
  // list would turn "add one role" into "switch all the others off".
  assert.deepEqual(listToEdit(null, ['g-black']), ['g-black'], 'copied, not empty');
  assert.deepEqual(listToEdit(JSON.stringify(['gw-black']), ['g-black']), ['gw-black'], 'its own list wins');
  assert.deepEqual(listToEdit('[]', ['g-black']), [], 'a deliberate empty list stays empty');

  assert.deepEqual(bonusToEdit(null, { [BONUS]: 2 }), { [BONUS]: 2 });
  assert.deepEqual(bonusToEdit(JSON.stringify({ [BONUS]: 4 }), { [BONUS]: 2 }), { [BONUS]: 4 });

  // The copy must not be the same object, otherwise editing it would change the
  // cached server settings on the side.
  const server = ['g-black'];
  listToEdit(null, server).push('extra');
  assert.deepEqual(server, ['g-black']);
});

test('unreadable JSON columns fall back to empty instead of throwing', () => {
  const eff = resolveGiveawayEligibility(
    { blacklist: ['g-black'], whitelist: [], bonusRoles: {} },
    { blacklistRoles: 'not json', whitelistRoles: '{"not":"an array"}', bonusRoles: '[1,2]' },
  );
  // Broken but present: the field counts as set, so the server-wide list does
  // not slip back in through the back door.
  assert.deepEqual(eff.blacklist, []);
  assert.deepEqual(eff.whitelist, []);
  assert.deepEqual(eff.bonusRoles, {});
});
