#!/usr/bin/env node
/**
 * Prints the CHANGELOG.md section of one version, for the release notes.
 *
 * `generate_release_notes` on GitHub only ever lists merged pull requests. Most
 * of the work in this repository is committed straight to main, so the notes of
 * v1.5.0 consisted of Dependabot bumps and nothing else — the actual feature was
 * missing. release.yml therefore puts this section in front of them.
 *
 * Usage: node scripts/changelog-section.js v1.5.0
 *
 * Prints nothing and exits 0 when there is no matching section: a release with
 * thin notes is annoying, a release that fails to publish is worse.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHANGELOG = join(__dirname, '..', 'CHANGELOG.md');

/** "v1.5.0-rc.1" -> ["1.5.0-rc.1", "1.5.0"]: exact heading first, then the base version. */
export function candidates(tag) {
  const version = String(tag ?? '').trim().replace(/^v/, '');
  if (!version) return [];
  const base = version.split('-')[0];
  return base && base !== version ? [version, base] : [version];
}

/**
 * The body of `## [<version>]`, without the heading itself.
 * @returns {string} trimmed section, or '' when the version has no section
 */
export function extractSection(markdown, tag) {
  const lines = String(markdown ?? '').split(/\r?\n/);

  for (const version of candidates(tag)) {
    // Escape the dots so "1.5.0" cannot match "1x5y0".
    const heading = new RegExp(`^##\\s+\\[${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]`);
    const start = lines.findIndex((line) => heading.test(line));
    if (start === -1) continue;

    const rest = lines.slice(start + 1);
    const end = rest.findIndex((line) => /^##\s/.test(line));
    return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
  }
  return '';
}

// Direct call only, so the tests can import the functions above.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const section = extractSection(readFileSync(CHANGELOG, 'utf8'), process.argv[2]);
  if (!section) {
    console.error(`changelog-section: no section for "${process.argv[2]}" in CHANGELOG.md`);
  }
  process.stdout.write(section ? `${section}\n` : '');
}
