# format

Runs `prettier` + `oxfmt` over a selected set of files. `.html` (non `*.component.html`) goes to prettier, everything else goes to oxfmt. Each tool still applies its own ignore config (`.prettierignore`, `.oxfmtrc.json`).

```bash
yarn format <check|write> [selection flags]
```

- `check` — fail if any file is not formatted (CI).
- `write` — format files in place.

## Selecting files

Pick **one** strategy. With no flag it defaults to **changed**.

| Flag          | What it formats                                    |
| ------------- | -------------------------------------------------- |
| _(none)_      | Changed vs base ref + uncommitted + untracked      |
| `--all`       | The whole repo                                     |
| `--staged`    | Files staged in git (`git add`)                    |
| `--files=a,b` | Exact files only (no dir/glob expansion)           |
| `--paths=a,b` | Files, directories, and globs (gitignored dropped) |

Changed-mode refinements (combine freely): `--base=<ref>`, `--head=<ref>`, `--uncommitted`, `--untracked`. Base defaults to `NX_BASE` → `nx.json` `defaultBase` (`origin/main`).

## Examples

```bash
# Format everything you've changed on your branch (the everyday fix)
yarn format write

# CI check across a commit range
yarn format check --base=$NX_BASE --head=$CI_COMMIT_SHA

# Format only staged files (used by the pre-commit hook)
yarn format write --staged

# Format the whole repo
yarn format write --all

# Format specific files
yarn format write --files=apps/shop/src/app/app.ts,apps/shop/src/app/app.html

# Format a folder or glob
yarn format write --paths=packages/shop/data,"apps/shop/**/*.scss"

# Check a range, fall back to formatting if it fails
yarn format check || yarn format write
```
