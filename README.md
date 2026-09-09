# oxfmt-nx-demo

A small but real Nx + Angular workspace used as the worked example for the case study
**“How We Cut `nx format` from Minutes to Seconds: A Prettier-to-oxfmt Hybrid.”**

The workspace is deliberately boring — two apps, six libraries, Angular signals and
control-flow templates, SCSS, JSON, an Express API. What is interesting is the
formatting setup, and specifically the three places where a Prettier-to-oxfmt
migration does _not_ work by swapping a binary.

## The two branches are the point

| Branch                                                                          | State                                | `yarn format` runs                                      |
| ------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------- |
| `main`                                                                          | **Before** — a mature Prettier setup | Prettier over the whole workspace                       |
| [`oxfmt-hybrid`](https://github.com/push-based/oxfmt-nx-demo/tree/oxfmt-hybrid) | **After** — the hybrid router        | oxfmt for almost everything, Prettier for the remainder |

```bash
git clone https://github.com/push-based/oxfmt-nx-demo.git
cd oxfmt-nx-demo
yarn install

# the before state
yarn format:check

# the after state
git diff main oxfmt-hybrid       # the whole migration as one diff
git switch oxfmt-hybrid
yarn install
yarn format:check
```

If you only want to read the migration, `git diff main oxfmt-hybrid` is the whole thing.

## What `main` looks like

A Prettier setup of the kind most Angular monorepos actually have, not a clean-room default:

- **`.prettierrc`** — `singleQuote`, plus
  [`@ianvs/prettier-plugin-sort-imports`](https://github.com/IanVS/prettier-plugin-sort-imports)
  for import ordering.
- **A `parser: angular` override**, applied by filename pattern — including one template
  that is _not_ named `*.component.html`.
- **`.prettierignore`** — build output, caches, and the vendored ~4.9 MB Yarn CLI in
  `.yarn/releases`.
- **`lefthook.yml`** — a `pre-commit` hook that runs Prettier over staged files.

Every one of those four things is a migration hazard. The `oxfmt-hybrid` branch shows why.

## The three fixtures to look at

These files exist to make the traps reproducible, not to pad the workspace. Each one is
a shape that appears constantly in real Angular repositories.

**1. An Angular template that isn’t named `*.component.html`**
→ [`apps/shop/src/app/app.html`](apps/shop/src/app/app.html)

It uses `@if` control flow and is referenced by `templateUrl: './app.html'`. oxfmt picks
its HTML parser by filename, so it reads this file as plain HTML and leaves the `@if`
body un-indented. Prettier can be told `parser: angular` for any glob; oxfmt cannot yet
([oxc-project/oxc#17852](https://github.com/oxc-project/oxc/issues/17852)). This single
file is the entire reason the hybrid pipeline keeps Prettier around.

**2. A leading `/* eslint-disable */` above the imports**
→ [`packages/shop/data/src/lib/mappers/legacy-price.mapper.ts`](packages/shop/data/src/lib/mappers/legacy-price.mapper.ts)

An import sorter that treats the comment as attached to the import below it will carry
the `eslint-disable` down the file, and every `any` above its new position starts failing
lint. oxfmt’s `sortImports` has a switch for this — and it does not cover every case.

**3. A `/// <reference types="vitest" />` above the imports**
→ [`packages/shop/shared-ui/vite.config.mts`](packages/shop/shared-ui/vite.config.mts)
(and every other `vite.config.mts` in the workspace)

A triple-slash directive is only meaningful at the top of the file. An import sorter that
treats it as a comment attached to the import below will move it, silently dropping the
types it pulls in. oxfmt's `sortImports` has a switch for this — and it does not cover
every comment shape.

## Reproducing the parser difference in ten seconds

No install required:

```bash
mkdir /tmp/parser-demo && cd /tmp/parser-demo
cat > ng.html <<'EOF'
<div [class.active]="isActive">
@if (loading) {   <p>{{ msg }}</p>   }
</div>
EOF
cp ng.html ng.component.html
npx --yes oxfmt@latest ng.html ng.component.html
diff ng.html ng.component.html
```

Same bytes in, two different results out — the `.component.html` file gets the Angular
parser and indents the `@if` body; the other does not.

## Scope and honesty

- The benchmark numbers in the case study (`3m 52s → 18.4s`, 23.5× on the engine) come from
  a **private ~67,800-file monorepo**, not from this demo. This workspace is far too small
  to reproduce them; it exists to make the _mechanism_ inspectable.
- oxfmt is pre-1.0 and moving fast. Behaviour described here was verified against
  **oxfmt 0.67.0**. Check the version pinned in `package.json` before trusting a detail.
- Two upstream changes would shrink this setup considerably:
  [Nx #35089](https://github.com/nrwl/nx/pull/35089) (native oxfmt support in `nx format`)
  and [oxc #17852](https://github.com/oxc-project/oxc/issues/17852) (parser overrides).

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

Standard Nx commands all work: `npx nx run shop:serve`, `npx nx run-many -t test lint build`,
`npx nx graph`.

## License

MIT
