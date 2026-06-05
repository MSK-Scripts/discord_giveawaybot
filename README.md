# 🎉 Discord Giveaway Bot

Mehrsprachiger, pro Guild konfigurierbarer Giveaway-Bot auf Basis von **discord.js v14**, persistent über **MariaDB** (Prisma). Restart-sicherer Poll-Scheduler, Teilnahme über Button, Gewinnerziehung mit Blacklist-Prüfung, Reroll.

Vollständiges Konzept: [Konzept.md](Konzept.md) · Entwickler-Kontext: [CLAUDE.md](CLAUDE.md)

## Voraussetzungen
- Node.js **22.x**
- MariaDB (lokal via Docker oder Server)
- Eine Discord-Application mit Bot-Token

## Setup

```bash
npm install
cp .env.example .env   # Werte eintragen (Windows: copy)
```

`.env`:
```
DISCORD_TOKEN=...
CLIENT_ID=...
DATABASE_URL="mysql://user:pass@localhost:3306/giveaway_bot"
GUILD_ID=            # optional, für schnelles Dev-Deploy
```

### MariaDB via Docker (lokal/Test)
```bash
docker run -d --name giveaway-mariadb \
  -e MARIADB_ROOT_PASSWORD=root \
  -e MARIADB_DATABASE=giveaway_bot \
  -p 3306:3306 mariadb:11
```

### Datenbank migrieren
```bash
npm run prisma:generate
npm run prisma:migrate      # legt die Tabellen an (DB muss laufen)
```

### Slash-Commands registrieren
```bash
npm run deploy              # Guild-Commands wenn GUILD_ID gesetzt, sonst global
```

### Bot starten
```bash
npm start                   # bzw. npm run dev (node --watch)
```

## Statische Verifikation (ohne DB/Token)
```bash
npx prisma validate
npm run prisma:generate
npm run smoke               # Lade-Smoke-Test (Exporte + Builder-Constraints)
npm run i18n:check          # Locale-Vollständigkeit en/de/fr/es
```

## Commands

| Command | Rechte | Beschreibung |
|---|---|---|
| `/gcreate` | Manager | Modal → Giveaway im aktuellen Channel |
| `/gcancel <id>` | Manager | Aktives Giveaway abbrechen |
| `/gend <id>` | Manager | Sofort beenden + Gewinner ziehen |
| `/greroll <id>` | Manager | Neue Gewinner für beendetes Giveaway |
| `/glist` | alle | Aktive Giveaways auflisten |
| `/ginfo <id>` | alle | Details zu einem Giveaway |
| `/ghelp` | alle | Command-Übersicht |
| `/ginvite` | alle | Invite-Link |
| `/gsettings show` | ManageGuild | Einstellungen anzeigen |
| `/gsettings set …` | ManageGuild | lang/color/emoji/button/blacklist/whitelist/bonus/minaccount/minmember/manager/notify/log |
| `/gpause` `/gresume` | Manager | Giveaway pausieren / fortsetzen |
| `/gtemplate save\|list\|delete\|use` | Manager | Giveaway-Vorlagen |

„Manager" = **Manage Server** ODER die konfigurierte `manager`-Rolle.

## Permissions / Invite
`/ginvite` baut die Invite-URL aus `PermissionFlagsBits` (nicht hartkodiert):
ViewChannel, SendMessages, EmbedLinks, ReadMessageHistory, UseExternalEmojis, MentionEveryone (Integer **478208**). `allowedMentions` begrenzt Pings zur Laufzeit gezielt auf die Notify-Rolle.

## Deployment (Server)
Vollständiges Runbook: **[DEPLOYMENT.md](DEPLOYMENT.md)** (systemd-Unit + GitHub Actions CI/CD).

Kurzfassung:
- Auf dem Server **`npm ci`** (volle Installation — das `prisma`-CLI ist devDependency und wird für generate/migrate gebraucht), dann `npx prisma generate` + `npx prisma migrate deploy`.
- Dienst via **systemd** (`deploy/discord-giveaway.service`), Auto-Restart, journald-Logs.
- Commands global registrieren: `npm run deploy:global` (registriert global + entfernt Guild-Commands).
- Nur der `Guilds`-Gateway-Intent ist nötig — keine privilegierten Intents, kein eingehender Port.
