# Dotcraft

A web editor for designing styled QR codes — custom dot styles, droplet
(teardrop) corner indicators, colors, and a center logo with aspect-preserving
framing. QR codes are rendered from a raw QR matrix to SVG entirely client-side,
which gives full control over the eye shapes (including the droplet) and clean
PNG/SVG export.

The library works without an account (it is saved in your browser). With a free
account, it is backed up and synced across your devices automatically.

## Repository layout

- `frontend/` — Vite + React + TypeScript SPA (Bun, Biome, Vitest)
- `backend/` — Django + Django REST Framework API (uv, Ruff, ty, pytest)
- `compose.yaml` — the local dev stack (Postgres, Mailpit, backend, frontend)
- `tox.ini` — one entry point for the dev stack and every check
- `vercel.json` — Vercel Services: the SPA at `/`, the API at `/api/*`

## Develop

Requirements: Docker, [uv](https://docs.astral.sh/uv/), tox and
[Bun](https://bun.sh).

```bash
tox -e dev      # start the stack: http://localhost:5173
tox -e seed     # add demo users (user1@dotcraft.local / password) and libraries
tox             # lint, type-check and test backend + frontend
tox -e down     # stop the stack
```

- Frontend: http://localhost:5173
- API: http://localhost:5173/api/v1/ (proxied to the backend on :8000)
- Django admin: http://localhost:5173/api/admin/
- Mailpit (password-reset e-mails): http://localhost:8025

See [`CLAUDE.md`](./CLAUDE.md) for per-side commands and conventions.

## Deploy (Vercel)

A single Vercel project deploys both services from the repository root. The
backend needs a Postgres database (`DATABASE_URL`), a private Blob store
(`BLOB_READ_WRITE_TOKEN`), and the variables listed in
[`backend/.env.example`](./backend/.env.example) — including
`DJANGO_ADMIN_PATH`, which is mandatory outside development.

## Features

- **Dot styles**: square, gapped, rounded, circle, dots
- **Eye styles**: square, rounded, circle, **droplet** (rendered with a custom
  per-corner path so exactly one corner points toward the center)
- **Colors**: foreground, background, adjustable quiet-zone margin
- **Logo**: PNG / JPG / SVG, aspect ratio preserved, with background color,
  padding, and rounded corners; error correction is forced to `H` when a logo is set
- **Export**: PNG (512 / 1024 / 2048px) and self-contained SVG
- **Library**: projects, folders, drag-and-drop, `.dotcraft` import/export
- **Accounts & cloud sync**: e-mail/password accounts, automatic background
  sync (last write wins), password reset by e-mail
