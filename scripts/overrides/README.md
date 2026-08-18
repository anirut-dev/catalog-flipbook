# Page overrides

Drop a file named `page-NNN.<ext>` here to replace what the catalog scan says for that page.
`optimize-images.mjs` uses an override in place of the original source image, so the fix
survives `npm run optimize --force` instead of being silently overwritten.

Supported extensions: `.png`, `.jpg`, `.jpeg`, `.webp`

| Page | File | Why |
|------|------|-----|
| 003 | `page-003.png` | Branch map redrawn: the printed catalog says 29 สาขา, but the company now has 8. |
