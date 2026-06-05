# 🎉 Discord Giveaway Bot

Multilingual, per-guild configurable giveaway bot built on **discord.js v14**, persisted via **MariaDB** (Prisma). Restart-safe poll scheduler, entry via button, winner draw with blacklist check, reroll.

## ➕ Add to your server

> [**Invite the bot →**](https://discord.com/oauth2/authorize?client_id=1512465732179329065&scope=bot+applications.commands&permissions=478208)

This is the easiest way to use the bot — just invite the official instance. (You can also get this link any time via the `/ginvite` command.)

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
npm run i18n:check          # locale completeness en/de/fr/es
```

## Commands

| Command | Permissions | Description |
|---|---|---|
| `/gcreate` | Manager | Modal → giveaway in the current channel |
| `/gcancel <id>` | Manager | Cancel an active giveaway |
| `/gend <id>` | Manager | End immediately + draw winners |
| `/greroll <id>` | Manager | New winners for an ended giveaway |
| `/glist` | everyone | List active giveaways |
| `/ginfo <id>` | everyone | Details about a giveaway |
| `/ghelp` | everyone | Command overview |
| `/ginvite` | everyone | Invite link |
| `/gsettings show` | ManageGuild | Show settings |
| `/gsettings set …` | ManageGuild | lang/color/emoji/button/blacklist/whitelist/bonus/minaccount/minmember/manager/notify/log |
| `/gpause` `/gresume` | Manager | Pause / resume a giveaway |
| `/gtemplate save\|list\|delete\|use` | Manager | Giveaway templates |

"Manager" = **Manage Server** OR the configured `manager` role.

## Permissions / Invite
`/ginvite` builds the invite URL from `PermissionFlagsBits` (not hardcoded):
ViewChannel, SendMessages, EmbedLinks, ReadMessageHistory, UseExternalEmojis, MentionEveryone (integer **478208**). `allowedMentions` restricts runtime pings specifically to the notify role.

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
