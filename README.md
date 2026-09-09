# oxfmt-nx-demo — `oxfmt-hybrid` branch

**You are on the “after” branch.** `yarn format` here routes files between oxfmt and
Prettier instead of running Prettier over everything.
[`main`](https://github.com/push-based/oxfmt-nx-demo) is the “before” state.

```bash
git diff main oxfmt-hybrid          # the entire migration, as one diff
```

This is the worked example for the case study **“How We Cut `nx format` from Minutes to
Seconds: A Prettier-to-oxfmt Hybrid.”** Verified against **oxfmt 0.67.0** — it is pre-1.0
and moving fast, so check the pinned version in `package.json` before trusting a detail.

## The setup, in four files

| File                                                                 | Job                                                                                                   |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [`.oxfmtrc.json`](.oxfmtrc.json)                                     | oxfmt's config: print width, import sorting, and the `ignorePatterns` that hand HTML back to Prettier |
| [`.prettieronlyignore`](.prettieronlyignore)                         | Ignore rules for Prettier alone — because oxfmt reads `.prettierignore` too                           |
| [`.prettierrc`](.prettierrc)                                         | Shrunk to a `parser: angular` override; the import-sorting plugin is gone                             |
| [`tools/scripts/format/format.mjs`](tools/scripts/format/format.mjs) | The router: resolves _which_ files to format, then splits them between Prettier and oxfmt             |

This is the script the case study's numbers were measured with, lifted from the large
Angular workspace it runs in and changed only by reflow under this repo's narrower
`printWidth`. Its CLI is therefore the benchmarked CLI: an action plus one selection flag.
See [`tools/scripts/format/README.md`](tools/scripts/format/README.md) for the full table.

```bash
yarn install

yarn format write --all         # whole workspace, in place
yarn format check --all         # whole workspace, non-zero exit on drift
yarn format write              # just what you changed vs the base ref (the everyday one)
yarn format write --staged     # what the pre-commit hook runs
yarn format check --files=a.ts,b.html
yarn format check --paths=packages/shop/data,"apps/shop/**/*.scss"
```

`yarn format:check` / `yarn format:write` are kept as aliases for the `--all` pair, because
that is what CI calls.

The selection layer is the part a whole-workspace `oxfmt . && prettier .` cannot give you.
`--paths` expands directories and globs and then drops anything git ignores; the default
mode reconstructs Nx's changed-file set (merge-base against `nx.json`'s `defaultBase`, plus
uncommitted, plus untracked). That is what makes the check cheap enough to run per commit
rather than per pipeline.

## The routing rule

One line, in three places that have to agree:

> Angular component templates (`*.component.html`) and all non-HTML source → **oxfmt**.
> Every other `.html` → **Prettier**.

- `partition()` in `format.mjs` applies it to a resolved file list (`--files`, `--paths`,
  `--staged`, changed-mode).
- `ignorePatterns: ["*.html", "!*.component.html"]` in `.oxfmtrc.json` applies it to
  `--all`, where oxfmt is handed the bare directory `.`.
- `.prettieronlyignore` applies the inverse to a standalone `yarn format:prettier`.

Three files is one more than anyone wants. It is the price of two tools with independent
file discovery.

Note which mechanism actually does the work: in every mode except `--all`, routing happens
in `partition()` and each formatter is handed an explicit file list, so neither tool's
ignore file is consulted for the split at all. `--all` is the only mode that leans on the
config files. That is worth knowing before you go hunting in `.prettieronlyignore` for why
a file went to the wrong formatter.

Prettier's side needs one more declaration: which of the `.html` files it receives are
Angular templates. `.prettierrc` does that by path — `apps/**/*.html` and
`packages/**/*.html`, minus an `excludeFiles` list for genuinely static markup
(`index.html`, `public/`, email templates). Prettier gives you the control oxfmt lacks;
you still have to use it, and a template that lands outside those globs gets the plain
HTML parser with no warning.

## The three traps, with repros

Each is reproducible in a scratch directory in under a minute. No clone required.

### 1. oxfmt picks its HTML parser by filename

This is the reason Prettier is still in the dependency tree.

```bash
mkdir /tmp/t1 && cd /tmp/t1
cat > ng.html <<'EOF'
<div [class.active]="isActive">
@if (loading) {   <p>{{ msg }}</p>   }
</div>
EOF
cp ng.html ng.component.html
npx --yes oxfmt@0.67.0 ng.html ng.component.html
diff ng.html ng.component.html
```

```
  <p>{{ msg }}</p>        # ng.html           — parsed as plain HTML, block flattened
    <p>{{ msg }}</p>      # ng.component.html — parsed as Angular, block indented
```

Same bytes in, different bytes out. In a template named `*.component.html` oxfmt indents
the `@if` body; in any other `.html` it treats the block as text and flattens it. Prettier
can be told `parser: angular` for an arbitrary glob — oxfmt cannot yet
([oxc-project/oxc#17852](https://github.com/oxc-project/oxc/issues/17852)).

In this workspace the file that trips it is
[`apps/shop/src/app/app.html`](apps/shop/src/app/app.html) — an Angular template with
`@if`, wired up by `templateUrl: './app.html'`, and therefore not named `.component.html`.
Real repositories are full of these.

### 2. Import sorting moves comments that must not move

`.oxfmtrc.json` sets `sortImports`, oxfmt's native replacement for
`@ianvs/prettier-plugin-sort-imports` (which oxfmt cannot load — it is a Prettier plugin).
Sorting imports moves the comments attached to them, and two comment shapes break when they
move: `/// <reference …>` directives are only meaningful at the top of a file, and
`/* eslint-disable … */` only covers what follows it.

```bash
mkdir /tmp/t2 && cd /tmp/t2
cat > cfg.mts <<'EOF'
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';
export default defineConfig({});
EOF
echo '{"sortImports":{}}' > .oxfmtrc.json
npx --yes oxfmt@0.67.0 cfg.mts && cat cfg.mts
```

```
import angular from "@analogjs/vite-plugin-angular";
/// <reference types="vitest" />        <- no longer line 1; the types are silently gone
import { defineConfig } from "vite";
```

`partitionByComment: true` fixes it — a comment becomes a partition boundary, so the
directive stays put and the imports sort below it:

```bash
echo '{"sortImports":{"partitionByComment":true}}' > .oxfmtrc.json
npx --yes oxfmt@0.67.0 cfg.mts && cat cfg.mts
```

**It does not fix everything.** A _block_ comment sitting directly on top of an import
still travels with it, even with the switch on:

```
import angular from "@analogjs/vite-plugin-angular";
/* eslint-disable @typescript-eslint/no-explicit-any */   <- moved down
import { z } from "zod";
```

The fix is a blank line, which detaches the comment from the import below it. That is why
[`legacy-price.mapper.ts`](packages/shop/data/src/lib/mappers/legacy-price.mapper.ts) has
one, and why that blank line is load-bearing rather than cosmetic. Worth a lint rule or a
grep in CI if your repo has many file-level `eslint-disable` blocks.

### 3. `internalPattern` takes prefixes, not regexes

`sortImports.internalPattern` is what separates your workspace packages from third-party
ones. The documented default (`["~/", "@/", "#"]`) looks regex-ish enough that writing
`"^@org/"` feels right. It matches nothing, silently, and your own packages get sorted in
among the npm ones:

```
"^@org/"  ->  @org/* lands in the "external" group, alphabetically before express
"@org/"   ->  @org/* becomes its own group, after external      <- what you want
```

No error, no warning — just an import order that quietly stops matching your convention.

## What the two ignore files are actually for

oxfmt reads `.prettierignore` as well as `.gitignore`
([docs](https://oxc.rs/docs/guide/usage/formatter/ignore-files.html)). That is convenient
right up to the moment you want a rule for _one_ of the two tools: `.prettierignore` is now
shared, so anything you add there disappears from both.

Hence two ignore files with different scopes:

- **`.prettierignore`** — shared. Build output, caches, the vendored ~4.9 MB Yarn CLI in
  `.yarn/releases`. Both formatters skip all of it.
- **`.prettieronlyignore`** — Prettier only, handed over with `--ignore-path`. It lists the
  extensions oxfmt owns, which is what stops `yarn format:prettier` from reformatting 98%
  of the workspace behind oxfmt's back.

One trap in wiring that up: `--ignore-path` **replaces** Prettier's defaults (`.gitignore` +
`.prettierignore`) rather than adding to them. Name only `.prettieronlyignore` and Prettier
stops skipping build output. So `format.mjs` passes all three explicitly:

```js
const PRETTIER_IGNORE_PATHS = [
  '--ignore-path',
  '.gitignore',
  '--ignore-path',
  '.prettierignore',
  '--ignore-path',
  '.prettieronlyignore',
];
```

That keeps the split additive — shared exclusions stay in `.prettierignore`, and
`.prettieronlyignore` holds only the rules oxfmt must not see. In the monorepo this was
originally written as one string, `'--ignore-path .prettieronlyignore'`, which Prettier
discards with a `[warn]` and exit code 0 — so the prettier-only rules had never once
loaded. Nothing broke, because `partition()` was already routing correctly; the file was
simply decorative. Worth knowing that a formatter will take an ignore file it never reads
and say almost nothing about it.

One more asymmetry worth knowing: oxfmt walks **nested `.gitignore`** files the way Git
does; Prettier only consults the root ignore file. At case-study scale that difference alone
removed ~1,060 files from the formatting workload — build output and vendored code Prettier
had been reformatting for years because it sat behind a `.gitignore` deeper in the tree.
Worth checking for on any repo big enough to have grown nested ignore files.

## Expect a one-time churn commit

Swapping engines reformats code, even with `printWidth` matched to Prettier's. In this
small workspace it comes to five files, all the same shape — oxfmt drops the blank line
that separated side-effect imports from the rest:

```diff
 import '@angular/compiler';
 import '@analogjs/vitest-angular/setup-zone';
-
 import { getTestBed } from '@angular/core/testing';
```

Not wrong, just not Prettier. Land it as its own commit — that is what the second commit
on this branch is — so `git blame` on those files stays readable.

A larger repo will turn up more shapes than one. Both formatters are also pinned to exact
versions here (`prettier` 3.9.6, `oxfmt` 0.67.0) rather than carets, because a caret range
makes the churn a moving target: Prettier 3.9 changed how it breaks long generic type
arguments, in a way that happens to match oxfmt, so the same migration produces a
different diff depending on which patch release you installed.

## Scope and honesty

- The benchmark numbers in the case study (`3m 52s → 18.4s`, 23.5× on the engine) were
  measured on a **~67,800-file Angular workspace**, not on this demo. This one formats in
  about a second either way; it exists to make the _mechanism_ inspectable, not the speedup.
- `format.mjs` here is that workspace's script, so the commands above are the benchmarked
  commands. The **versions differ**: the benchmarks ran on **oxfmt 0.55.0**, this repo pins
  **0.67.0**. Twelve minor releases of a pre-1.0 formatter is not a no-op — treat the
  timings as belonging to 0.55.0 and the behaviour described here as belonging to 0.67.0.
- `oxfmt --migrate=prettier` generates a starting `.oxfmtrc.json` from an existing Prettier
  config. It gets you the format options, not the routing.
- Two upstream changes would collapse most of this setup:
  [Nx #35089](https://github.com/nrwl/nx/pull/35089) (native oxfmt support in `nx format`)
  and [oxc #17852](https://github.com/oxc-project/oxc/issues/17852) (parser overrides —
  which would delete trap 1, and with it the need for Prettier at all).

## The Nx workspace itself

```
apps/
  shop/        Angular storefront (signals, control-flow templates)
  shop-e2e/    Playwright tests
  api/         Express API
packages/
  shop/feature-products, shop/feature-product-detail, shop/data, shop/shared-ui
  api/products
  shared/models
```

Standard Nx commands all work: `npx nx run shop:serve`,
`npx nx run-many -t test lint build`, `npx nx graph`.

## License

MIT
