# Changelog

All notable changes to the **MSK Giveaway Bot**. Format based on [Keep a Changelog](https://keepachangelog.com).

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
