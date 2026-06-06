# Changelog

All notable changes to the **MSK Giveaway Bot**. Format based on [Keep a Changelog](https://keepachangelog.com).

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
