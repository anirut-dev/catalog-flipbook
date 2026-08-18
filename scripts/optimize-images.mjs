// Phase 1 — optimize catalog pages: JPG -> WebP, resize, rename to page-NNN.webp
// Run once:  npm install  &&  npm run plan  (check order)  &&  npm run optimize
//
// Output:
//   pages/page-001.webp         display size (~1000px wide) - used by the flipbook
//   pages/zoom/page-001.webp    zoom size (~1785px wide)    - loaded only on zoom
//   pages/thumbs/page-001.webp  thumbnail (160px wide)      - the page picker drawer
//   pages/manifest.json         page count + printed page labels (see labelFor)

import { readdir, mkdir, stat, writeFile } from "node:fs/promises";
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
const OUT_THUMB = path.join(ROOT, "pages", "thumbs");
const MANIFEST = path.join(ROOT, "pages", "manifest.json");

const SIZES = [
  { dir: OUT_DISPLAY, width: 1000, quality: 80, label: "display" },
  { dir: OUT_ZOOM, width: 1785, quality: 82, label: "zoom" },
  { dir: OUT_THUMB, width: 160, quality: 70, label: "thumb" },
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
 * The number printed inside the artwork is NOT the position of the file.
 * The catalog has 6 unnumbered front-matter pages, so file 150 carries "144" on it.
 * Luckily the source filename already holds the printed number:
 *   "1-01.jpg"          -> printed "1"
 *   "144-01.jpg"        -> printed "144"
 *   "0.2 ประวัติ-01.jpg" -> front matter, named "ประวัติ", no printed number
 * The manifest records this so the UI can talk in printed numbers, which is what a
 * customer actually sees on the page.
 */
function labelFor(filename) {
  const frontMatter = filename.match(/^0\.\d+\s+(.+?)-\d+\.jpe?g$/i);
  if (frontMatter) return { label: frontMatter[1].trim(), printed: false };

  const numbered = filename.match(/^(\d+)\D/);
  if (numbered) return { label: numbered[1], printed: true };

  return { label: null, printed: false };
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
    // The label comes from the ORIGINAL filename even when an override replaces the
    // artwork - a corrected page still carries the same printed number.
    const { label, printed } = labelFor(entry.file);
    return {
      src: override ?? path.join(SRC_DIR, entry.file),
      srcName: override ? `${path.basename(override)} (override)` : entry.file,
      isOverride: Boolean(override),
      page,
      label,
      printed,
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

async function writeManifest(jobs) {
  const manifest = {
    totalPages: jobs.length,
    pages: jobs.map((job) => ({ index: job.page, label: job.label, printed: job.printed })),
  };
  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
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
      console.log(
        job ? `  ${job.out}  <-  ${job.srcName}   [${job.label ?? "?"}]` : "  ..."
      );
    }
    console.log("\nIf the order looks right, run: npm run optimize");
    return;
  }

  for (const size of SIZES) {
    await mkdir(size.dir, { recursive: true });
  }

  const startedAt = Date.now();
  let skipped = 0;
  for (const job of jobs) {
    const written = await convert(job);
    if (written === 0) skipped++;
    const tag = written === 0 ? "skip" : "ok  ";
    process.stdout.write(`\r[${job.page}/${jobs.length}] ${tag} ${job.out}   `);
  }

  const manifest = await writeManifest(jobs);

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(0);
  console.log(`\n\nDone in ${seconds}s (${skipped} already existed - use --force to redo)`);
  console.log(`  pages/         ${await dirSizeMB(OUT_DISPLAY)} MB`);
  console.log(`  pages/zoom/    ${await dirSizeMB(OUT_ZOOM)} MB`);
  console.log(`  pages/thumbs/  ${await dirSizeMB(OUT_THUMB)} MB`);
  console.log(`  manifest.json  ${manifest.totalPages} pages`);
}

main().catch((err) => {
  console.error(`\nFAILED: ${err.message}`);
  process.exit(1);
});
