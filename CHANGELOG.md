# Changelog

All notable changes to the **MSK Giveaway Bot**. Format based on [Keep a Changelog](https://keepachangelog.com).

## [Unreleased]

### Added
- **Three more languages: Hungarian, Polish and Portuguese.** `hu.json`, `pl.json` and `pt.json` carry all 205 keys, so the bot now ships in seven languages. They can be picked with `/gsettings set lang` and in the dashboard like the existing four.

  Portuguese is written in the Brazilian variant, because that is the only Portuguese Discord itself offers and where most of the servers are.

  The command choices and the language list come from `SUPPORTED_LANGS` in `src/utils/i18n.js`, so adding the files and that one entry was enough on the bot side. `npm run i18n:check` reads the locale directory and picked the three up on its own.

### Changed
- **The control endpoint rejects an unknown language instead of storing it.** `POST /settings` wrote whatever came in into the `lang` column, and `t()` then quietly fell back to English. The dashboard would have shown the language as saved while Discord never showed it — the same silent-failure shape the role fields are already checked against. It now answers `400 invalid_lang`.
- **Prisma 5 → 6** (`prisma` and `@prisma/client` on 6.19.3). Nothing in the code had to change: the breaking changes of that major are about Node.js below 18.18, TypeScript, PostgreSQL, `Bytes` fields, `NotFoundError` and full-text search, and this project uses none of them.

  Prisma 7 is deliberately skipped for now. It replaces the generator, moves the generated client out of `node_modules`, makes a driver adapter mandatory and stops loading `.env` on its own — an amount of rebuilding that buys nothing here — and the MariaDB adapter still has an open bug where `DateTime` values are written as UTC ([prisma#29728](https://github.com/prisma/prisma/issues/29728)), which is exactly the kind of thing a scheduler comparing `endAt` to the current time would suffer from. With Prisma 8 already in release candidates, the adapter work is better done once.

## [1.9.0]

### Added
- **An existing giveaway can be saved as a template.** Repeating a giveaway meant typing its title, description, prizes and duration into a template by hand, next to the giveaway that already had all of it. Every giveaway in the dashboard now has a **Save as template** button, and the bot has `/gtemplate from giveaway_id:<ID> [name:<name>]`.

  Taken over: title, description, prizes, distribution mode, number of winners and the entry conditions. The duration is the span between creation and planned end, turned back into `1d2h30m`, because a giveaway stores a point in time and a template a duration. Channel and end date stay out, they are decided when the giveaway is created, and so do coupons, which hang on package IDs of one specific store. Running giveaways can be saved too, not only ended ones. An existing name is overwritten rather than refused, otherwise updating a template would mean deleting it first.

  New control endpoint `POST /template/from`, taking only a giveaway ID and a name — the bot builds the template from its own record, so the dashboard cannot leave a field out.
- **A template carries the entry conditions.** New columns `blacklistRoles`, `whitelistRoles` and `bonusRoles` on `GiveawayTemplate` (migration `20260817101500_eligibility_override`), all nullable with the same meaning of NULL as on the giveaway. In the template form they sit behind an **Own entry conditions** switch that is off by default: a template is kept for months, and freezing today's server settings into it would cut every giveaway made from it off from later changes to them.
- **`/gsettings remove conditions giveaway_id:<ID>`** drops a giveaway's own conditions so the server settings apply to it again. Clearing the lists by hand would not do it — an empty list is a condition of its own ("none applies here").

### Changed
- **Conditions set on a giveaway now replace the server-wide ones instead of adding to them.** Blacklist, whitelist and bonus entries used to be merged (lists unioned, bonus entries summed), which made one thing impossible: letting a single giveaway run *without* a server-wide rule. Each of the three now stands on its own — a giveaway can bring its own blacklist and still inherit the bonus entries.

  The distinction between "nothing of its own" and "deliberately none" is carried by the column being NULL, so the three columns on `Giveaway` became nullable. The migration turns the old empty defaults into NULL, and for giveaways that are still running it merges the server-wide values into their own once, so nothing changes underneath a giveaway that is already posted.

  In the dashboard the condition fields are prefilled with the server settings, in the create form and when editing. What the form shows is what will apply, so changing nothing changes nothing, and taking a role out of the list lifts it for this one giveaway. There is a **Back to the server settings** button next to the fields.

  `/gsettings … giveaway_id` keeps working the way it reads: changing one role on a giveaway that has no conditions of its own copies the server list first and then applies the change, instead of replacing the whole list with a single role.

### Fixed
- **`/gsettings … giveaway_id` refreshed the message with the state from before the change.** The giveaway record was read before saving and handed to the embed builder afterwards, so the role that was just added was missing from the message until something else touched it.

## [1.8.0]

### Added
- **Bonus entries are shown in the giveaway message.** A role could grant extra entries since 1.3, but nothing said so anywhere: the people who had the higher chance never learned about it, and the people who could get the role had no reason to. The active giveaway embed now carries a **Bonus entries** field listing every role with its extra entries and one line explaining what that means.

  It is a field of its own, not another line under "Requirements". A bonus forbids nothing, it only raises the chance, and under that heading it would read like a hurdle instead of an advantage. Server-wide and per-giveaway bonus entries are added up first, so the field shows what actually counts in the draw. No bonus roles configured, no field.
- **Bonus entries can be set in the web dashboard**, per role with its own number, in the settings tab. They were reachable only through `/gsettings bonus` before.
- **Blacklist, whitelist and bonus entries can be set per giveaway in the dashboard**, in the create form and when editing a running giveaway. All three existed per giveaway in the database and in `/gsettings … giveaway_id`, but the dashboard could neither show nor change them.

  They come on top of the server-wide settings rather than replacing them: role lists are merged, bonus entries added up per role. The create endpoint writes them **before** the message goes out, so the first version of the embed already names the conditions instead of showing them only after the next edit.

### Changed
- **Changing a server-wide setting now updates the running giveaways.** Blacklist, whitelist, bonus entries, minimum ages, embed color and button style all appear in the message of every active giveaway, and until now that message kept the state from when it was posted. Both the dashboard and `/gsettings` refresh the affected messages afterwards, and settings that appear in no embed (log channel, manager role, reminder, claim text) still touch nothing.
- **Role input from the dashboard is validated instead of being written through.** A malformed role ID used to land in the JSON column as it came in, where it simply never matched: the condition looked saved and did nothing. Role lists, bonus roles and bonus amounts (whole numbers from 1 to 100, the same range `/gsettings` allows) are now checked, and a bad value is answered with an error rather than stored.

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
