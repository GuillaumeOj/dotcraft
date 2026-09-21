# CLAUDE.md

Guidance for Claude Code (and other AI agents) working in this repository.

## Project overview

**Dotcraft** is a QR-code editor. It lets you design styled QR codes (custom
dot styles, droplet/teardrop eye shapes, colors, and a center logo), export to
PNG/SVG, and manage a saved library with folders, projects, and drag-and-drop.
QR codes render client-side (built from a raw QR matrix to SVG) and the library
lives in the browser (IndexedDB). Signing in is optional: an account backs the
library up in the cloud and syncs it across devices automatically.

The repo is a monorepo, deployed as **one Vercel project using Services**
(`vercel.json` at the root):

- `frontend/` — the Vite + React SPA, served at `/`.
- `backend/` — the Django + DRF API, served at `/api/*`.

## Stack

**Frontend** (`frontend/`)

- **Language:** TypeScript 5.6 (strict mode)
- **UI:** React 18.3, `react-router-dom`, `react-i18next`
- **Build tool:** Vite 5.4
- **Lint + format:** Biome 2.4
- **Tests:** Vitest 4.1 (jsdom environment, v8 coverage)
- **Key libs:** `qrcode` (matrix generation), `lucide-react` (icons)
- **Package manager:** **Bun** — `bun.lock` is committed and CI runs
  `bun install --frozen-lockfile`. Use Bun locally to stay consistent.

**Backend** (`backend/`)

- **Language:** Python 3.13
- **Framework:** Django 6.1 + Django REST Framework, `djangorestframework-simplejwt`
- **Database:** PostgreSQL (docker locally, Neon via the Vercel Marketplace)
- **Storage:** private Vercel Blob for logos (filesystem locally)
- **E-mail:** Brevo via `django-anymail` (Mailpit locally)
- **Lint + format + imports:** Ruff — **Type check:** ty
- **Tests:** pytest + pytest-django + pytest-cov
- **Package manager:** **uv** — `uv.lock` is committed and CI runs
  `uv sync --locked`.

## Commands

The whole stack runs through **tox** (from the repo root):

```sh
tox -e dev              # start db, mailpit, backend and frontend in docker
tox -e seed             # seed the running stack with users and libraries
tox -e down             # stop the stack
tox                     # run every check CI runs (backend + frontend)
tox -e backend-lint     # ruff check + ruff format --check
tox -e backend-types    # ty check
tox -e backend-test     # pytest with the 90% coverage gate (needs `docker compose up -d db`)
tox -e frontend         # typecheck + Biome + Vitest with coverage
```

Dev stack URLs: frontend http://localhost:5173 (proxies `/api` to the backend),
backend http://localhost:8000, admin http://localhost:5173/api/admin/,
Mailpit http://localhost:8025. Seeded accounts: `user1@dotcraft.local` …
`userN@dotcraft.local` and `admin@dotcraft.local` (superuser), password
`password`. Host ports can be changed with `DB_PORT`, `BACKEND_PORT`,
`FRONTEND_PORT`, `MAILPIT_UI_PORT`, `MAILPIT_SMTP_PORT`.

Frontend only (`cd frontend`):

```sh
bun install
bun run dev                 # dev server at http://localhost:5173
bun run build               # tsc -b && vite build
bun run typecheck           # tsc -b
bun run check               # Biome lint + format check
bun run check:fix           # Biome autofix
bun run test                # run tests once
bun run test:coverage       # tests with coverage report (90% gate)
```

Backend only (`cd backend`):

```sh
uv sync
uv run python manage.py migrate
uv run python manage.py runserver
uv run python manage.py seed [--users N] [--flush]   # DEBUG only
uv run ruff check . && uv run ruff format --check .
uv run ty check
uv run pytest --cov
```

## Architecture

### Frontend (`frontend/src/`)

- `qr/` — framework-agnostic QR logic: rendering (`render.ts`), corner path
  math (`paths.ts`), export (`export.ts`), color (`color.ts`), persistence
  (`storage.ts`, IndexedDB + sync bookkeeping), and hooks (`useLibrary.ts`).
  Put new pure logic here.
- `api/` — the API client (`client.ts`: in-memory access token, refresh on
  401, typed `ApiError`) and endpoint wrappers (`auth.ts`, `library.ts`).
- `auth/` — `AuthProvider` / `useAuth` (session state) and `errors.ts`
  (API error codes → translated messages).
- `sync/` — `engine.ts` (framework-agnostic push/pull, last-write-wins) and
  `SyncProvider` (background scheduling, `useSync`, `useRemoteChanges`).
- `components/` — React UI: `Controls.tsx`, `Preview.tsx`, `Sidebar.tsx`,
  `AccountButton.tsx`, `fields.tsx`, `forms.tsx`. Put new UI here.
- `pages/` — the routed pages: `EditorPage.tsx` (`/`), `FaqPage.tsx` (`/faq`),
  `HelpCenterPage.tsx` (`/help-center`), `AccountPage.tsx` (`/account`),
  `ForgotPasswordPage.tsx` (`/forgot-password`) and `ResetPasswordPage.tsx`
  (`/reset-password/:uid/:token`). `App.tsx` is just the shell (`<Routes>` +
  shared `Footer`); `main.tsx` mounts `AuthProvider` and `SyncProvider`.
  Deep links rely on the frontend service's SPA rewrite in `vercel.json`.
- `test/` — Vitest setup and shared test utilities: `renderWithRouter` (router
  plus fake auth/sync contexts), `providers.tsx` (`fakeAuth`, `fakeSync`,
  `emitRemoteChanges`), `db.ts` (`resetDb`).

**How sync works.** Every tracked local write (`saveFolder`, `saveDocument`,
deletes, logos, synced prefs) records an entry in the IndexedDB `outbox`;
deletes also leave a tombstone. While signed in, `SyncProvider` pushes the
outbox and pulls changes since the stored cursor (on sign-in, ~2 s after a
change, on focus/online, every 60 s). Writes that apply cloud changes pass
`{ track: false }`. Conflicts: the newer `updatedAt` wins. On first sign-in the
local library is merged into the account; sign-out wipes the device copy.

### Backend (`backend/`)

- `config/` — env-driven settings (`settings.py`, `env.py`), test settings,
  URLs, WSGI entrypoint.
- `core/` — `UUIDModel` (abstract UUID primary key), the API error format
  (`exceptions.py`), `request_user`, and the `seed` management command.
- `accounts/` — the e-mail-based `User`, auth endpoints (register, login,
  refresh cookie, logout, password reset, e-mail/password change) and the
  transactional e-mails (`emails.py` + `templates/emails/<name>/`).
- `library/` — `Folder`, `Document`, `UserSettings`; the sync logic (`sync.py`),
  its endpoint, logo endpoints, and the private Blob storage (`storage.py`).

API: `/api/v1/…`; admin at `/api/<DJANGO_ADMIN_PATH>/`; health at
`/api/health/`. See `backend/.env.example` for every environment variable.

## Conventions

- **Always cover new features with tests.** Tests are co-located with the code
  they cover (`*.test.ts(x)` in the frontend, `<app>/tests/test_*.py` in the
  backend). Coverage thresholds are 90% on both sides and are enforced in CI —
  keep them green.
- **Before considering work done,** run `tox` (or the per-side commands
  above). This mirrors `.github/workflows/ci.yml`.
- **Fix lint and type errors at the source** (Biome, Ruff, ty). Always find a
  real solution rather than suppressing the diagnostic. Do not add
  `biome-ignore`, `noqa` or `ty: ignore` comments unless there is a genuine,
  justified reason, stated next to the suppression.
- **Every Django model uses a UUID primary key** — inherit from
  `core.models.UUIDModel`. Library records reuse the client-generated ids.
- **Keep e-mail templates in the repo.** Each lives in
  `backend/accounts/templates/emails/<name>/` as `subject.txt`, `body.txt` and
  `body.html`; Brevo only delivers them.
- **Never return records of another user.** Scope every query by owner.
- **Translate every user-facing string.** The UI is internationalized with
  react-i18next; catalogs live in `frontend/src/i18n/resources/<locale>.json`.
  Never hardcode display text in components — add a key to `en.json` (the typed
  source of truth) and reference it via `t(...)`. Whenever you add a key, add it
  to **every** locale file (`en`, `fr`, `es`, `de`, `it`, `pt`); a missing key is
  a `tsc` error. New API error codes need an `apiErrors.*` key too.
- **Review changed translations per language.** When a `/simplify` (or
  `/code-review`) pass touches any `frontend/src/i18n/resources/*.json` catalog,
  launch one review sub-agent per **non-English** locale (`fr`, `es`, `de`,
  `it`, `pt`) in parallel, each comparing its file against `en.json` for
  accuracy, naturalness, placeholder integrity (`{{name}}`, `{{px}}`, …), and
  consistency. Skip this when no catalog changed.
- **Keep the Help Center and FAQ in sync with the product.** Whenever you add or
  change a user-facing feature, update the in-app docs so they don't drift:
  revise the relevant Help Center article (`frontend/src/pages/HelpCenterPage.tsx`
  and the `helpCenter.*` keys) and/or FAQ entry (`frontend/src/pages/FaqPage.tsx`
  and the `faq.*` keys), across **every** locale. If a control gains a Help
  Center article, add an `<InfoLink>` (`frontend/src/components/InfoLink.tsx`)
  pointing to its anchor. When unsure whether a change is user-visible enough to
  document, surface it rather than silently skip it.

## Deployment

One Vercel project, root directory = repo root. `vercel.json` defines the
`frontend` and `backend` services and routes `/api/*` to the backend. The
backend's `pyproject.toml` sets the WSGI entrypoint and runs `migrate` on every
build (Vercel runs `collectstatic` itself). Preview and production need:
`DATABASE_URL` (Neon, with preview branching), `BLOB_READ_WRITE_TOKEN`,
`DJANGO_SECRET_KEY`, `DJANGO_ADMIN_PATH` (required when `DJANGO_DEBUG` is off),
`DJANGO_ALLOWED_HOSTS`, `FRONTEND_URL`, `BREVO_API_KEY`, `DEFAULT_FROM_EMAIL`.

## Worktrees

Create new git worktrees under `.claude/worktrees/`, e.g.:

```sh
git worktree add .claude/worktrees/<name>
```

That directory is gitignored, so worktrees never get committed.
