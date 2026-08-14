# Graph Report - .  (2026-08-14)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 348 nodes · 927 edges · 23 communities (21 shown, 2 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 18 edges (avg confidence: 0.81)
- Token cost: 1,271 input · 264 output

## Graph Freshness
- Built from commit: `436acca3`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Bot Core and Client
- Database Unit Tests
- Project Dependencies and Config
- Guild Settings Management
- Giveaway Participation Commands
- Database Maintenance and Cleanup
- Giveaway Management Commands
- Giveaway Templates Service
- Project Contribution Guidelines
- Deployment and Mirroring CI
- Licensing and Project Info
- CI/CD Release Workflows
- Security and Permissions Policy
- Web Dashboard and Logging
- Dependency and Security Audits
- Internationalization Utilities
- Bug Reporting and Secrets
- Initial Database Schema
- Template Schema Migration
- Test Database Setup

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

## Communities (23 total, 2 thin omitted)

### Community 0 - "Bot Core and Client"
Cohesion: 0.12
Nodes (23): __dirname, main(), __dirname, fail(), main(), ok(), SRC, client (+15 more)

### Community 1 - "Database Unit Tests"
Cohesion: 0.26
Nodes (15): giveawayWithEntries(), NO_LIMITS, users, addEntries(), cleanup(), createTestGiveaway(), openTestDb(), skipDb (+7 more)

### Community 2 - "Project Dependencies and Config"
Cohesion: 0.06
Nodes (34): discord.js, dotenv, nanoid, author, dependencies, discord.js, dotenv, nanoid (+26 more)

### Community 3 - "Guild Settings Management"
Cohesion: 0.11
Nodes (25): BUTTON_CHOICES, execute(), parseArr(), parseObj(), execute(), setGiveawayBlacklistRoles(), setGiveawayBonusRoles(), setGiveawayWhitelistRoles() (+17 more)

### Community 4 - "Giveaway Participation Commands"
Cohesion: 0.10
Nodes (47): execute(), execute(), execute(), PERMISSIONS, execute(), execute(), execute(), addOrRemoveEntry() (+39 more)

### Community 5 - "Database Maintenance and Cleanup"
Cohesion: 0.15
Nodes (18): prisma, execute(), execute(), deleteGuildData(), purgeOrphanedGuilds(), startMaintenance(), storedGuildIds(), deleteGuildResults() (+10 more)

### Community 6 - "Giveaway Management Commands"
Cohesion: 0.15
Nodes (32): execute(), execute(), execute(), execute(), execute(), execute(), execute(), execute() (+24 more)

### Community 7 - "Giveaway Templates Service"
Cohesion: 0.22
Nodes (13): execute(), REQUIRED_PERMS, execute(), REQUIRED_PERMS, createGiveawayEndpoint(), createGiveaway(), postGiveaway(), deleteTemplate() (+5 more)

### Community 8 - "Project Contribution Guidelines"
Cohesion: 0.20
Nodes (10): Feature Request Issue Form, Dummy DATABASE_URL for Prisma Validate, i18n Completeness Check Step, Contributor Covenant Code of Conduct v2.1, Community Impact Enforcement Ladder, Contributing Guide, i18n Key Parity Rule (en.json is source of truth), Local MariaDB Docker Test Setup (port 3308) (+2 more)

### Community 9 - "Deployment and Mirroring CI"
Cohesion: 0.20
Nodes (10): Deploy Job (SSH to Debian server), Docs-Only Changes Skip Production Redeploy, Automatic Global Slash Command Registration, Self-Healing Git Reset Deploy Strategy, systemd Service discord-giveaway Restart, GitHub as Single Source of Truth for Mirror, Mirror to Codeberg Job, origin/HEAD Symbolic Ref Deletion Before Push (+2 more)

### Community 10 - "Licensing and Project Info"
Cohesion: 0.25
Nodes (9): GitHub Sponsors Funding (MSK-Scripts), GNU Affero General Public License v3, Network Use Source Disclosure (AGPL Section 13), Slash Command Reference, Discord Giveaway Bot, Manager Gating (Manage Server or manager role), Self-Hosting Not Supported, Static Verification Commands (no DB/token) (+1 more)

### Community 11 - "CI/CD Release Workflows"
Cohesion: 0.25
Nodes (9): PR Verification Checklist (i18n, smoke, prisma validate), Pull Request Template, Reusable Static Verification Gate (workflow_call), Smoke Test Step (exports + SlashCommand builder), CI verify Job, Pre-Release Detection via Tag Suffix, GitHub Release Job, MSK Giveaway Bot Changelog (+1 more)

### Community 12 - "Security and Permissions Policy"
Cohesion: 0.29
Nodes (8): Issue Routing Config (blank issues disabled), Private Security Advisory Channel, Invite Permissions from PermissionFlagsBits (478208), Least-Privilege Discord Intents (Guilds only), Prisma Parameterized Queries (no SQL injection), Security Policy, Self-Hoster Hardening Checklist, Coordinated Vulnerability Disclosure Process

### Community 13 - "Web Dashboard and Logging"
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

### Community 17 - "Initial Database Schema"
Cohesion: 0.60
Nodes (4): `Entry`, `Giveaway`, `GuildSettings`, `Winner`

## Ambiguous Edges - Review These
- `GitHub Sponsors Funding (MSK-Scripts)` → `Discord Giveaway Bot`  [AMBIGUOUS]
  .github/FUNDING.yml · relation: conceptually_related_to

## Knowledge Gaps
- **67 isolated node(s):** `__dirname`, `name`, `version`, `description`, `type` (+62 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `GitHub Sponsors Funding (MSK-Scripts)` and `Discord Giveaway Bot`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `openTestDb()` connect `Database Unit Tests` to `Database Maintenance and Cleanup`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Why does `t()` connect `Giveaway Participation Commands` to `Bot Core and Client`, `Guild Settings Management`, `Database Maintenance and Cleanup`, `Giveaway Management Commands`, `Giveaway Templates Service`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Why does `getSettings()` connect `Giveaway Management Commands` to `Bot Core and Client`, `Guild Settings Management`, `Giveaway Participation Commands`, `Database Maintenance and Cleanup`, `Giveaway Templates Service`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **What connects `__dirname`, `name`, `version` to the rest of the system?**
  _67 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Bot Core and Client` be split into smaller, more focused modules?**
  _Cohesion score 0.11693548387096774 - nodes in this community are weakly interconnected._
- **Should `Project Dependencies and Config` be split into smaller, more focused modules?**
  _Cohesion score 0.05714285714285714 - nodes in this community are weakly interconnected._