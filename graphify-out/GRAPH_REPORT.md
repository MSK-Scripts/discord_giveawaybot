# Graph Report - discord_giveaway  (2026-08-17)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 493 nodes · 1504 edges · 30 communities (28 shown, 2 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.81)
- Token cost: 1,453 input · 339 output

## Graph Freshness
- Built from commit: `1f95d311`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Core Application Entry
- Eligibility and Tebex Tests
- Project Dependencies
- Participation and Eligibility
- General Bot Commands
- Control Server Endpoints
- Giveaway Management Commands
- Giveaway Creation Logic
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

## God Nodes (most connected - your core abstractions)
1. `t()` - 68 edges
2. `getSettings()` - 53 edges
3. `normalizePrizeMode()` - 30 edges
4. `getGiveaway()` - 29 edges
5. `handle()` - 28 edges
6. `sendGuildLog()` - 25 edges
7. `logger` - 20 edges
8. `rerollSingle()` - 19 edges
9. `execute()` - 19 edges
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

## Communities (30 total, 2 thin omitted)

### Community 0 - "Core Application Entry"
Cohesion: 0.08
Nodes (37): __dirname, main(), __dirname, fail(), main(), ok(), SRC, client (+29 more)

### Community 1 - "Eligibility and Tebex Tests"
Cohesion: 0.10
Nodes (31): call(), createGiveaway(), editFor(), embedData(), field(), calls, guildWithStore(), giveawayWithEntries() (+23 more)

### Community 2 - "Project Dependencies"
Cohesion: 0.06
Nodes (34): dotenv, nanoid, author, dependencies, discord.js, dotenv, nanoid, @prisma/client (+26 more)

### Community 3 - "Participation and Eligibility"
Cohesion: 0.30
Nodes (13): execute(), addOrRemoveEntry(), drawWinners(), scheduleEmbedRefresh(), shuffle(), bonusToEdit(), checkEligibility(), listToEdit() (+5 more)

### Community 4 - "General Bot Commands"
Cohesion: 0.09
Nodes (61): execute(), execute(), execute(), PERMISSIONS, execute(), BUTTON_CHOICES, execute(), execute() (+53 more)

### Community 5 - "Control Server Endpoints"
Cohesion: 0.07
Nodes (67): execute(), REQUIRED_PERMS, clearTebex(), deleteTemplateEndpoint(), extendGiveawayEndpoint(), getGiveawayDetail(), handle(), isGuildOwner() (+59 more)

### Community 6 - "Giveaway Management Commands"
Cohesion: 0.12
Nodes (31): execute(), execute(), execute(), execute(), execute(), execute(), execute(), execute() (+23 more)

### Community 7 - "Giveaway Creation Logic"
Cohesion: 0.11
Nodes (38): execute(), execute(), REQUIRED_PERMS, createGiveawayEndpoint(), editGiveawayEndpoint(), parseCouponInput(), createGiveaway(), postGiveaway() (+30 more)

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

## Ambiguous Edges - Review These
- `GitHub Sponsors Funding (MSK-Scripts)` → `Discord Giveaway Bot`  [AMBIGUOUS]
  .github/FUNDING.yml · relation: conceptually_related_to

## Knowledge Gaps
- **79 isolated node(s):** `__dirname`, `__dirname`, `SRC`, `COMMANDS_DIR`, `__dirname` (+74 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `GitHub Sponsors Funding (MSK-Scripts)` and `Discord Giveaway Bot`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `t()` connect `General Bot Commands` to `Core Application Entry`, `Participation and Eligibility`, `Control Server Endpoints`, `Giveaway Management Commands`, `Giveaway Creation Logic`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **Why does `getSettings()` connect `Giveaway Management Commands` to `Core Application Entry`, `Participation and Eligibility`, `General Bot Commands`, `Control Server Endpoints`, `Giveaway Creation Logic`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Why does `logger` connect `Core Application Entry` to `General Bot Commands`, `Control Server Endpoints`, `Giveaway Management Commands`, `Giveaway Creation Logic`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **What connects `__dirname`, `__dirname`, `SRC` to the rest of the system?**
  _79 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Core Application Entry` be split into smaller, more focused modules?**
  _Cohesion score 0.07756813417190776 - nodes in this community are weakly interconnected._
- **Should `Eligibility and Tebex Tests` be split into smaller, more focused modules?**
  _Cohesion score 0.09579100145137881 - nodes in this community are weakly interconnected._