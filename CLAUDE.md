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
pages/          optimized display images (page-001.webp …), committed
pages/zoom/     full-size images for zoom, committed
scripts/        one-off image optimization script (not shipped to the browser)
```

Key design decisions that span files:

- **Two image sizes per page.** `pages/page-NNN.webp` is the display size (1000px wide, ~96KB avg) used by
  the flipbook; `pages/zoom/page-NNN.webp` is the full size (1785px, ~250KB) loaded only when the user zooms.
  `js/app.js` must swap the `src` on zoom rather than loading the large image up front.
  Totals: 22.3MB display + 58.2MB zoom (from 332MB of source JPG).
- **Lazy loading is mandatory, not an optimization.** 232 pages must never be requested at once.
  Load the current spread plus a small preload window ahead/behind.
- **Page naming is the contract between `scripts/` and `js/app.js`.** Optimized files are
  `page-001.webp` … `page-232.webp` (zero-padded to 3 digits), so page numbers can be built by
  string formatting instead of a manifest.
- **Source images are outside the repo** at `../catalog/แยกแต่ละหน้า/` (332MB of JPG, ~1785x2552).
  Never commit them. `pages-raw/` is gitignored to catch accidental copies.

### Source filename ordering (important)

Source filenames come in three shapes, and every one starts with its page number:
`0.1 ปก-01.jpg` … `0.6 สารบัญ-01.jpg` (6 front-matter pages), `1-01.jpg` … `214-01.jpg` plus `226-01.jpg`
(back cover), and `215. Company Profile1-01.jpg` … `225. Company Profile11-01.jpg` (11 pages).
`scripts/optimize-images.mjs` sorts by that **leading number only** — `224. Company Profile10` must sort
by `224`, not by the trailing `10`, and plain alphabetical sort is wrong everywhere (`10` before `2`).
Rerun `npm run plan` in `scripts/` to re-check the mapping before regenerating `pages/`.

## Phases

Work is tracked as phases in `README.md`. Update the checkboxes there when a phase completes.
Phase 0 = project scaffold + git, Phase 1 = image optimization, Phase 2 = StPageFlip page turning,
Phase 3 = lazy load + controls (next/prev, zoom, thumbnails, mobile), Phase 4 = Vercel deploy.

## Working with this user

Git/`gh` commands are given to the user one step at a time to type themselves — do not run them.
Editing code and files directly is fine. See the global `~/.claude/CLAUDE.md` for details.
