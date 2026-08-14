# Graph Report - discord_giveaway  (2026-08-14)

## Corpus Check
- 63 files · ~65,088 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 320 nodes · 856 edges · 23 communities (22 shown, 1 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 18 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `991c4ed4`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- logger.js
- participate.js
- package.json
- t
- embeds.js
- scheduler.js
- giveawayService.js
- gtemplate.js
- Contributing Guide
- Deploy Job (SSH to Debian server)
- Discord Giveaway Bot
- CI verify Job
- Security Policy
- Release 1.4.0 (dashboard, control endpoint, results pages)
- Supply-Chain Controls (Dependabot, CodeQL, CI gate)
- i18n-check.js
- Secrets Confined to .env and Actions Secrets
- 20260605100105_init/migration.sql
- 20260605103450_backlog_features/migration.sql
- gsettings.js

## God Nodes (most connected - your core abstractions)
1. `t()` - 60 edges
2. `getSettings()` - 50 edges
3. `getGiveaway()` - 26 edges
4. `sendGuildLog()` - 19 edges
5. `isManager()` - 19 edges
6. `logger` - 18 edges
7. `handle()` - 15 edges
8. `execute()` - 13 edges
9. `endGiveaway()` - 13 edges
10. `postGiveaway()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `GitHub Sponsors Funding (MSK-Scripts)` --conceptually_related_to--> `Discord Giveaway Bot`  [AMBIGUOUS]
  .github/FUNDING.yml → README.md
- `Secrets Confined to .env and Actions Secrets` --semantically_similar_to--> `Secret Redaction Requirement in Reports`  [INFERRED] [semantically similar]
  SECURITY.md → .github/ISSUE_TEMPLATE/bug_report.yml
- `Static Verification Commands (no DB/token)` --conceptually_related_to--> `CI verify Job`  [INFERRED]
  README.md → .github/workflows/ci.yml
- `Local MariaDB Docker Test Setup (port 3308)` --semantically_similar_to--> `Dummy DATABASE_URL for Prisma Validate`  [INFERRED] [semantically similar]
  CONTRIBUTING.md → .github/workflows/ci.yml
- `Public Results Page (data-minimised)` --semantically_similar_to--> `Complete Event Logging to Log Channel`  [INFERRED] [semantically similar]
  README.md → CHANGELOG.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **CI-Gated Deploy and Release Pipeline** — _github_workflows_ci_verify_job, _github_workflows_ci_reusable_verify_gate, _github_workflows_deploy_deploy_job, _github_workflows_release_release_job, _github_pull_request_template_pr_verification_checklist [EXTRACTED 1.00]
- **Defense-in-Depth Security Model** — security_least_privilege_intents, security_server_side_authorization, security_prisma_parameterized_queries, security_systemd_sandbox_hardening, security_secrets_in_env_only, security_supply_chain_controls [EXTRACTED 1.00]
- **msk-shop Web Dashboard Integration Flow** — readme_web_dashboard, readme_localhost_control_endpoint, readme_public_results_page, changelog_shared_service_layer_extraction, changelog_scope_bound_oauth_session [EXTRACTED 1.00]

## Communities (23 total, 1 thin omitted)

### Community 0 - "logger.js"
Cohesion: 0.11
Nodes (27): __dirname, main(), __dirname, fail(), main(), ok(), SRC, client (+19 more)

### Community 1 - "participate.js"
Cohesion: 0.44
Nodes (7): execute(), addOrRemoveEntry(), scheduleEmbedRefresh(), checkEligibility(), mergeGiveawayEligibility(), parseRoleArray(), parseRoleObject()

### Community 2 - "package.json"
Cohesion: 0.06
Nodes (32): discord.js, dotenv, nanoid, author, dependencies, discord.js, dotenv, nanoid (+24 more)

### Community 3 - "t"
Cohesion: 0.16
Nodes (28): execute(), execute(), execute(), execute(), execute(), execute(), execute(), execute() (+20 more)

### Community 4 - "embeds.js"
Cohesion: 0.14
Nodes (22): execute(), execute(), execute(), PERMISSIONS, execute(), execute(), countEntries(), getGuildStats() (+14 more)

### Community 5 - "scheduler.js"
Cohesion: 0.17
Nodes (14): prisma, execute(), execute(), deleteGuildData(), purgeOrphanedGuilds(), startMaintenance(), storedGuildIds(), deleteGuildResults() (+6 more)

### Community 6 - "giveawayService.js"
Cohesion: 0.13
Nodes (37): editGiveawayEndpoint(), extendGiveawayEndpoint(), getGiveawayDetail(), handle(), lifecycleEndpoint(), listChannels(), listGiveaways(), listRoles() (+29 more)

### Community 7 - "gtemplate.js"
Cohesion: 0.24
Nodes (13): execute(), REQUIRED_PERMS, execute(), REQUIRED_PERMS, createGiveawayEndpoint(), createGiveaway(), postGiveaway(), deleteTemplate() (+5 more)

### Community 8 - "Contributing Guide"
Cohesion: 0.20
Nodes (10): Feature Request Issue Form, Dummy DATABASE_URL for Prisma Validate, i18n Completeness Check Step, Contributor Covenant Code of Conduct v2.1, Community Impact Enforcement Ladder, Contributing Guide, i18n Key Parity Rule (en.json is source of truth), Local MariaDB Docker Test Setup (port 3308) (+2 more)

### Community 9 - "Deploy Job (SSH to Debian server)"
Cohesion: 0.20
Nodes (10): Deploy Job (SSH to Debian server), Docs-Only Changes Skip Production Redeploy, Automatic Global Slash Command Registration, Self-Healing Git Reset Deploy Strategy, systemd Service discord-giveaway Restart, GitHub as Single Source of Truth for Mirror, Mirror to Codeberg Job, origin/HEAD Symbolic Ref Deletion Before Push (+2 more)

### Community 10 - "Discord Giveaway Bot"
Cohesion: 0.25
Nodes (9): GitHub Sponsors Funding (MSK-Scripts), GNU Affero General Public License v3, Network Use Source Disclosure (AGPL Section 13), Slash Command Reference, Discord Giveaway Bot, Manager Gating (Manage Server or manager role), Self-Hosting Not Supported, Static Verification Commands (no DB/token) (+1 more)

### Community 11 - "CI verify Job"
Cohesion: 0.25
Nodes (9): PR Verification Checklist (i18n, smoke, prisma validate), Pull Request Template, Reusable Static Verification Gate (workflow_call), Smoke Test Step (exports + SlashCommand builder), CI verify Job, Pre-Release Detection via Tag Suffix, GitHub Release Job, MSK Giveaway Bot Changelog (+1 more)

### Community 12 - "Security Policy"
Cohesion: 0.29
Nodes (8): Issue Routing Config (blank issues disabled), Private Security Advisory Channel, Invite Permissions from PermissionFlagsBits (478208), Least-Privilege Discord Intents (Guilds only), Prisma Parameterized Queries (no SQL injection), Security Policy, Self-Hoster Hardening Checklist, Coordinated Vulnerability Disclosure Process

### Community 13 - "Release 1.4.0 (dashboard, control endpoint, results pages)"
Cohesion: 0.48
Nodes (7): Complete Event Logging to Log Channel, Release 1.4.0 (dashboard, control endpoint, results pages), Scope-Bound Dashboard OAuth Session, Shared Service Layer for Cancel/Reroll, Localhost-Only Control Endpoint (controlServer.js), Public Results Page (data-minimised), Web Dashboard (msk-scripts.de/giveaway/dashboard)

### Community 14 - "Supply-Chain Controls (Dependabot, CodeQL, CI gate)"
Cohesion: 0.40
Nodes (6): Dependabot Update Config, Grouped Minor/Patch Update Strategy, Manual Major-Version Migration Policy (discord.js, prisma), CodeQL Analyze Job (javascript-typescript), Pinned undici Override (npm overrides), Supply-Chain Controls (Dependabot, CodeQL, CI gate)

### Community 15 - "i18n-check.js"
Cohesion: 0.29
Nodes (4): DIR, __dirname, en, enKeys

### Community 16 - "Secrets Confined to .env and Actions Secrets"
Cohesion: 0.50
Nodes (4): Bug Report Issue Form, Secret Redaction Requirement in Reports, Production .env Never Stored in Git, Secrets Confined to .env and Actions Secrets

### Community 17 - "20260605100105_init/migration.sql"
Cohesion: 0.60
Nodes (4): `Entry`, `Giveaway`, `GuildSettings`, `Winner`

### Community 22 - "gsettings.js"
Cohesion: 0.30
Nodes (10): BUTTON_CHOICES, execute(), parseArr(), parseObj(), setGiveawayBlacklistRoles(), setGiveawayBonusRoles(), setGiveawayWhitelistRoles(), updateSettings() (+2 more)

## Ambiguous Edges - Review These
- `GitHub Sponsors Funding (MSK-Scripts)` → `Discord Giveaway Bot`  [AMBIGUOUS]
  .github/FUNDING.yml · relation: conceptually_related_to

## Knowledge Gaps
- **61 isolated node(s):** `__dirname`, `name`, `version`, `description`, `type` (+56 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `GitHub Sponsors Funding (MSK-Scripts)` and `Discord Giveaway Bot`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `t()` connect `t` to `logger.js`, `participate.js`, `embeds.js`, `scheduler.js`, `giveawayService.js`, `gtemplate.js`, `gsettings.js`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Why does `getSettings()` connect `t` to `logger.js`, `participate.js`, `embeds.js`, `scheduler.js`, `giveawayService.js`, `gtemplate.js`, `gsettings.js`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Why does `logger` connect `logger.js` to `t`, `scheduler.js`, `giveawayService.js`, `gtemplate.js`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **What connects `__dirname`, `name`, `version` to the rest of the system?**
  _61 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `logger.js` be split into smaller, more focused modules?**
  _Cohesion score 0.11261261261261261 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.06060606060606061 - nodes in this community are weakly interconnected._