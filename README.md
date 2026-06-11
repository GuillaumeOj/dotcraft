# Dotcraft

A browser-based editor for designing styled QR codes — custom dot styles, droplet
(teardrop) corner indicators, colors, and a center logo with aspect-preserving
framing. Built with Vite + React + TypeScript and deployable to Vercel as a static
site. The QR codes are rendered from a raw QR matrix to SVG entirely client-side,
which gives full control over the eye shapes (including the droplet) and clean
PNG/SVG export.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build to dist/
npm run preview  # serve the production build
```

## Deploy (Vercel)

Vercel auto-detects Vite. Build command `npm run build`, output directory `dist`.
No server or environment variables required.

## Features

- **Dot styles**: square, gapped, rounded, circle, dots
- **Eye styles**: square, rounded, circle, **droplet** (rendered with a custom
  per-corner path so exactly one corner points toward the center)
- **Colors**: foreground, background, adjustable quiet-zone margin
- **Logo**: PNG / JPG / SVG, aspect ratio preserved, with background color,
  padding, and rounded corners; error correction is forced to `H` when a logo is set
- **Export**: PNG (512 / 1024 / 2048px) and self-contained SVG

## Structure

- `src/qr/` — framework-agnostic renderer: `matrix → SVG` (`render.ts`), corner
  path math (`paths.ts`), types/defaults (`types.ts`), and export helpers (`export.ts`)
- `src/components/` — the React editor UI (`Controls`, `Preview`, `fields`)

## Legacy

The original Python CLI implementation is archived under [`python/`](./python).
