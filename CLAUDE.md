# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Static flipbook website for the Sangudom Lighting Centre 2021 product catalog (232 pages).
Plain HTML/CSS/JS (no framework, no build step) + [StPageFlip](https://github.com/Nodlik/StPageFlip), deployed on Vercel.
UI language is Thai (`<html lang="th">`), and README/comments are written in Thai.

## Commands

There is no build, no test suite, and no `package.json` at the project root — the site is served as static files.

- Local preview: `npx serve .` or `python -m http.server 8000`, then open the printed URL.
  Opening `index.html` via `file://` will break `fetch`/image loading later, so use a local server.
- Deploy: `npx vercel` (preview) / `npx vercel --prod` (production).
- Image optimization (Phase 1) lives in `scripts/` and is a **one-time run**, not part of the site build.
  If a `package.json` is added there for `sharp`, keep it inside `scripts/` so the site root stays dependency-free.

## Architecture

```
index.html      single page; loads css/style.css and js/app.js
css/style.css   all styles
js/app.js       flipbook init (StPageFlip) + lazy loading + controls
lib/            vendored StPageFlip files (committed, no CDN)
pages/          optimized page images, committed to the repo
scripts/        one-off image optimization script (not shipped to the browser)
```

Key design decisions that span files:

- **Two image sizes per page.** `pages/` holds a display size (~1000px wide, ~120KB) used by the flipbook,
  and a zoom size (~1785px, original width) loaded only when the user zooms. `js/app.js` must swap the
  `src` on zoom rather than loading the large image up front.
- **Lazy loading is mandatory, not an optimization.** 232 pages must never be requested at once.
  Load the current spread plus a small preload window ahead/behind.
- **Page naming is the contract between `scripts/` and `js/app.js`.** Optimized files are
  `page-001.webp` … `page-232.webp` (zero-padded to 3 digits), so page numbers can be built by
  string formatting instead of a manifest.
- **Source images are outside the repo** at `../catalog/แยกแต่ละหน้า/` (332MB of JPG, ~1785x2552).
  Never commit them. `pages-raw/` is gitignored to catch accidental copies.

### Source filename ordering (important)

Original filenames are Thai text with spaces and unpadded numbers, e.g. `0.1 ปก-01.jpg`,
`0.6 สารบัญ-01.jpg`, `1-01.jpg`, `10-01.jpg`. Plain alphabetical sort is wrong (`10` comes before `2`).
Any renaming script must sort by the **numeric prefix**: `0.x` front-matter files first in their `0.x`
order, then `1..N` sorted numerically. Verify the resulting order against the actual catalog before
overwriting `pages/`.

## Phases

Work is tracked as phases in `README.md`. Update the checkboxes there when a phase completes.
Phase 0 = project scaffold + git, Phase 1 = image optimization, Phase 2 = StPageFlip page turning,
Phase 3 = lazy load + controls (next/prev, zoom, thumbnails, mobile), Phase 4 = Vercel deploy.

## Working with this user

Git/`gh` commands are given to the user one step at a time to type themselves — do not run them.
Editing code and files directly is fine. See the global `~/.claude/CLAUDE.md` for details.
