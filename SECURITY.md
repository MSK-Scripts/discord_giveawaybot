# Security Policy

## Supported Versions

Only the latest release on the `main` branch receives security fixes.

| Version | Supported |
|---|---|
| 1.x (latest `main`) | ✅ |
| older / forks | ❌ |

## Reporting a Vulnerability

**Please do not open a public issue for security problems.**

Report privately via one of:

1. **GitHub Private Vulnerability Reporting** (preferred) — repo → **Security** tab → **Report a vulnerability**.
2. **Email** — `info@msk-scripts.de` with subject `SECURITY: discord_giveaway`.

Please include: affected version/commit, a description, reproduction steps, and the potential impact.

**Response targets:**
- Acknowledgement within **72 hours**.
- Initial assessment (accepted / needs info / declined) within **7 days**.
- For accepted issues: a fix or mitigation plan, then coordinated disclosure once a patch is available.

Please allow a reasonable time to fix before any public disclosure. Acting in good faith, we will not pursue action against researchers who follow this policy.

## Scope

In scope: the bot source in this repository (`src/`, `deploy-commands.js`, `prisma/`), the deployment configuration (`deploy/`, `.github/workflows/`), and dependency/supply-chain issues.

Out of scope: vulnerabilities in Discord itself, in third-party hosting, or issues requiring a compromised host/server with existing privileged access.

## Security Model & Hardening

This bot is built with the following measures — keep them intact when contributing:

### Secrets
- All secrets live in **`.env`** (bot token, `CLIENT_ID`, `DATABASE_URL`). `.env*` is gitignored (except `.env.example`); the token is **never** committed.
- If a token is ever exposed, **reset it immediately** in the Discord Developer Portal — a leaked bot token grants full control of the bot.
- CI/CD credentials are stored as **GitHub Actions secrets**, never in the repo.

### Least privilege (Discord)
- Only the **`Guilds`** gateway intent is requested — **no** privileged intents (no Message Content, no Server Members). Members are fetched on demand via REST.
- Invite permissions are composed from `PermissionFlagsBits` (integer `478208`) — no `Administrator`, no `Manage Roles`, no `Manage Messages`. The bot only edits its **own** messages.
- `allowedMentions` restricts every post to exactly the intended targets (notify role / winners) — never `@everyone`/`@here`.

### Authorization & input validation
- Manager actions are gated **server-side** via `isManager` (Manage Server **or** the configured manager role); `/gsettings` requires Manage Server. Discord's command visibility is treated as UX only, not as a security boundary.
- All user input is validated server-side: duration parsing, winner count (1–100), hex color, emoji format, and eligibility (blacklist/whitelist/account age/membership age) — re-checked at draw time.
- Database access uses **Prisma** with parameterized queries (no string-concatenated SQL → no SQL injection). Channel/role/user IDs are treated as opaque snowflakes.

### Runtime / deployment
- The systemd unit (`deploy/discord-giveaway.service`) runs as a dedicated unprivileged user with `NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=full`, and `ProtectHome`.
- The bot makes **outbound** connections only (Discord + local DB) — no inbound port is exposed.
- The deploy user's `sudo` rights are limited to restarting the single service (see `DEPLOYMENT.md`).

### Supply chain
- **Dependabot** keeps npm and GitHub Actions dependencies updated (weekly).
- **CodeQL** static analysis runs on pushes/PRs to `main`.
- The CI `verify` job (`prisma validate`, `i18n:check`, `smoke`, `node --check`) gates every deploy.

## Hardening checklist for self-hosters

- [ ] Use a dedicated MariaDB user with privileges scoped to the bot's database only.
- [ ] Restrict the bot's role with channel-level permission overrides where appropriate.
- [ ] Keep `.env` readable only by the service user (`chmod 600 .env`).
- [ ] Enable GitHub Private Vulnerability Reporting on your fork.
- [ ] Rotate the bot token and database password periodically.
