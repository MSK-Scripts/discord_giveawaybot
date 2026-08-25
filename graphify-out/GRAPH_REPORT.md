# Graph Report - discord_giveaway  (2026-08-25)

## Corpus Check
- 96 files · ~101,187 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 496 nodes · 1512 edges · 31 communities (29 shown, 2 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6bd8a04f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- i18n.js
- settingsService.js
- Project Dependencies
- Participation and Eligibility
- embeds.js
- controlServer.js
- giveawayService.js
- tebexService.js
- Project Guidelines and Standards
- Deployment and CI Workflows
- Project Documentation and Licensing
- Release and PR Verification
- Security and Issue Configuration
- Dashboard and Web Services
- Dependency and Security Audits
- Internationalization Utilities
- Bug Reporting and Secrets
- Database Schema Migrations
- Giveaway Template Migration
- Database Test Setup
- Changelog Management
- scheduler.js

## God Nodes (most connected - your core abstractions)
1. `t()` - 69 edges
2. `getSettings()` - 53 edges
3. `normalizePrizeMode()` - 30 edges
4. `getGiveaway()` - 29 edges
5. `handle()` - 28 edges
6. `sendGuildLog()` - 25 edges
7. `logger` - 20 edges
8. `execute()` - 19 edges
9. `rerollSingle()` - 19 edges
10. `isManager()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `GitHub Sponsors Funding (MSK-Scripts)` --conceptually_related_to--> `Discord Giveaway Bot`  [AMBIGUOUS]
  .github/FUNDING.yml → README.md
- `Static Verification Commands (no DB/token)` --conceptually_related_to--> `CI verify Job`  [INFERRED]
  README.md → .github/workflows/ci.yml
- `Public Results Page (data-minimised)` --semantically_similar_to--> `Complete Event Logging to Log Channel`  [INFERRED] [semantically similar]
  README.md → CHANGELOG.md
- `Secrets Confined to .env and Actions Secrets` --semantically_similar_to--> `Secret Redaction Requirement in Reports`  [INFERRED] [semantically similar]
  SECURITY.md → .github/ISSUE_TEMPLATE/bug_report.yml
- `Local MariaDB Docker Test Setup (port 3308)` --semantically_similar_to--> `Dummy DATABASE_URL for Prisma Validate`  [INFERRED] [semantically similar]
  CONTRIBUTING.md → .github/workflows/ci.yml

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **CI-Gated Deploy and Release Pipeline** — _github_workflows_ci_verify_job, _github_workflows_ci_reusable_verify_gate, _github_workflows_deploy_deploy_job, _github_workflows_release_release_job, _github_pull_request_template_pr_verification_checklist [EXTRACTED 1.00]
- **Defense-in-Depth Security Model** — security_least_privilege_intents, security_server_side_authorization, security_prisma_parameterized_queries, security_systemd_sandbox_hardening, security_secrets_in_env_only, security_supply_chain_controls [EXTRACTED 1.00]
- **msk-shop Web Dashboard Integration Flow** — readme_web_dashboard, readme_localhost_control_endpoint, readme_public_results_page, changelog_shared_service_layer_extraction, changelog_scope_bound_oauth_session [EXTRACTED 1.00]

## Communities (31 total, 2 thin omitted)

### Community 0 - "i18n.js"
Cohesion: 0.08
Nodes (37): __dirname, main(), __dirname, fail(), main(), ok(), SRC, client (+29 more)

### Community 1 - "settingsService.js"
Cohesion: 0.08
Nodes (39): execute(), cache, createDefaults(), DEFAULTS, deserialize(), ensureRow(), parseArray(), parseObject() (+31 more)

### Community 2 - "Project Dependencies"
Cohesion: 0.06
Nodes (34): dotenv, nanoid, author, dependencies, discord.js, dotenv, nanoid, @prisma/client (+26 more)

### Community 3 - "Participation and Eligibility"
Cohesion: 0.30
Nodes (13): execute(), addOrRemoveEntry(), drawWinners(), scheduleEmbedRefresh(), shuffle(), bonusToEdit(), checkEligibility(), listToEdit() (+5 more)

### Community 4 - "embeds.js"
Cohesion: 0.08
Nodes (55): execute(), execute(), PERMISSIONS, execute(), execute(), execute(), REQUIRED_PERMS, createGiveawayEndpoint() (+47 more)

### Community 5 - "controlServer.js"
Cohesion: 0.09
Nodes (55): execute(), REQUIRED_PERMS, clearTebex(), deleteTemplateEndpoint(), getGiveawayDetail(), handle(), isGuildOwner(), listChannels() (+47 more)

### Community 6 - "giveawayService.js"
Cohesion: 0.13
Nodes (48): execute(), execute(), execute(), execute(), execute(), execute(), execute(), execute() (+40 more)

### Community 7 - "tebexService.js"
Cohesion: 0.14
Nodes (21): setTebexSecret(), couponConfigured(), couponPackagesForWinner(), formatExpiry(), generateCouponCode(), issueCoupons(), issueOne(), nanoCode (+13 more)

### Community 8 - "Project Guidelines and Standards"
Cohesion: 0.20
Nodes (10): Feature Request Issue Form, Dummy DATABASE_URL for Prisma Validate, i18n Completeness Check Step, Contributor Covenant Code of Conduct v2.1, Community Impact Enforcement Ladder, Contributing Guide, i18n Key Parity Rule (en.json is source of truth), Local MariaDB Docker Test Setup (port 3308) (+2 more)

### Community 9 - "Deployment and CI Workflows"
Cohesion: 0.20
Nodes (10): Deploy Job (SSH to Debian server), Docs-Only Changes Skip Production Redeploy, Automatic Global Slash Command Registration, Self-Healing Git Reset Deploy Strategy, systemd Service discord-giveaway Restart, GitHub as Single Source of Truth for Mirror, Mirror to Codeberg Job, origin/HEAD Symbolic Ref Deletion Before Push (+2 more)

### Community 10 - "Project Documentation and Licensing"
Cohesion: 0.25
Nodes (9): GitHub Sponsors Funding (MSK-Scripts), GNU Affero General Public License v3, Network Use Source Disclosure (AGPL Section 13), Slash Command Reference, Discord Giveaway Bot, Manager Gating (Manage Server or manager role), Self-Hosting Not Supported, Static Verification Commands (no DB/token) (+1 more)

### Community 11 - "Release and PR Verification"
Cohesion: 0.25
Nodes (9): PR Verification Checklist (i18n, smoke, prisma validate), Pull Request Template, Reusable Static Verification Gate (workflow_call), Smoke Test Step (exports + SlashCommand builder), CI verify Job, Pre-Release Detection via Tag Suffix, GitHub Release Job, MSK Giveaway Bot Changelog (+1 more)

### Community 12 - "Security and Issue Configuration"
Cohesion: 0.29
Nodes (8): Issue Routing Config (blank issues disabled), Private Security Advisory Channel, Invite Permissions from PermissionFlagsBits (478208), Least-Privilege Discord Intents (Guilds only), Prisma Parameterized Queries (no SQL injection), Security Policy, Self-Hoster Hardening Checklist, Coordinated Vulnerability Disclosure Process

### Community 13 - "Dashboard and Web Services"
Cohesion: 0.48
Nodes (7): Complete Event Logging to Log Channel, Release 1.4.0 (dashboard, control endpoint, results pages), Scope-Bound Dashboard OAuth Session, Shared Service Layer for Cancel/Reroll, Localhost-Only Control Endpoint (controlServer.js), Public Results Page (data-minimised), Web Dashboard (msk-scripts.de/giveaway/dashboard)

### Community 14 - "Dependency and Security Audits"
Cohesion: 0.40
Nodes (6): Dependabot Update Config, Grouped Minor/Patch Update Strategy, Manual Major-Version Migration Policy (discord.js, prisma), CodeQL Analyze Job (javascript-typescript), Pinned undici Override (npm overrides), Supply-Chain Controls (Dependabot, CodeQL, CI gate)

### Community 15 - "Internationalization Utilities"
Cohesion: 0.29
Nodes (4): DIR, __dirname, en, enKeys

### Community 16 - "Bug Reporting and Secrets"
Cohesion: 0.50
Nodes (4): Bug Report Issue Form, Secret Redaction Requirement in Reports, Production .env Never Stored in Git, Secrets Confined to .env and Actions Secrets

### Community 17 - "Database Schema Migrations"
Cohesion: 0.38
Nodes (5): `Entry`, `Giveaway`, `GuildSettings`, `Winner`, `GiveawayCoupon`

### Community 25 - "Changelog Management"
Cohesion: 0.43
Nodes (5): candidates(), CHANGELOG, __dirname, extractSection(), __dirname

### Community 30 - "scheduler.js"
Cohesion: 0.18
Nodes (12): prisma, execute(), execute(), deleteGuildData(), purgeOrphanedGuilds(), startMaintenance(), storedGuildIds(), deleteGuildResults() (+4 more)

## Ambiguous Edges - Review These
- `GitHub Sponsors Funding (MSK-Scripts)` → `Discord Giveaway Bot`  [AMBIGUOUS]
  .github/FUNDING.yml · relation: conceptually_related_to

## Knowledge Gaps
- **80 isolated node(s):** `__dirname`, `name`, `version`, `description`, `type` (+75 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `GitHub Sponsors Funding (MSK-Scripts)` and `Discord Giveaway Bot`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `t()` connect `giveawayService.js` to `i18n.js`, `Participation and Eligibility`, `embeds.js`, `controlServer.js`, `scheduler.js`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Why does `getSettings()` connect `giveawayService.js` to `i18n.js`, `settingsService.js`, `Participation and Eligibility`, `embeds.js`, `controlServer.js`, `scheduler.js`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `logger` connect `i18n.js` to `settingsService.js`, `embeds.js`, `controlServer.js`, `giveawayService.js`, `tebexService.js`, `scheduler.js`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **What connects `__dirname`, `name`, `version` to the rest of the system?**
  _80 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `i18n.js` be split into smaller, more focused modules?**
  _Cohesion score 0.07993197278911565 - nodes in this community are weakly interconnected._
- **Should `settingsService.js` be split into smaller, more focused modules?**
  _Cohesion score 0.07738095238095238 - nodes in this community are weakly interconnected._