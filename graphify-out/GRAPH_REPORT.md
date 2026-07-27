# Graph Report - .  (2026-07-27)

## Corpus Check
- Corpus is ~30,334 words - fits in a single context window. You may not need a graph.

## Summary
- 307 nodes · 834 edges · 17 communities
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 18 edges (avg confidence: 0.81)
- Token cost: 136,710 input · 0 output

## Community Hubs (Navigation)
- Bootstrap and Handler Loading
- Giveaway Lifecycle Engine
- Dependencies and NPM Scripts
- Manager Slash Commands and i18n
- Info Commands and Embed Builders
- Guild Settings and Configuration
- Localhost Control Server API
- Templates and Duration Parsing
- Contribution and Code Conventions
- Deployment and Mirroring
- Licensing and Project Overview
- CI Verification and Releases
- Security Policy and Hardening
- Web Dashboard Integration
- Dependency Supply-Chain Controls
- i18n Key Parity Checker
- Secret Handling in Reports

## God Nodes (most connected - your core abstractions)
1. `t()` - 60 edges
2. `getSettings()` - 49 edges
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

## Communities (17 total, 0 thin omitted)

### Community 0 - "Bootstrap and Handler Loading"
Cohesion: 0.08
Nodes (36): __dirname, main(), __dirname, fail(), main(), ok(), SRC, client (+28 more)

### Community 1 - "Giveaway Lifecycle Engine"
Cohesion: 0.12
Nodes (44): execute(), execute(), lifecycleEndpoint(), addOrRemoveEntry(), cancelAndFinalize(), cancelGiveaway(), countEntries(), createGiveaway() (+36 more)

### Community 2 - "Dependencies and NPM Scripts"
Cohesion: 0.06
Nodes (32): discord.js, dotenv, nanoid, author, dependencies, discord.js, dotenv, nanoid (+24 more)

### Community 3 - "Manager Slash Commands and i18n"
Cohesion: 0.22
Nodes (17): execute(), execute(), execute(), execute(), execute(), execute(), execute(), getGiveaway() (+9 more)

### Community 4 - "Info Commands and Embed Builders"
Cohesion: 0.17
Nodes (16): execute(), execute(), execute(), PERMISSIONS, execute(), execute(), getGuildStats(), listActive() (+8 more)

### Community 5 - "Guild Settings and Configuration"
Cohesion: 0.16
Nodes (17): BUTTON_CHOICES, execute(), parseArr(), parseObj(), execute(), setGiveawayBlacklistRoles(), setGiveawayBonusRoles(), setGiveawayWhitelistRoles() (+9 more)

### Community 6 - "Localhost Control Server API"
Cohesion: 0.22
Nodes (16): createGiveawayEndpoint(), editGiveawayEndpoint(), extendGiveawayEndpoint(), getGiveawayDetail(), handle(), listChannels(), listGiveaways(), listRoles() (+8 more)

### Community 7 - "Templates and Duration Parsing"
Cohesion: 0.27
Nodes (10): execute(), REQUIRED_PERMS, execute(), REQUIRED_PERMS, deleteTemplate(), getTemplate(), listTemplates(), saveTemplate() (+2 more)

### Community 8 - "Contribution and Code Conventions"
Cohesion: 0.20
Nodes (10): Feature Request Issue Form, Dummy DATABASE_URL for Prisma Validate, i18n Completeness Check Step, Contributor Covenant Code of Conduct v2.1, Community Impact Enforcement Ladder, Contributing Guide, i18n Key Parity Rule (en.json is source of truth), Local MariaDB Docker Test Setup (port 3308) (+2 more)

### Community 9 - "Deployment and Mirroring"
Cohesion: 0.20
Nodes (10): Deploy Job (SSH to Debian server), Docs-Only Changes Skip Production Redeploy, Automatic Global Slash Command Registration, Self-Healing Git Reset Deploy Strategy, systemd Service discord-giveaway Restart, GitHub as Single Source of Truth for Mirror, Mirror to Codeberg Job, origin/HEAD Symbolic Ref Deletion Before Push (+2 more)

### Community 10 - "Licensing and Project Overview"
Cohesion: 0.25
Nodes (9): GitHub Sponsors Funding (MSK-Scripts), GNU Affero General Public License v3, Network Use Source Disclosure (AGPL Section 13), Slash Command Reference, Discord Giveaway Bot, Manager Gating (Manage Server or manager role), Self-Hosting Not Supported, Static Verification Commands (no DB/token) (+1 more)

### Community 11 - "CI Verification and Releases"
Cohesion: 0.25
Nodes (9): PR Verification Checklist (i18n, smoke, prisma validate), Pull Request Template, Reusable Static Verification Gate (workflow_call), Smoke Test Step (exports + SlashCommand builder), CI verify Job, Pre-Release Detection via Tag Suffix, GitHub Release Job, MSK Giveaway Bot Changelog (+1 more)

### Community 12 - "Security Policy and Hardening"
Cohesion: 0.29
Nodes (8): Issue Routing Config (blank issues disabled), Private Security Advisory Channel, Invite Permissions from PermissionFlagsBits (478208), Least-Privilege Discord Intents (Guilds only), Prisma Parameterized Queries (no SQL injection), Security Policy, Self-Hoster Hardening Checklist, Coordinated Vulnerability Disclosure Process

### Community 13 - "Web Dashboard Integration"
Cohesion: 0.48
Nodes (7): Complete Event Logging to Log Channel, Release 1.4.0 (dashboard, control endpoint, results pages), Scope-Bound Dashboard OAuth Session, Shared Service Layer for Cancel/Reroll, Localhost-Only Control Endpoint (controlServer.js), Public Results Page (data-minimised), Web Dashboard (msk-scripts.de/giveaway/dashboard)

### Community 14 - "Dependency Supply-Chain Controls"
Cohesion: 0.40
Nodes (6): Dependabot Update Config, Grouped Minor/Patch Update Strategy, Manual Major-Version Migration Policy (discord.js, prisma), CodeQL Analyze Job (javascript-typescript), Pinned undici Override (npm overrides), Supply-Chain Controls (Dependabot, CodeQL, CI gate)

### Community 15 - "i18n Key Parity Checker"
Cohesion: 0.33
Nodes (4): DIR, __dirname, en, enKeys

### Community 16 - "Secret Handling in Reports"
Cohesion: 0.50
Nodes (4): Bug Report Issue Form, Secret Redaction Requirement in Reports, Production .env Never Stored in Git, Secrets Confined to .env and Actions Secrets

## Ambiguous Edges - Review These
- `GitHub Sponsors Funding (MSK-Scripts)` → `Discord Giveaway Bot`  [AMBIGUOUS]
  .github/FUNDING.yml · relation: conceptually_related_to

## Knowledge Gaps
- **59 isolated node(s):** `__dirname`, `name`, `version`, `description`, `type` (+54 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `GitHub Sponsors Funding (MSK-Scripts)` and `Discord Giveaway Bot`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `t()` connect `Giveaway Lifecycle Engine` to `Bootstrap and Handler Loading`, `Manager Slash Commands and i18n`, `Info Commands and Embed Builders`, `Guild Settings and Configuration`, `Localhost Control Server API`, `Templates and Duration Parsing`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Why does `getSettings()` connect `Manager Slash Commands and i18n` to `Bootstrap and Handler Loading`, `Giveaway Lifecycle Engine`, `Info Commands and Embed Builders`, `Guild Settings and Configuration`, `Localhost Control Server API`, `Templates and Duration Parsing`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Why does `logger` connect `Bootstrap and Handler Loading` to `Giveaway Lifecycle Engine`, `Guild Settings and Configuration`, `Localhost Control Server API`, `Templates and Duration Parsing`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **What connects `__dirname`, `name`, `version` to the rest of the system?**
  _59 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Bootstrap and Handler Loading` be split into smaller, more focused modules?**
  _Cohesion score 0.08220211161387632 - nodes in this community are weakly interconnected._
- **Should `Giveaway Lifecycle Engine` be split into smaller, more focused modules?**
  _Cohesion score 0.11607843137254902 - nodes in this community are weakly interconnected._