# Changelog

All notable changes to the **MSK Giveaway Bot**. Format based on [Keep a Changelog](https://keepachangelog.com).

## [1.7.0]

### Added
- **Templates can be managed in the web dashboard.** They existed only as `/gtemplate` before, which meant typing a title, a description and a duration into slash options. The dashboard now has a **Templates** tab that creates, edits and deletes them in a form, and the create form has a **Use template** selector above it that fills in every field. The fields stay editable afterwards: a template is a starting point, not a fixed form.

  New control endpoints `GET /templates`, `POST /template/save` and `POST /template/delete`, all going through the same `templateService` and the same validation as the slash command. The dashboard cannot save a template the command would reject, or the other way round.

### Changed
- **A template now carries the prize list and its distribution mode.** It could not since 1.5.0, and `/gtemplate use` created a giveaway with no prizes at all even though prizes were meant when the template was saved. New columns `prizes` and `prizeMode` on `GiveawayTemplate` (migration `20260816132014_template_prizes`), and `/gtemplate save` gained the optional `prizes` and `mode` options.

  In "one prize per winner" mode the number of winners follows the prize list here too, so `winners` became optional on `/gtemplate save` and is rejected when it contradicts the list. Coupon settings deliberately stay out of templates: Tebex packages are stored as IDs of one specific store and would quietly go stale in a template kept for months.
- Saving and deleting a template is written to the log channel, from the command and from the dashboard alike. Everything else in a giveaway's life was already logged.

## [1.6.1]

### Fixed
- **A fixed code from another shop no longer swallows the coupon from your own.** With both configured, only the entered code reached the winner: the bot skipped creating its own coupon for that winner entirely, so a prize that was set up simply never arrived and nothing said so.

  The two shops have nothing to do with each other, and a joint giveaway is exactly the case where there is something to win in both. Both codes are now issued and both appear in the same DM, each as its own block with its own note or store link. Configure only one of the two and nothing changes.

  Anyone who used a fixed code to suppress the generated coupon for a single prize slot should clear the discount percentage for that giveaway instead.

## [1.6.0]

### Added
- **The Tebex coupon can be limited to different packages per winner.** Until now one package selection applied to the whole giveaway, so a giveaway handing out "Script A" and "Script B" gave both winners the same coupon. With `prizeMode = INDIVIDUAL` the dashboard now shows a package picker **per prize**, and the winner of a prize gets their discount on that prize.

  New column `couponPackagesPerPrize` (JSON array of arrays, index-aligned with `prizes`). An empty slot falls back to the shared `couponPackages`, and if that is empty too the code discounts the whole cart, so "winner 1 only Script A, everyone else anything" needs no special case. A reroll of a single winner keeps this correct without extra work: the replacement inherits the prize slot and therefore its packages.

  The per-slot list is deliberately ignored when everyone gets all prizes. There is no "winner 2" in that mode — the draw order is arbitrary and shown nowhere — so a per-winner package would be a promise the bot cannot keep.

  Percentage and validity remain per giveaway. `issueCoupons` now takes `{ userId, prizeIndex }` objects instead of bare IDs and skips (loudly) anything else, so a call site that was missed cannot quietly issue a coupon for `undefined`.
- **Coupon codes can be entered by hand**, for a giveaway run together with another creator. The bot cannot generate a code for someone else's shop, so it now delivers one you type in: a code for all winners, or one per prize when each winner gets their own, plus a free-text note for the DM (usually where to redeem it).

  New columns `couponManualCode`, `couponManualCodesPerPrize` and `couponManualNote`. Entered codes need **no Tebex store of your own** — they work on a guild that never connected one — and they take precedence over a generated coupon for that winner, so nobody collects two discounts.

  What a foreign code cannot do is stated rather than papered over: the bot cannot validate it, and it cannot revoke it on a reroll, because the replaced winner already has it in their DM. That case now writes a warning to the log channel instead of passing silently.

## [1.5.0]

### Added
- **Several prizes per giveaway, with two ways of handing them out.** The prize field of `/gcreate` takes **one prize per line** (up to 20), and the new `mode` option decides who gets what:
  - *Everyone gets all prizes* (default, and what a single prize has always done) — every winner receives the full list.
  - *One prize per winner* — winner 1 gets prize 1, winner 2 gets prize 2, and so on.

  In the second mode the number of winners is no longer a separate setting, it **is** the length of the prize list: the modal drops the winners field, the dashboard locks it, and `/gedit` rejects a `winners` value that disagrees with the list. Anything else would leave a winner without a prize or a prize without a winner, and there is no sensible answer to which one it should be.

  Every winner row now carries the prize slot it was drawn for. That matters on a reroll: replacing a single winner with `/greroll <id> <winner>` gives the replacement **that winner's** prize instead of shifting everyone else's by one. Rerolling all winners assigns the slots again from scratch.

  The winner DM names only the prize that winner actually gets, the result message and the ended embed pair each winner with their prize, and the public results page lists them the same way. `/gedit` takes `prizes` (separated by `|`, because slash options cannot contain line breaks) and `mode`; the web dashboard has a multi-line prize field and a mode selector.

  Migration `20260815214352_multiple_prizes` replaces the single `Giveaway.prize` column with `prizes` (JSON array) and `prizeMode`, and adds `Winner.prizeIndex`. Existing prizes are copied into the new column **before** the old one is dropped, so running giveaways keep theirs. The result payload sent to the shop still contains a `prize` summary alongside the new `prizes`/`prizeMode`, so a shop that has not been updated yet keeps showing something.
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
