# Graph Report - giveaway-dashboard-api  (2026-10-28)

## Corpus Check
- 108 files · ~120,424 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 597 nodes · 1829 edges · 42 communities (26 shown, 4 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1957872d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- logger.js
- db.js
- package.json
- giveawayService.js
- controlServer.js
- t
- tebexService.js
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
- test-db-setup.js
- changelog-section.js
- gsettings.js
- control-dashboard.test.js
- i18n.js
- Control API: dashboard endpoints
- settingsService.js
- profile.js
- templates.test.js
- control-eligibility.test.js
- coupons.test.js
- scheduled.test.js

## God Nodes (most connected - your core abstractions)
1. `t()` - 72 edges
2. `getSettings()` - 55 edges
3. `handle()` - 33 edges
4. `getGiveaway()` - 30 edges
5. `normalizePrizeMode()` - 30 edges
6. `sendGuildLog()` - 28 edges
7. `logger` - 21 edges
8. `execute()` - 20 edges
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

## Communities (42 total, 4 thin omitted)

### Community 0 - "logger.js"
Cohesion: 0.07
Nodes (40): __dirname, main(), __dirname, fail(), main(), ok(), SRC, client (+32 more)

### Community 1 - "db.js"
Cohesion: 0.18
Nodes (23): giveawayWithEntries(), NO_LIMITS, users, fast, firstClickGiveaway(), NO_LIMITS, addEntries(), cleanup() (+15 more)

### Community 2 - "package.json"
Cohesion: 0.06
Nodes (35): dotenv, nanoid, author, dependencies, discord.js, dotenv, nanoid, @prisma/client (+27 more)

### Community 4 - "giveawayService.js"
Cohesion: 0.08
Nodes (66): execute(), execute(), execute(), execute(), addOrRemoveEntry(), cancelGiveaway(), countEntries(), DELETABLE_STATUSES (+58 more)

### Community 5 - "controlServer.js"
Cohesion: 0.06
Nodes (84): execute(), REQUIRED_PERMS, clearTebex(), EDITABLE_STATUSES, editGiveawayEndpoint(), fillMissingNames(), getGiveawayDetail(), guildInfo() (+76 more)

### Community 6 - "t"
Cohesion: 0.13
Nodes (42): execute(), execute(), execute(), execute(), execute(), execute(), execute(), PERMISSIONS (+34 more)

### Community 7 - "tebexService.js"
Cohesion: 0.13
Nodes (23): revealTebexSecret(), setTebexSecret(), couponConfigured(), couponPackagesForWinner(), formatExpiry(), generateCouponCode(), issueCoupons(), issueOne() (+15 more)

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
Cohesion: 0.38
Nodes (5): `Entry`, `Giveaway`, `GuildSettings`, `Winner`, `GiveawayCoupon`

### Community 25 - "changelog-section.js"
Cohesion: 0.43
Nodes (5): candidates(), CHANGELOG, __dirname, extractSection(), __dirname

### Community 30 - "gsettings.js"
Cohesion: 0.21
Nodes (18): BUTTON_CHOICES, execute(), refreshActiveEmbeds(), resetGiveawayEligibility(), setGiveawayBlacklistRoles(), setGiveawayBonusRoles(), setGiveawayWhitelistRoles(), updateSettings() (+10 more)

### Community 31 - "control-dashboard.test.js"
Cohesion: 0.14
Nodes (10): addGuild(), call(), controlId(), giveawayRow(), guilds, post(), state, userId() (+2 more)

### Community 32 - "i18n.js"
Cohesion: 0.15
Nodes (10): getLang(), DEFAULT_LANG, __dirname, interpolate(), locales, LOCALES_DIR, resolveLang(), SUPPORTED_LANGS (+2 more)

### Community 33 - "Control API: dashboard endpoints"
Cohesion: 0.17
Nodes (11): Control API: dashboard endpoints, Edit and actions, GET /guild, GET /history, POST /giveaway/create, POST /giveaway/delete, POST /giveaway/preview, Scheduled giveaways (+3 more)

### Community 34 - "settingsService.js"
Cohesion: 0.29
Nodes (8): execute(), cache, createDefaults(), DEFAULTS, deserialize(), ensureRow(), parseArray(), parseObject()

### Community 35 - "profile.js"
Cohesion: 0.39
Nodes (7): winnerRows(), avatarOf(), clean(), MAX_AVATAR_URL, MAX_DISPLAY_NAME, memberProfile(), userProfile()

### Community 36 - "templates.test.js"
Cohesion: 0.36
Nodes (5): BASE_TEMPLATE, call(), from(), list(), save()

### Community 37 - "control-eligibility.test.js"
Cohesion: 0.43
Nodes (5): call(), createGiveaway(), editFor(), embedData(), field()

## Ambiguous Edges - Review These
- `GitHub Sponsors Funding (MSK-Scripts)` → `Discord Giveaway Bot`  [AMBIGUOUS]
  .github/FUNDING.yml · relation: conceptually_related_to

## Knowledge Gaps
- **98 isolated node(s):** `__dirname`, `name`, `version`, `description`, `type` (+93 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 156 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `GitHub Sponsors Funding (MSK-Scripts)` and `Discord Giveaway Bot`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `t()` connect `t` to `logger.js`, `i18n.js`, `giveawayService.js`, `controlServer.js`, `gsettings.js`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Why does `getSettings()` connect `t` to `logger.js`, `settingsService.js`, `giveawayService.js`, `controlServer.js`, `gsettings.js`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Why does `logger` connect `logger.js` to `settingsService.js`, `giveawayService.js`, `controlServer.js`, `t`, `tebexService.js`, `gsettings.js`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **What connects `__dirname`, `name`, `version` to the rest of the system?**
  _98 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `logger.js` be split into smaller, more focused modules?**
  _Cohesion score 0.07259528130671507 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.05555555555555555 - nodes in this community are weakly interconnected._