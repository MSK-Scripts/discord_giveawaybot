# Graph Report - discord_giveaway  (2026-08-17)

## Corpus Check
- 92 files · ~96,327 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 463 nodes · 1429 edges · 20 communities (18 shown, 2 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 22 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `172b4024`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- logger.js
- prizes.test.js
- Project Dependencies and Config
- cleanupService.js
- giveawayService.js
- controlServer.js
- t
- tebexService.js
- Project Contribution Guidelines
- Deployment and Mirroring CI
- Licensing and Project Info
- CI/CD Release Workflows
- Security and Permissions Policy
- Web Dashboard and Logging
- Dependency and Security Audits
- Internationalization Utilities
- Bug Reporting and Secrets
- Test Database Setup
- secret-box.test.js
- changelog-section.js

## God Nodes (most connected - your core abstractions)
1. `t()` - 68 edges
2. `getSettings()` - 53 edges
3. `normalizePrizeMode()` - 31 edges
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

## Communities (20 total, 2 thin omitted)

### Community 0 - "logger.js"
Cohesion: 0.08
Nodes (36): __dirname, main(), __dirname, fail(), main(), ok(), SRC, client (+28 more)

### Community 1 - "prizes.test.js"
Cohesion: 0.09
Nodes (27): call(), createGiveaway(), editFor(), embedData(), calls, guildWithStore(), giveawayWithEntries(), NO_LIMITS (+19 more)

### Community 2 - "Project Dependencies and Config"
Cohesion: 0.06
Nodes (34): discord.js, dotenv, nanoid, author, dependencies, discord.js, dotenv, nanoid (+26 more)

### Community 3 - "cleanupService.js"
Cohesion: 0.20
Nodes (19): BUTTON_CHOICES, execute(), execute(), addOrRemoveEntry(), refreshActiveEmbeds(), resetGiveawayEligibility(), scheduleEmbedRefresh(), setGiveawayBlacklistRoles() (+11 more)

### Community 4 - "giveawayService.js"
Cohesion: 0.10
Nodes (53): execute(), execute(), PERMISSIONS, execute(), execute(), cancelGiveaway(), countEntries(), dmWinners() (+45 more)

### Community 5 - "controlServer.js"
Cohesion: 0.07
Nodes (79): execute(), REQUIRED_PERMS, execute(), REQUIRED_PERMS, clearTebex(), createGiveawayEndpoint(), deleteTemplateEndpoint(), editGiveawayEndpoint() (+71 more)

### Community 6 - "t"
Cohesion: 0.12
Nodes (36): execute(), execute(), execute(), execute(), execute(), execute(), execute(), execute() (+28 more)

### Community 7 - "tebexService.js"
Cohesion: 0.23
Nodes (14): couponConfigured(), couponPackagesForWinner(), formatExpiry(), generateCouponCode(), issueCoupons(), issueOne(), nanoCode, parsePackages() (+6 more)

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

### Community 25 - "changelog-section.js"
Cohesion: 0.43
Nodes (5): candidates(), CHANGELOG, __dirname, extractSection(), __dirname

## Ambiguous Edges - Review These
- `GitHub Sponsors Funding (MSK-Scripts)` → `Discord Giveaway Bot`  [AMBIGUOUS]
  .github/FUNDING.yml · relation: conceptually_related_to

## Knowledge Gaps
- **72 isolated node(s):** `__dirname`, `name`, `version`, `description`, `type` (+67 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `GitHub Sponsors Funding (MSK-Scripts)` and `Discord Giveaway Bot`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `openTestDb()` connect `prizes.test.js` to `giveawayService.js`, `controlServer.js`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Why does `t()` connect `giveawayService.js` to `logger.js`, `cleanupService.js`, `controlServer.js`, `t`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Why does `getSettings()` connect `t` to `logger.js`, `cleanupService.js`, `giveawayService.js`, `controlServer.js`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **What connects `__dirname`, `name`, `version` to the rest of the system?**
  _72 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `logger.js` be split into smaller, more focused modules?**
  _Cohesion score 0.0815686274509804 - nodes in this community are weakly interconnected._
- **Should `prizes.test.js` be split into smaller, more focused modules?**
  _Cohesion score 0.09485815602836879 - nodes in this community are weakly interconnected._