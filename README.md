# oxfmt-nx-demo — `oxfmt-associations` branch

**You are on the "after the after" branch.** oxfmt is the only formatter, `nx format` is
back in charge, and the routing script is gone. The two branches before this one:

- [`main`](https://github.com/push-based/oxfmt-nx-demo) — the "before" state, Prettier over
  everything.
- [`oxfmt-hybrid`](https://github.com/push-based/oxfmt-nx-demo/tree/oxfmt-hybrid) — the
  hybrid the case study describes: oxfmt for 99% of files, Prettier kept for the Angular
  templates oxfmt could not parse, a custom router in between.

```bash
git diff oxfmt-hybrid oxfmt-associations   # what it takes to drop Prettier, as one diff
```

Verified against **oxfmt 0.74.0** and **Nx 23.2.1**. oxfmt is pre-1.0 and moving fast, so
check the pinned version in `package.json` before trusting a detail.

## What changed upstream

The case study ended on an open issue:
[oxc-project/oxc#17852](https://github.com/oxc-project/oxc/issues/17852), parser overrides.
oxfmt picked its HTML parser from the filename, so an Angular template not named
`*.component.html` was parsed as plain HTML, and there was no way to tell it otherwise.
That one gap is why Prettier stayed in the tree and why the hybrid needed a router.

It closed on 2026-10-11 and shipped in **oxfmt 0.73.0** as an `associations` config: map a
glob to a language, and oxfmt formats matching files as that language instead of guessing
from the filename. It is the equivalent of Prettier's `overrides[].options.parser`, and it
is the whole reason this branch exists.

## The setup, in one file

[`.oxfmtrc.json`](.oxfmtrc.json):

```json
"associations": [
  {
    "files": ["**/*.html"],
    "excludeFiles": ["**/index.html", "**/public/**", "**/templates/**"],
    "language": "angular-html"
  }
]
```

Every `.html` file is an Angular template unless it is the app shell, a static public
asset, or an email template — the same `excludeFiles` list the old `.prettierrc` carried,
because those files really are plain HTML. `language` takes a
[Shiki id](https://shiki.style/languages), so it is `angular-html`, not `angular`. When a file
matches more than one association, the later entry wins.

With that in place:

- `ignorePatterns: ["*.html", "!*.component.html"]` is gone — nothing needs handing back.
- `.prettierrc`, `.prettierignore`, `.prettieronlyignore` are gone. The one rule in
  `.prettierignore` that `.gitignore` did not already cover (`.yarn/releases`) moved to
  `ignorePatterns`.
- `tools/scripts/format/` is gone. `yarn format`, `yarn format:check` and `yarn format:write`
  are `nx format:write`, `nx format:check --all` and `nx format:write --all`.
- The pre-commit hook calls `oxfmt --write` on the staged files directly.
- `prettier` and `eslint-config-prettier` left `package.json`.

```bash
yarn install
yarn format:check          # nx format:check --all
yarn format:write          # nx format:write --all
yarn format                # nx format:write — changed vs base, the everyday one
```

## The repro, inverted

On `oxfmt-hybrid` the README shows `nx format:check --all` exiting 0 on an unformatted
non-component template, because oxfmt skipped the file and nothing else picked it up. Same
commands here, opposite result:

```bash
printf '<div>\n@if (x) {   <p>hi</p>   }\n</div>\n' >> apps/shop/src/app/app.html
npx nx format:check --all; echo "exit $?"     # exit 1 — oxfmt parsed it as Angular
git checkout -- apps/shop/src/app/app.html
```

`nx format` detects oxfmt from `.oxfmtrc.json` (Nx 23.2+), passes it the file list, and
`associations` decides the parser. One formatter, Nx's own file selection, no script.

## What happened to the three traps

| Trap on `oxfmt-hybrid`                                                         | Here                                                                                                                             |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Ignore conflict — oxfmt reads `.prettierignore` too                            | Moot: there is one tool and one ignore config.                                                                                   |
| Import sorting — `partitionByComment`, and specifiers that oxfmt does not sort | Unchanged. `sortImports` and the ESLint `sort-imports` rule in [`eslint.config.mjs`](eslint.config.mjs) carry over as they were. |
| Replacing `nx format`                                                          | Moot: `nx format` runs oxfmt natively and owns file selection again.                                                             |

## No churn commit this time

Swapping Prettier for oxfmt on `oxfmt-hybrid` reformatted five files. Dropping Prettier here
reformatted none: `yarn format:check` passes on the tree as the hybrid left it. The Angular
templates that move from Prettier to oxfmt's `angular-html` come out byte-identical, and so
do the three plain-HTML files under `excludeFiles`. The only diff on this branch is
configuration and the deletions.

## Scope and honesty

- The case study's numbers were measured on the hybrid, with oxfmt 0.55.0, on a
  ~68,500-file workspace. Nothing on this branch was re-benchmarked. The hybrid's
  whole-workspace check was 17.8 s, of which 6.74 s was Prettier's 599 files; dropping
  Prettier removes that tail and the `nx` orchestration changes with it, so the number
  will move — in which direction and by how much is a measurement, not an inference.
- `associations` is a week-old feature at the time of writing. The `excludeFiles` globs and
  the `angular-html` id were verified against 0.74.0; check the
  [config guide](https://oxc.rs/docs/guide/usage/formatter/config.html) before copying.
- Inline `template:` strings in components are still formatted by nobody. That was true
  with Prettier too.

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
