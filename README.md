![Discord Giveawaybot](.assets/msk-giveaway-bot-banner.png)

Multilingual, per-guild configurable giveaway bot built on **discord.js v14**, persisted via **MariaDB** (Prisma). Restart-safe poll scheduler, button entry, eligibility rules, weighted bonus entries, templates, pause/resume, edit & extend, "ending soon" reminders, winner DMs, reroll and automatic Tebex coupons for winners.

## ➕ Add to your server

> [**Invite the bot →**](https://discord.com/oauth2/authorize?client_id=1512465732179329065&scope=bot+applications.commands&permissions=478208)

This is the easiest way to use the bot — just invite the official instance. (You can also get this link any time via the `/ginvite` command.)

## 📚 Documentation

Full guide — getting started, the complete command reference and per-server configuration:
**[docu.msk-scripts.de → Giveaway Bot](https://docu.msk-scripts.de/discord/discord_giveaway/getting-started)**

## Requirements
- Node.js **22.x**
- MariaDB (locally via Docker or a server)
- A Discord application with a bot token

## Setup

```bash
npm install
cp .env.example .env
```

`.env`:
```bash
DISCORD_TOKEN=
CLIENT_ID=

# optional, for fast dev deploy
GUILD_ID=

DATABASE_URL="mysql://user:pass@localhost:3306/giveaway_bot"

# optional, encrypts the per-guild Tebex store secrets (openssl rand -hex 32).
# Without it the winner-coupon feature stays off; nothing else is affected.
TEBEX_SECRET_KEY=
```

### MariaDB via Docker (local/test)
```bash
docker run -d --name giveaway-mariadb \
  -e MARIADB_ROOT_PASSWORD=root \
  -e MARIADB_DATABASE=giveaway_bot \
  -p 3306:3306 mariadb:11
```

### Migrate the database
```bash
npm run prisma:generate
npm run prisma:migrate      # creates the tables (DB must be running)
```

### Register slash commands
```bash
npm run deploy              # guild commands if GUILD_ID is set, otherwise global
```

### Start the bot
```bash
npm start                   # or npm run dev (node --watch)
```

## Static verification (no DB/token)
```bash
npx prisma validate
npm run prisma:generate
npm run smoke               # load smoke test (exports + builder constraints)
npm run i18n:check          # locale completeness + placeholder parity en/de/fr/es
```

## Tests
```bash
npm test                    # unit tests + concurrency tests
```

The concurrency tests run against a real database, because what they check is
that MariaDB serialises a conditional `UPDATE` and rejects a duplicate `INSERT`:
that several callers ending the same giveaway hand out the prize only once, that
overlapping scheduler ticks post one result and one reminder, and that a guild
without a settings row or a user double-clicking the join button never produces
an error.

They need their own database in `TEST_DATABASE_URL` and refuse to share one with
`DATABASE_URL` — a scheduler tick ends every giveaway that is due in the database
it is pointed at. Without the variable those tests skip and only the unit tests
run.

```bash
# once: a second database next to the bot's own
TEST_DATABASE_URL="mysql://root:root@localhost:3306/giveaway_bot_test"
npm run test:db             # applies the migrations to it
```

## Commands

| Command | Permissions | Description |
|---|---|---|
| `/gcreate [mode]` | Manager | Modal → giveaway in the current channel. `mode` picks how the prizes are handed out (see below) |
| `/gedit <id>` | Manager | Edit a running giveaway (title, description, winners, prizes, mode) |
| `/gextend <id> <duration>` | Manager | Extend a running giveaway's end time |
| `/gcancel <id>` | Manager | Cancel an active giveaway |
| `/gend <id>` | Manager | End immediately + draw winners |
| `/greroll <id> [winner]` | Manager | New winners for an ended giveaway — or replace a single `winner` |
| `/glist` | everyone | List active giveaways |
| `/ginfo <id>` | everyone | Details about a giveaway |
| `/gstats` | everyone | This server's giveaway statistics |
| `/ghelp` | everyone | Command overview |
| `/ginvite` | everyone | Invite link |
| `/gsettings show` | ManageGuild | Show settings |
| `/gsettings set …` | ManageGuild | Set/add a setting: lang, color, emoji, button, blacklist, whitelist, bonus, minaccount, minmember, manager, notify, log, reminder, claim |
| `/gsettings remove …` | ManageGuild | Remove/clear a setting: blacklist, whitelist, bonus, manager, notify, claim |
| `/gpause` `/gresume` | Manager | Pause / resume a giveaway |
| `/gtemplate save\|list\|delete\|use` | Manager | Giveaway templates |

"Manager" = **Manage Server** OR the configured `manager` role.

`set`/`remove blacklist`, `whitelist` and `bonus` accept an optional `giveaway_id` to scope a role to a single giveaway (in addition to the server-wide values). See the **[documentation](https://docu.msk-scripts.de/discord/discord_giveaway/configuration)** for the full command and configuration reference.

## Prizes

A giveaway can carry up to 20 prizes — one per line in the modal's prize field, or separated by `|` in `/gedit prizes:…`. The `mode` option decides how they are handed out:

| `mode` | Behaviour |
|---|---|
| `ALL` (default) | Every winner receives all prizes |
| `INDIVIDUAL` | Winner 1 gets prize 1, winner 2 gets prize 2, … |

`INDIVIDUAL` couples the number of winners to the length of the list: the modal drops the winners field, the dashboard locks it, and `/gedit` refuses a `winners` value that contradicts the prizes. Every winner row stores its `prizeIndex`, so replacing a single winner via `/greroll <id> <winner>` hands the replacement **that** prize instead of shifting everyone else's.

## Permissions / Invite
`/ginvite` builds the invite URL from `PermissionFlagsBits` (not hardcoded):
ViewChannel, SendMessages, EmbedLinks, ReadMessageHistory, UseExternalEmojis, MentionEveryone (integer **478208**). `allowedMentions` restricts runtime pings specifically to the notify role.

## Web dashboard & public results (msk-scripts.de)
The official instance integrates with **msk-scripts.de**:
- **Web dashboard** — `…/giveaway/dashboard` lets server admins (Discord login, Manage Server) create and fully manage giveaways and per-server settings from the browser. The shop proxies every action to a **localhost-only** HTTP control endpoint in the bot (`services/controlServer.js`, header `X-Control-Secret` = `CONTROL_SECRET`), so all Discord side-effects and the settings cache stay consistent. No public port is opened.
- **Public results page** — when a giveaway ends, the bot pushes the winners (username) and the anonymous participant count to the shop (`RESULT_PUBLISH_URL`, `Authorization: Bearer ${RESULT_PUBLISH_SECRET}`), which hosts a results page at `…/giveaway/g/<token>` and links it in the results message + winner DMs. The full participant list is never published.

- **Tebex winner coupons** — see below.

Both features are **optional** and disabled until their env vars are set (`CONTROL_SECRET`, `RESULT_PUBLISH_URL` + `RESULT_PUBLISH_SECRET`). See `.env.example`.

## Tebex winner coupons

A giveaway can hand every winner a personal discount code for the **guild's own Tebex store** — the bot is not tied to a single shop. Configured in the web dashboard only: a percentage, optionally limited to selected packages, optionally with an expiry. Each winner receives their **own** single-use code by DM, and a reroll revokes the replaced winner's code in the store before issuing a new one. The code appears only in the DM, never in the public results message or on the results page.

**A different package per winner.** With `prizeMode = INDIVIDUAL` the packages can be picked per prize slot (`couponPackagesPerPrize`, a JSON array of arrays index-aligned with `prizes`): the winner of "Script A" gets their discount on Script A, the winner of "Script B" on Script B. An empty slot falls back to the shared `couponPackages`, and if that is empty too the code discounts the whole cart. Without prize slots there is no "winner N" to point at — the draw order is arbitrary and surfaced nowhere — so the per-slot list is ignored in `ALL` mode. Percentage and validity always apply to the whole giveaway.

**Codes from another shop.** For a giveaway run together with another creator, codes can be entered by hand (`couponManualCode`, `couponManualCodesPerPrize`, `couponManualNote`): one for everybody, or one per prize slot. They need **no Tebex store of your own**, and they take precedence over a generated coupon for that winner. The bot only delivers them, so it can neither validate them nor revoke them on a reroll — the latter is logged to the guild's log channel rather than passed over silently.

**Where the store credentials live.** Each guild's Tebex plugin secret is stored in `GuildSettings.tebexSecret`, encrypted with **AES-256-GCM** (`utils/secretBox.js`). The key comes from `TEBEX_SECRET_KEY` and therefore lives outside the database, so a stolen dump or backup yields nothing on its own. Anyone with access to the bot host can still decrypt — that cannot be designed away for a service that has to use the key. Hashing is not an alternative here: the value is sent to Tebex on every coupon (`X-Tebex-Secret`), and a hash cannot be reversed.

**Who may touch it.** A Tebex plugin secret is unscoped full access to a store, so storing, revealing and deleting it is restricted to the **guild owner** — stricter than the rest of the dashboard, which allows any administrator. The bot verifies ownership against Discord's own `guild.ownerId` and does not trust a flag sent by the shop. Configuring the discount itself (percentage, packages, validity) stays open to any manager. `GET /settings` never returns the encrypted value, only whether one is set, its last four characters and when it was set.

**Rotating `TEBEX_SECRET_KEY`** makes every stored store secret unreadable; owners have to enter theirs again. The bot logs this clearly instead of blaming Tebex.

Package lists for the dashboard picker come from the **Headless** API using the guild's public token (`tebexPublicToken`), because the Plugin API's `GET /packages` is deprecated.

Disabled until `TEBEX_SECRET_KEY` is set; nothing breaks without it.

## Deployment (server)
Short version:
- On the server use **`npm ci`** (full install — the `prisma` CLI is a devDependency and is needed for generate/migrate), then `npx prisma generate` + `npx prisma migrate deploy`.
- Run via **systemd** (`deploy/discord-giveaway.service`), auto-restart, journald logs.
- Register commands globally: `npm run deploy:global` (registers global + removes guild commands).
- Only the `Guilds` gateway intent is needed — no privileged intents, no inbound port.

## Self-Hosting

Running your own copy of this bot is **neither supported nor encouraged**. The code is published for transparency — so users can see exactly how the bot behaves and fellow bot developers can learn from the implementation — not as a ready-made product to redeploy.

In practice this means:
- There is **no support** for installing, modifying, building, or otherwise getting your own instance to run. Questions of that kind will not be answered.
- The setup and deployment notes in this repository exist for operating the official instance; use them at your own risk.
- Any modifications must be documented as required by the project [license](LICENSE.md).
