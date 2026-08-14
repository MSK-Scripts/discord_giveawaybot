# Changelog

All notable changes to the **MSK Giveaway Bot**. Format based on [Keep a Changelog](https://keepachangelog.com).

## [Unreleased]

### Added
- **Automatic Tebex coupons for winners.** A giveaway can be configured (in the web dashboard) to hand every winner a personal discount code in their DM: a percentage, optionally limited to selected packages, optionally with an expiry. Each winner gets their **own** single-use code, and a reroll revokes the replaced winner's code in the store before issuing a new one. The code only ever appears in the DM, never in the public result message or on the results page.
  Every guild uses **its own Tebex store** — the bot is not tied to msk-scripts.de. The guild owner stores their Tebex plugin secret in the dashboard and the bot calls `plugin.tebex.io` directly with it.
  **The secret is encrypted at rest** (AES-256-GCM, key in `TEBEX_SECRET_KEY`, i.e. outside the database) and never leaves the bot through the regular settings endpoint — those only report whether one is configured, its last four characters and when it was set. Hashing was not an option here: the bot has to send the value to Tebex, and a hash cannot be reversed. A stolen database dump or backup is therefore worthless on its own; someone with access to the bot host can still decrypt, which no design can prevent for a service that must use the key.
  Because a Tebex plugin secret is **unscoped full access** to a store, storing, revealing and deleting it is restricted to the **guild owner** — stricter than the rest of the dashboard, which allows any administrator. The bot verifies ownership against Discord's own `guild.ownerId` rather than trusting a flag from the shop.
  New env variable `TEBEX_SECRET_KEY` (32-byte hex). Rotating it makes all stored store secrets unreadable; owners have to enter them again.
- **Test suite (`npm test`, `node:test`)** — 33 tests, no framework and no new dependency. The concurrency tests run against a real database on purpose: what they verify is that MariaDB serialises a conditional `UPDATE` and rejects a duplicate `INSERT`, and a mocked client would only prove that the mock behaves the way the test author imagined. Covered: several callers ending the same giveaway hand out the prize exactly once and the status flips to `ENDED` before the draw begins (so nobody can still join during it); overlapping scheduler ticks post one result message and one "ending soon" reminder; a guild without a settings row survives ten simultaneous readers; the draw re-checks the entry conditions and skips members who left. Plus unit tests for eligibility, bonus tickets and duration parsing that need neither database nor Discord.
  The tests need their own database in `TEST_DATABASE_URL` and refuse to share one with `DATABASE_URL`, because a scheduler tick ends every giveaway that is due in the database it is pointed at. Without the variable the database tests skip, so `npm test` still works. `npm run test:db` applies the migrations; CI runs the full suite against a MariaDB service container.
- `runSchedulerTick` is exported from the scheduler so a single tick can be triggered deterministically instead of waiting on the 10-second interval.

### Changed
- **`package.json` was still at `1.0.0`** while the changelog and the release tags had reached `1.4.0`. The version is not printed anywhere in the bot, so nothing behaved wrongly, but the next release through `release.yml` would have run into it.
- **Ending a giveaway is now claimed in the database.** `endGiveaway` performs the `ACTIVE -> ENDED` transition as a single atomic `UPDATE` and only continues when that update actually hits a row. The previous in-memory lock only protected a single process, and it left a window of several seconds (the winner draw with its REST calls) in which a second instance could have ended the same giveaway and handed out the prize twice. The claim happens before the draw: if anything fails afterwards the giveaway is ended without a result message, which `/greroll <id>` can fix, whereas a prize handed out twice could not be undone.

### Fixed
- **Clicking the participate button twice no longer answers with an error.** `addOrRemoveEntry` is a read-then-write with an await in between, so a double click (or a click from two devices) produced two calls that both found no entry and both inserted. The unique constraint kept the data correct, but the losing click failed — as `P2002` when joining, and as a code-less error carrying MySQL 1020 when leaving. Joining now re-reads after a failed insert and accepts the row the other click created, leaving uses `deleteMany`, which reports "no rows" instead of failing. Found by the new concurrency tests, not in production.
- **`getSettings` no longer throws when two callers reach a guild without a settings row at the same time.** The default insert was a read-then-create, so the loser of that race failed with a unique-constraint error that surfaced far from its cause — in one reproduction it aborted a giveaway that was in the middle of ending. Insert and retry now share one helper (`ensureRow`), used by `getSettings` and `createDefaults`, which re-reads the row when the write fails and only rethrows if the row still does not exist. The retry deliberately ignores the error code, because Prisma reports the collision as `P2002` for a plain create but as a code-less error carrying MySQL 1020 for an upsert against MariaDB.
- `npm run i18n:check` now also compares the **placeholders** of every value against English, not just the key sets. A translation that drops `{count}` silently loses information, and a misspelled `{titel}` instead of `{title}` used to render the literal braces to users without any check noticing.

### Security / hardening
- Pinned a patched **`undici` (`^6.28.0`)** via an npm `overrides` entry, resolving 4 transitive advisories (1 high / 3 moderate) pulled in through `discord.js` → `@discordjs/rest`/`@discordjs/ws` (HTTP header injection via `Set-Cookie`, WebSocket DoS, response-queue poisoning, `SameSite` downgrade). discord.js itself is already on the latest 14.x but still pins the vulnerable `undici@6.24.1`; the override stays inside the same 6.x major, so it is API-compatible. `npm audit` now reports **0 vulnerabilities** — no discord.js downgrade required.

## [1.4.0]

### Added
- **Web dashboard (msk-scripts.de/giveaway/dashboard)** — manage giveaways from the browser: create, edit, extend, pause/resume, end, cancel, reroll (all or a single winner) and edit per-server settings. Access via Discord login (Manage Server). All actions are forwarded to the running bot, so the Discord embed/button/DMs/log and the settings cache stay consistent.
- **Localhost control endpoint** (`services/controlServer.js`) — a lightweight HTTP server bound to `127.0.0.1` only, authenticated with a shared secret (`CONTROL_SECRET`), that the shop's dashboard proxies management actions to.
- **Public results pages (msk-scripts.de/giveaway/g/…)** — when a giveaway ends (or is rerolled), the bot publishes a hosted results page showing the **winners (username)** and the **anonymous participant count** (never the participant list), and links it in the results message and winner DMs. New `result.link` locale key (en/de/fr/es).
- New locale keys for the expanded logging: `log.setting`, `log.extended`, `log.reminder` (en/de/fr/es).

### Changed
- **Complete event logging** — the configured log channel now records **everything the bot does and every setting that is changed**, not just a subset. This covers the full giveaway lifecycle (create / edit / extend / end / cancel / reroll — including single-winner reroll, pause and resume), posted "ending soon" reminders, **and every actual `/gsettings` change** (with the acting user and the changed detail). No-op or invalid settings inputs are not logged, and individual entries (button join/leave) are deliberately excluded to avoid channel spam.
- Discord side-effects for cancel/reroll were extracted into the service layer (`cancelAndFinalize`, `rerollAll`, `rerollSingle`) so the slash commands and the dashboard share one implementation.

### Security / hardening
- The post-OAuth intermediate session for the dashboard is now **scope-bound** (`giveaway-verify`), so a ticketbot session token can never be reused as a giveaway one (and vice-versa).
- Public results pages store **winner usernames only — no Discord user IDs** (data minimisation).
- Control endpoint: oversized request bodies return `413` without tearing down the socket mid-stream; `end` reports `409` when there was nothing to end. Winner username resolution is parallelised. Discord OAuth responses are checked for `ok` before use.

## [1.3.0]

### Added
- **Winner DMs** — winners now receive a direct message with the prize, optional claim instructions and a link to the giveaway.
- **Optional prize** — a 5th `/gcreate` modal field; shown in the giveaway embed and the winner DM.
- **Requirements in the embed** — active giveaways list their eligibility rules (required/blocked roles, min account/membership age).
- **`/gedit`** — edit a running giveaway (title, description, winners, prize).
- **`/gextend`** — extend a running giveaway's end time.
- **`/gstats`** — per-server giveaway statistics (totals, entries, winners, win rate).
- **`/greroll <id> [winner]`** — optionally replace a single winner instead of redrawing all.
- **"Ending soon" reminder** — `/gsettings set reminder <minutes>` posts a reminder before a giveaway ends.
- **Claim instructions** — `/gsettings set|remove claim` adds a custom note to the winner DM.

## [1.2.0]

### Added
- **Per-giveaway bonus entries** — `/gsettings set bonus` and `/gsettings remove bonus` now accept an optional **`giveaway_id`**. A per-giveaway bonus is stored separately and **added on top** of the server-wide bonus for the same role in the weighted draw.

## [1.1.0]

### Added
- **`/gsettings remove` command group** — dedicated commands to remove/clear a setting: `blacklist`, `whitelist`, `bonus`, `manager`, `notify`.
- **Per-giveaway blacklist & whitelist** — `blacklist` and `whitelist` (both `set` and `remove`) accept an optional **`giveaway_id`**, scoping a role to a single giveaway. Per-giveaway roles are unioned with the server-wide lists.

### Changed
- **`/gsettings set` is now add/set-only** (no longer a toggle). Removing a value is done via `/gsettings remove`. (`set log` remains a toggle.)

## [1.0.0]

### Added
- Initial release: button-entry giveaways via `/gcreate` modal, restart-safe poll scheduler, Fisher-Yates winner draw, `/greroll`, `/gpause` & `/gresume`, `/gtemplate`, `/glist`, `/ginfo`, `/ghelp`, `/ginvite`.
- Per-server settings via `/gsettings` (language, embed colour, button style/emoji, blacklist/whitelist, bonus entries, min account/membership age, manager/notify role, log channel).
- Multilingual UI (English, German, French, Spanish).
- Automatic data deletion when the bot is removed from a server, plus a daily orphan-guild cleanup.
