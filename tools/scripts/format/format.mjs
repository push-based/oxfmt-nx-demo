#!/usr/bin/env node
/**
 * Hybrid format router: oxfmt for everything it can parse, Prettier for the rest.
 *
 * Why a script at all, when a whole-workspace run is just two commands?
 *
 *   1. Git hooks pass a list of staged files. That list has to be *split* between the
 *      two formatters, and each formatter has to be skipped when its half is empty —
 *      both tools treat an unmatched pattern as an error.
 *   2. The two tools share an ignore file. oxfmt reads `.prettierignore`, so
 *      Prettier-only exclusions have to be handed over separately with `--ignore-path`.
 *   3. Reporting. Knowing which formatter spent the wall-clock time is the only way to
 *      find out that Prettier's small tail of files costs more than oxfmt's long one.
 *
 * Usage:
 *   node tools/scripts/format/format.mjs                    # write, whole workspace
 *   node tools/scripts/format/format.mjs --check            # check, whole workspace
 *   node tools/scripts/format/format.mjs [--check] <paths…> # write/check a file list
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * Resolve a formatter from the workspace's own `node_modules/.bin`.
 *
 * `yarn format` puts that directory on PATH for free; a git hook does not. Without
 * this the hook dies with a bare ENOENT, which is a confusing way to find out that
 * your pre-commit formatter never ran.
 */
const bin = (name) => {
  const local = join(
    repoRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? `${name}.cmd` : name,
  );
  return existsSync(local) ? local : name;
};

/**
 * The split, in one predicate.
 *
 * oxfmt infers its parser from the file name and has no per-glob parser override yet
 * (oxc-project/oxc#17852). It reads `foo.component.html` as an Angular template and
 * every other `.html` as plain HTML — which silently flattens the indentation of
 * Angular control-flow blocks (`@if`, `@for`) in a template named anything else.
 *
 * So: component templates and all non-HTML source go to oxfmt; every other `.html`
 * goes to Prettier, which *can* be pointed at `parser: angular` by glob.
 *
 * Keep this in sync with the two config files that apply the same rule to
 * whole-workspace runs: `ignorePatterns` in `.oxfmtrc.json`, and `.prettieronlyignore`.
 */
const isPrettierOwned = (file) =>
  /\.html?$/i.test(file) && !/\.component\.html$/i.test(file);

const argv = process.argv.slice(2);
const check = argv.includes('--check');
const paths = argv.filter((arg) => !arg.startsWith('-'));

const run = (label, command, args) => {
  const started = performance.now();
  const { status, error } = spawnSync(command, args, {
    stdio: 'inherit',
    // Ignore paths in prettierArgs() are relative to the workspace root.
    cwd: repoRoot,
    shell: process.platform === 'win32',
  });
  const seconds = ((performance.now() - started) / 1000).toFixed(2);

  if (error) {
    console.error(`\n${label}: failed to start — ${error.message}`);
    return { label, seconds, ok: false };
  }
  return { label, seconds, ok: status === 0 };
};

const oxfmtArgs = (targets) => [
  ...(check ? ['--check'] : []),
  ...(targets.length ? targets : ['.']),
];

const prettierArgs = (targets) => [
  check ? '--check' : '--write',
  // `.prettierignore` is shared with oxfmt. Prettier-only rules live in the second file.
  '--ignore-path',
  '.prettierignore',
  '--ignore-path',
  '.prettieronlyignore',
  // A staged-file list can contain anything, so don't fail on a file Prettier
  // has no parser for.
  ...(targets.length ? ['--ignore-unknown'] : []),
  ...(targets.length ? targets : ['.']),
];

const results = [];

if (paths.length === 0) {
  // Whole workspace: each tool's ignore configuration does the routing.
  results.push(run('oxfmt', bin('oxfmt'), oxfmtArgs([])));
  results.push(run('prettier', bin('prettier'), prettierArgs([])));
} else {
  const forPrettier = paths.filter(isPrettierOwned);
  const forOxfmt = paths.filter((file) => !isPrettierOwned(file));

  if (forOxfmt.length)
    results.push(run('oxfmt', bin('oxfmt'), oxfmtArgs(forOxfmt)));
  if (forPrettier.length) {
    results.push(run('prettier', bin('prettier'), prettierArgs(forPrettier)));
  }
  if (results.length === 0) {
    console.log('format: nothing to do');
    process.exit(0);
  }
}

const total = results.reduce((sum, r) => sum + Number(r.seconds), 0).toFixed(2);
console.log(
  `\n${check ? 'format:check' : 'format'} — ` +
    results.map((r) => `${r.label} ${r.seconds}s`).join(', ') +
    `, total ${total}s`,
);

process.exit(results.every((r) => r.ok) ? 0 : 1);
