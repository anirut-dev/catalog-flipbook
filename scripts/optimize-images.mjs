// Phase 1 — optimize catalog pages: JPG -> WebP, resize, rename to page-NNN.webp
// Run once:  npm install  &&  npm run plan  (check order)  &&  npm run optimize
//
// Output:
//   pages/page-001.webp        display size (~1000px wide) - used by the flipbook
//   pages/zoom/page-001.webp   zoom size (~1785px wide)    - loaded only on zoom

import { readdir, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Source images live OUTSIDE the repo (332MB of JPG - never commit them).
const SRC_DIR = path.resolve(ROOT, "..", "catalog", "แยกแต่ละหน้า");
const OVERRIDES_DIR = path.join(__dirname, "overrides");
const OVERRIDE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];
const OUT_DISPLAY = path.join(ROOT, "pages");
const OUT_ZOOM = path.join(ROOT, "pages", "zoom");

const SIZES = [
  { dir: OUT_DISPLAY, width: 1000, quality: 80, label: "display" },
  { dir: OUT_ZOOM, width: 1785, quality: 82, label: "zoom" },
];

const EXPECTED_PAGES = 232;

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const FORCE = args.has("--force");

/**
 * Every source filename starts with its page number:
 *   "0.1 ปก-01.jpg"                 -> 0.1
 *   "10-01.jpg"                     -> 10
 *   "224. Company Profile10-01.jpg" -> 224   (NOT 10 - only the leading number counts)
 * Sorting by that number puts front matter first, then the body in true page order.
 */
function pageNumberOf(filename) {
  const match = filename.match(/^(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function padded(n) {
  return String(n).padStart(3, "0");
}

/**
 * A page can be corrected by dropping `overrides/page-NNN.<ext>` in this folder.
 * Without this, re-running the script would quietly restore the outdated original.
 */
function findOverride(page) {
  for (const ext of OVERRIDE_EXTENSIONS) {
    const candidate = path.join(OVERRIDES_DIR, `page-${padded(page)}${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

async function collectSources() {
  const entries = await readdir(SRC_DIR);
  const jpgs = entries.filter((f) => /\.jpe?g$/i.test(f));

  const unparsed = jpgs.filter((f) => pageNumberOf(f) === null);
  if (unparsed.length) {
    throw new Error(
      `These filenames do not start with a page number, so their order is unknown:\n  ${unparsed.join("\n  ")}`
    );
  }

  const sorted = jpgs
    .map((file) => ({ file, num: pageNumberOf(file) }))
    .sort((a, b) => a.num - b.num);

  // Two files claiming the same number would silently overwrite each other.
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].num === sorted[i - 1].num) {
      throw new Error(
        `Duplicate page number ${sorted[i].num}:\n  ${sorted[i - 1].file}\n  ${sorted[i].file}`
      );
    }
  }

  return sorted.map((entry, index) => {
    const page = index + 1; // position in the sorted list = final page number
    const override = findOverride(page);
    return {
      src: override ?? path.join(SRC_DIR, entry.file),
      srcName: override ? `${path.basename(override)} (override)` : entry.file,
      isOverride: Boolean(override),
      page,
      out: `page-${padded(page)}.webp`,
    };
  });
}

async function convert(job) {
  let written = 0;
  for (const size of SIZES) {
    const dest = path.join(size.dir, job.out);
    if (!FORCE && existsSync(dest)) continue; // resumable: skip what is already done
    await sharp(job.src)
      .resize({ width: size.width, withoutEnlargement: true })
      .webp({ quality: size.quality })
      .toFile(dest);
    written++;
  }
  return written;
}

async function dirSizeMB(dir) {
  const files = await readdir(dir);
  let bytes = 0;
  for (const f of files) {
    const s = await stat(path.join(dir, f));
    if (s.isFile()) bytes += s.size;
  }
  return (bytes / 1024 / 1024).toFixed(1);
}

async function main() {
  if (!existsSync(SRC_DIR)) {
    throw new Error(`Source folder not found:\n  ${SRC_DIR}`);
  }

  const jobs = await collectSources();
  const overrides = jobs.filter((job) => job.isOverride);
  console.log(`Found ${jobs.length} source images (expected ${EXPECTED_PAGES})`);
  if (overrides.length) {
    console.log(`Using ${overrides.length} override(s): ${overrides.map((j) => j.out).join(", ")}`);
  }
  if (jobs.length !== EXPECTED_PAGES) {
    console.warn(`WARNING: count is not ${EXPECTED_PAGES}. Check the source folder before continuing.`);
  }

  if (DRY_RUN) {
    console.log("\nDry run - nothing written. Mapping (first 10, last 10):\n");
    const show = [...jobs.slice(0, 10), null, ...jobs.slice(-10)];
    for (const job of show) {
      console.log(job ? `  ${job.out}  <-  ${job.srcName}` : "  ...");
    }
    console.log("\nIf the order looks right, run: npm run optimize");
    return;
  }

  await mkdir(OUT_DISPLAY, { recursive: true });
  await mkdir(OUT_ZOOM, { recursive: true });

  const startedAt = Date.now();
  let skipped = 0;
  for (const job of jobs) {
    const written = await convert(job);
    if (written === 0) skipped++;
    const tag = written === 0 ? "skip" : "ok  ";
    process.stdout.write(`\r[${job.page}/${jobs.length}] ${tag} ${job.out}   `);
  }

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(0);
  console.log(`\n\nDone in ${seconds}s (${skipped} already existed - use --force to redo)`);
  console.log(`  pages/       ${await dirSizeMB(OUT_DISPLAY)} MB`);
  console.log(`  pages/zoom/  ${await dirSizeMB(OUT_ZOOM)} MB`);
}

main().catch((err) => {
  console.error(`\nFAILED: ${err.message}`);
  process.exit(1);
});
