import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, globSync } from 'node:fs';

const action = process.argv[2]; // "check" | "write"
const extraArgs = process.argv.slice(3);

if (!['check', 'write'].includes(action)) {
  throw new Error('Action must be: check | write');
}

// Every flag the script understands. Anything else is a typo and should fail
// loudly, since the strategy is inferred from flags (an unrecognized flag would
// otherwise silently fall through to the default "changed" mode).
// Value-taking and boolean flags are listed together; the parser handles both.
const KNOWN_FLAGS = new Set([
  // selection strategies
  'all',
  'staged',
  'files',
  'paths',
  // changed-family refinements
  'base',
  'head',
  'uncommitted',
  'untracked',
  // accepted-and-ignored (nx parity)
  'exclude',
  'tui',
]);

// Throws on any --flag not in KNOWN_FLAGS. Only validates tokens that look like
// long flags (start with "--"); bare values (e.g. a --tui's "false") are skipped.
function assertKnownFlags() {
  for (const arg of extraArgs) {
    if (!arg.startsWith('--')) continue;
    const name = arg.slice(2).split('=')[0];
    if (!KNOWN_FLAGS.has(name)) {
      throw new Error(
        `Unknown flag: --${name}. Known flags: ${[...KNOWN_FLAGS].map((f) => `--${f}`).join(', ')}`,
      );
    }
  }
}

function readFlag(name) {
  const eq = extraArgs.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);

  const idx = extraArgs.indexOf(`--${name}`);
  if (
    idx !== -1 &&
    extraArgs[idx + 1] &&
    !extraArgs[idx + 1].startsWith('--')
  ) {
    return extraArgs[idx + 1];
  }
  return undefined;
}

function hasFlag(name) {
  return extraArgs.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));
}

// Mirrors nx parseCSV: comma/space delimited, strips surrounding quotes.
function parseCSV(value) {
  if (!value) return [];
  return value
    .split(/[, ]+/)
    .map((i) => i.trim())
    .filter(Boolean)
    .map((i) => (i.startsWith('"') && i.endsWith('"') ? i.slice(1, -1) : i));
}

// True if a string contains glob metacharacters.
function isGlob(p) {
  return /[*?[\]{}]/.test(p);
}

// Removes files that git considers ignored (respects root + nested .gitignore,
// .git/info/exclude, and global excludes). Untracked-but-not-ignored files are
// kept. Returns the input unchanged if git can't be consulted.
function filterGitIgnored(files) {
  if (files.length === 0) return files;
  let ignored;
  try {
    const out = execFileSync('git', ['check-ignore', '--stdin'], {
      input: files.join('\n'),
      encoding: 'utf8',
    });
    ignored = new Set(
      out
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean),
    );
  } catch (err) {
    // git check-ignore exits 1 when NOTHING is ignored — that's not an error,
    // it just means stdout is empty. Any other status: fail open (don't filter).
    if (err?.status === 1 && typeof err.stdout === 'string') {
      ignored = new Set(
        err.stdout
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean),
      );
    } else {
      return files;
    }
  }
  return files.filter((f) => !ignored.has(f));
}

// Resolves a list of path specs (files, directories, or globs) into a flat
// list of real files, then drops gitignored ones. Directories expand to their
// full subtree; globs via globSync; plain files pass through. Unknown literal
// paths throw.
function resolvePaths(specs) {
  const out = [];
  for (const spec of specs) {
    if (isGlob(spec)) {
      out.push(...globSync(spec));
      continue;
    }
    if (!existsSync(spec)) {
      throw new Error(`Path not found: ${spec}`);
    }
    if (statSync(spec).isDirectory()) {
      out.push(...globSync(`${spec}/**/*`));
    } else {
      out.push(spec);
    }
  }
  const real = Array.from(new Set(out)).filter(
    (f) => existsSync(f) && statSync(f).isFile(),
  );
  return filterGitIgnored(real);
}

function run(command, args) {
  try {
    execFileSync(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    return true;
  } catch (err) {
    if (typeof err?.status !== 'number') {
      throw err;
    }
    return false;
  }
}

function gitCapture(args) {
  return execFileSync('git', args, { encoding: 'utf8' })
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function gitCaptureSingle(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

// Mirrors nx getMergeBase: try merge-base, then --fork-point, else fall back to base.
function getMergeBase(base, head = 'HEAD') {
  try {
    return gitCaptureSingle(['merge-base', base, head]);
  } catch {
    try {
      return gitCaptureSingle(['merge-base', '--fork-point', base, head]);
    } catch {
      return base;
    }
  }
}

function getFilesUsingBaseAndHead(base, head) {
  return gitCapture([
    'diff',
    '--name-only',
    '--no-renames',
    '--relative',
    base,
    head,
  ]);
}

function getUncommittedFiles() {
  return gitCapture([
    'diff',
    '--name-only',
    '--no-renames',
    '--relative',
    'HEAD',
    '.',
  ]);
}

function getUntrackedFiles() {
  return gitCapture(['ls-files', '--others', '--exclude-standard']);
}

// Mirrors nx getBaseRef: nxJson.defaultBase ?? nxJson.affected?.defaultBase ?? 'main'.
function getBaseRef() {
  try {
    const nxJson = JSON.parse(readFileSync('nx.json', 'utf8'));
    return nxJson.defaultBase ?? nxJson.affected?.defaultBase ?? 'main';
  } catch {
    return 'main';
  }
}

// Returns the changed-file set for the "changed" family of flags.
function getChangedFiles() {
  if (hasFlag('uncommitted')) {
    return getUncommittedFiles().filter((f) => existsSync(f));
  }
  if (hasFlag('untracked')) {
    return getUntrackedFiles().filter((f) => existsSync(f));
  }

  let base = readFlag('base') ?? process.env.NX_BASE ?? getBaseRef();
  const head = readFlag('head') ?? process.env.NX_HEAD;

  base = getMergeBase(base, head ?? 'HEAD');

  let files;
  if (head) {
    files = getFilesUsingBaseAndHead(base, head);
  } else {
    files = Array.from(
      new Set([
        ...getFilesUsingBaseAndHead(base, 'HEAD'),
        ...getUncommittedFiles(),
        ...getUntrackedFiles(),
      ]),
    );
  }

  return files.filter((f) => existsSync(f));
}

// Infers the selection strategy from the flags present, rejecting combinations
// that span more than one mutually exclusive family. The "changed" family
// (base/head/uncommitted/untracked) may combine internally.
function resolveMode() {
  const isAll = hasFlag('all');
  const isStaged = hasFlag('staged');
  const isFiles = readFlag('files') !== undefined;
  const isPaths = readFlag('paths') !== undefined;
  const isChanged =
    hasFlag('base') ||
    hasFlag('head') ||
    hasFlag('uncommitted') ||
    hasFlag('untracked');

  const active = [];
  if (isAll) active.push('all');
  if (isStaged) active.push('staged');
  if (isFiles) active.push('files');
  if (isPaths) active.push('paths');
  if (isChanged) active.push('changed');

  if (active.length > 1) {
    throw new Error(
      `Conflicting selection flags (${active.join(
        ', ',
      )}). Use only one of: --all | --staged | --files | --paths | --base/--head/--uncommitted/--untracked.`,
    );
  }

  return active[0] ?? 'changed';
}

// `--ignore-path` REPLACES prettier's defaults, so the defaults are named explicitly.
// One argv entry per token: "--ignore-path <path>" as a single string is silently dropped.
const PRETTIER_IGNORE_PATHS = [
  '--ignore-path',
  '.gitignore',
  '--ignore-path',
  '.prettierignore',
  '--ignore-path',
  '.prettieronlyignore',
];

function partition(files) {
  const prettierFiles = files.filter(
    (file) => file.endsWith('.html') && !file.endsWith('.component.html'),
  );
  const oxfmtFiles = files.filter(
    (file) => !file.endsWith('.html') || file.endsWith('.component.html'),
  );
  return { prettierFiles, oxfmtFiles };
}

// Runs prettier and oxfmt, aggregating success so one failure doesn't prevent
// the other from running.
function formatAll(prettierArgs, oxfmtArgs) {
  const flag = action === 'check' ? '--check' : '--write';
  let ok = true;

  if (prettierArgs.length) {
    ok =
      run('yarn', [
        'prettier',
        ...PRETTIER_IGNORE_PATHS,
        flag,
        ...prettierArgs,
      ]) && ok;
  }
  if (oxfmtArgs.length) {
    // Don't fail when no file is oxfmt-formattable (e.g. only images/lockfiles); match nx's no-op.
    ok =
      run('yarn', [
        'oxfmt',
        '--no-error-on-unmatched-pattern',
        flag,
        ...oxfmtArgs,
      ]) && ok;
  }

  return ok;
}

// Formats an explicit list of files via partition (prettier/oxfmt split).
function formatFileList(files) {
  if (files.length === 0) {
    console.log('No files to format.');
    process.exit(0);
  }
  const { prettierFiles, oxfmtFiles } = partition(files);
  const ok = formatAll(prettierFiles, oxfmtFiles);
  process.exit(ok ? 0 : 1);
}

assertKnownFlags();

const mode = resolveMode();

// "all": format the whole tree. prettier/oxfmt apply their own ignore configs
// (.prettierignore / oxfmtrc), so no extra gitignore filtering is needed here.
if (mode === 'all') {
  const ok = formatAll(['**/*.html', '!**/*.component.html'], ['.']);
  process.exit(ok ? 0 : 1);
}

// "paths": explicit files, directories, and/or globs (gitignored files dropped).
if (mode === 'paths') {
  const files = resolvePaths(parseCSV(readFlag('paths')));
  formatFileList(files);
}

// "files": literal files only (nx-faithful, no dir/glob expansion).
if (mode === 'files') {
  const files = parseCSV(readFlag('files')).filter((f) => existsSync(f));
  formatFileList(files);
}

// "staged": files staged in the index.
if (mode === 'staged') {
  const files = gitCapture([
    'diff',
    '--name-only',
    '--no-renames',
    '--relative',
    '--cached',
  ]).filter((f) => existsSync(f));
  formatFileList(files);
}

// "changed" (explicit base/head/uncommitted/untracked, or bare default).
formatFileList(getChangedFiles());
