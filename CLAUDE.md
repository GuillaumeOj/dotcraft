# CLAUDE.md

Guidance for Claude Code (and other AI agents) working in this repository.

## Project overview

**Dotcraft** is a browser-only QR-code editor. It lets you design styled QR codes
(custom dot styles, droplet/teardrop eye shapes, colors, and a center logo), export
to PNG/SVG, and manage a saved library with folders, projects, and drag-and-drop.
Everything renders client-side — QR codes are built from a raw QR matrix to SVG —
and the app deploys to Vercel as a static site (no server).

## Stack

- **Language:** TypeScript 5.6 (strict mode)
- **UI:** React 18.3
- **Build tool:** Vite 5.4
- **Lint + format:** Biome 2.4
- **Tests:** Vitest 4.1 (jsdom environment, v8 coverage)
- **Key libs:** `qrcode` (matrix generation), `lucide-react` (icons)
- **Package manager:** **Bun** — `bun.lock` is committed and CI runs
  `bun install --frozen-lockfile`. Use Bun locally to stay consistent.

## Commands

```sh
bun install                 # install dependencies
bun run dev                 # dev server at http://localhost:5173
bun run build               # tsc -b && vite build
bun run typecheck           # tsc -b
bun run check               # Biome lint + format check
bun run check:fix           # Biome autofix
bun run test                # run tests once
bun run test:watch          # tests in watch mode
bun run test:coverage       # tests with coverage report
```

## Architecture

- `src/qr/` — framework-agnostic QR logic: rendering (`render.ts`), corner path
  math (`paths.ts`), export (`export.ts`), color (`color.ts`), persistence
  (`storage.ts`), and hooks (`useLibrary.ts`). Put new pure logic here.
- `src/components/` — React UI: `Controls.tsx`, `Preview.tsx`, `Sidebar.tsx`,
  `fields.tsx`. Put new UI here.
- `src/pages/` — the routed pages (`react-router-dom`): `EditorPage.tsx` (the
  editor, at `/`), `FaqPage.tsx` (`/faq`) and `HelpCenterPage.tsx`
  (`/help-center`). `App.tsx` is just the shell (`<Routes>` + shared `Footer`).
  Static deep links (`/faq`, `/help-center`) rely on the SPA rewrite in
  `vercel.json`.
- `src/test/` — Vitest setup and shared test utilities (e.g. `renderWithRouter`
  in `router.tsx`, needed for any component that renders a react-router `<Link>`).

## Conventions

- **Always cover new features with tests.** Tests are co-located with the code
  they cover and named `*.test.ts` / `*.test.tsx`. Coverage thresholds are 90%
  (lines / functions / branches / statements) and are enforced — keep them green.
- **Before considering work done,** run `bun run typecheck`, `bun run check`, and
  `bun run test`. This mirrors `.github/workflows/ci.yml`.
- **Fix Biome errors and warnings at the source.** Always find a real solution
  rather than suppressing the diagnostic. Do not add `biome-ignore` comments or
  disable rules unless there is a genuine, justified reason.
- **Translate every user-facing string.** The UI is internationalized with
  react-i18next; catalogs live in `src/i18n/resources/<locale>.json`. Never
  hardcode display text in components — add a key to `en.json` (the typed source
  of truth) and reference it via `t(...)`. Whenever you add a key, add it to
  **every** locale file (`en`, `fr`, `es`, `de`, `it`, `pt`); a missing key is a
  `tsc` error.
- **Review changed translations per language.** When a `/simplify` (or
  `/code-review`) pass touches any `src/i18n/resources/*.json` catalog, launch
  one review sub-agent per **non-English** locale (`fr`, `es`, `de`, `it`, `pt`)
  in parallel, each comparing its file against `en.json` for accuracy,
  naturalness, placeholder integrity (`{{name}}`, `{{px}}`, …), and consistency.
  Skip this when no catalog changed.
- **Keep the Help Center and FAQ in sync with the product.** Whenever you add or
  change a user-facing feature, update the in-app docs so they don't drift:
  revise the relevant Help Center article (`src/pages/HelpCenterPage.tsx` and the
  `helpCenter.*` keys) and/or FAQ entry (`src/pages/FaqPage.tsx` and the `faq.*`
  keys), across **every** locale. If a control gains a Help Center article, add
  an `<InfoLink>` (`src/components/InfoLink.tsx`) pointing to its anchor. When
  unsure whether a change is user-visible enough to document, surface it rather
  than silently skip it.

## Worktrees

Create new git worktrees under `.claude/worktrees/`, e.g.:

```sh
git worktree add .claude/worktrees/<name>
```

That directory is gitignored, so worktrees never get committed.
