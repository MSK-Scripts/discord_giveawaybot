# Contributing

Thanks for your interest in improving the Discord Giveaway Bot. This document
explains how to set up the project, the conventions the codebase follows, and
how to get a change merged.

By participating you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting bugs and requesting features

- **Bugs:** open a [Bug report](https://github.com/MSK-Scripts/discord_giveawaybot/issues/new?template=bug_report.yml).
- **Ideas:** open a [Feature request](https://github.com/MSK-Scripts/discord_giveawaybot/issues/new?template=feature_request.yml).
- **Questions and support:** use [Discussions](https://github.com/MSK-Scripts/discord_giveawaybot/discussions).
- **Security issues:** do not open a public issue. Follow [SECURITY.md](SECURITY.md).

Please search existing issues first to avoid duplicates, and never include your
bot token, database credentials, or other secrets in logs or screenshots.

## Development setup

Requirements:

- Node.js **22.x** (LTS)
- MariaDB (locally via Docker or a server)
- A Discord application with a bot token

```bash
npm install
cp .env.example .env      # then fill in DISCORD_TOKEN, CLIENT_ID, DATABASE_URL
npm run prisma:generate
npm run prisma:migrate    # requires a reachable database
npm run deploy            # register slash commands (uses GUILD_ID for fast dev deploy)
npm run dev               # start with --watch
```

A local MariaDB for testing can be started via Docker:

```bash
docker run -d --name giveaway-mariadb \
  -e MARIADB_ROOT_PASSWORD=root -e MARIADB_DATABASE=giveaway_bot \
  -p 3308:3306 mariadb:11
```

Then set `DATABASE_URL="mysql://root:root@localhost:3308/giveaway_bot"` in `.env`.

## Project conventions

The bot is JavaScript (ESM, `"type": "module"`) on discord.js v14 with Prisma.
Please match the existing style:

- **Commands:** `export default { data: SlashCommandBuilder, async execute(client, interaction) }`
- **Events:** `export default { name, once?, async execute(client, ...args) }`
- **Components:** `export default { customId | prefix, async execute(client, interaction) }`
- **Ephemeral replies:** always use `flags: MessageFlags.Ephemeral`, never the
  deprecated `ephemeral: true`.
- **i18n:** every user-facing string goes through `t(guildId, key, vars)` and
  must exist in **all** locale files (`src/locales/en.json`, `de.json`,
  `fr.json`, `es.json`). `en.json` is the default and the source of truth for
  keys.
- **Style:** single quotes, semicolons, `async`/`await`.
- **Security:** validate all user input server-side, keep least-privilege intents
  and permissions intact, and never log secrets. See [SECURITY.md](SECURITY.md)
  for the full model.

## Before you open a pull request

Run the same checks CI runs, so the build stays green:

```bash
npm run i18n:check      # locale key parity across en/de/fr/es
npm run smoke           # smoke test
node --check src/index.js
npx prisma validate
```

If your change touches behavior, commands, config, or env variables, update the
relevant docs in the same change: `README.md`, `CHANGELOG.md`, and the
documentation at
[docu.msk-scripts.de](https://docu.msk-scripts.de/discord/discord_giveaway/getting-started).

## Commit and pull request guidelines

- Keep pull requests focused. One logical change per PR is easier to review.
- Write clear commit messages in **English**. Do not attach any AI attribution
  or `Co-Authored-By` trailers.
- Reference related issues (for example `Fixes #123`) in the PR description.
- Fill out the pull request template and confirm the checklist.

## License

This project is not open source. By contributing you agree that your
contributions are made under the terms of the repository [LICENSE](LICENSE.md),
and that you have the right to submit them.
