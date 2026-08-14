/**
 * Entry conditions and bonus tickets. No database, no Discord — runs everywhere.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkEligibility, ticketWeight, mergeGiveawayEligibility } from '../src/utils/eligibility.js';
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

test('per-giveaway roles merge with the server-wide ones', () => {
  const settings = { blacklist: ['g-black'], whitelist: ['g-white'], bonusRoles: { [BONUS]: 2 } };
  const giveaway = {
    blacklistRoles: JSON.stringify(['gw-black']),
    whitelistRoles: JSON.stringify(['g-white', 'gw-white']),
    bonusRoles: JSON.stringify({ [BONUS]: 3, 'gw-bonus': 1 }),
  };

  const merged = mergeGiveawayEligibility(settings, giveaway);
  assert.deepEqual(merged.blacklist, ['g-black', 'gw-black'], 'union');
  assert.deepEqual(merged.whitelist, ['g-white', 'gw-white'], 'union without duplicates');
  assert.deepEqual(merged.bonusRoles, { [BONUS]: 5, 'gw-bonus': 1 }, 'bonus tickets are added up per role');
});

test('unreadable JSON columns fall back to empty instead of throwing', () => {
  const merged = mergeGiveawayEligibility(
    { blacklist: [], whitelist: [], bonusRoles: {} },
    { blacklistRoles: 'not json', whitelistRoles: '{"not":"an array"}', bonusRoles: '[1,2]' },
  );
  assert.deepEqual(merged.blacklist, []);
  assert.deepEqual(merged.whitelist, []);
  assert.deepEqual(merged.bonusRoles, {});
});
