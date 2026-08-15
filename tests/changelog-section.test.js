/**
 * Extracting the release notes from CHANGELOG.md.
 *
 * The script fails quietly on purpose (an empty section must not abort a
 * release), which is exactly the kind of thing nobody notices until a release
 * goes out with the wrong text — as v1.5.0 did. Hence these tests.
 *
 * No database, no Discord.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { extractSection, candidates } from '../scripts/changelog-section.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SAMPLE = `# Changelog

Intro text that belongs to no version.

## [1.5.0]

### Added
- Something new.

## [1.4.0]

### Fixed
- Something old.
`;

test('the section of a version ends at the next version', () => {
  assert.equal(extractSection(SAMPLE, 'v1.5.0'), '### Added\n- Something new.');
  assert.equal(extractSection(SAMPLE, '1.4.0'), '### Fixed\n- Something old.');
});

test('the leading v is optional and the intro is never returned', () => {
  assert.equal(extractSection(SAMPLE, '1.5.0'), extractSection(SAMPLE, 'v1.5.0'));
  assert.ok(!extractSection(SAMPLE, 'v1.5.0').includes('Intro text'));
});

test('an unknown version yields an empty string instead of throwing', () => {
  assert.equal(extractSection(SAMPLE, 'v9.9.9'), '');
  assert.equal(extractSection(SAMPLE, ''), '');
  assert.equal(extractSection(SAMPLE, undefined), '');
  assert.equal(extractSection('', 'v1.5.0'), '');
});

test('a pre-release tag falls back to the section of its base version', () => {
  assert.deepEqual(candidates('v1.5.0-rc.1'), ['1.5.0-rc.1', '1.5.0']);
  assert.equal(extractSection(SAMPLE, 'v1.5.0-rc.1'), '### Added\n- Something new.');
});

test('the dots in a version are not treated as wildcards', () => {
  assert.equal(extractSection('## [1x5x0]\n- nope\n', 'v1.5.0'), '');
});

test('the real changelog has a section for the current package version', () => {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
  const changelog = readFileSync(join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
  const section = extractSection(changelog, pkg.version);
  assert.ok(section.length > 0, `CHANGELOG.md has no "## [${pkg.version}]" section`);
});
