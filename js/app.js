// Sangudom Catalog Flipbook
// Phase 3 — StPageFlip page turning, lazy loading, zoom overlay, page picker.

// Filled in from pages/manifest.json, which the optimizer writes. Never hard-code the
// page count here: merging or dropping a page changes it, and a stale number silently
// breaks the last pages.
let TOTAL_PAGES = 0;

/** index (file position) -> what is printed on that page, e.g. 150 -> "144" */
const labelByIndex = new Map();
/** printed number -> index, so the page box can speak the customer's language */
const indexByPrinted = new Map();

// Source pages are 1785x2552, so one page is 0.699 as wide as it is tall.
// StPageFlip needs a base size; `size: "stretch"` scales it to the screen.
const PAGE_WIDTH = 500;
const PAGE_HEIGHT = 715;

// How many pages on each side of the current one to keep loaded.
// 232 images at once would be 22MB - never do that.
const LOAD_RADIUS = 4;

// Below this viewport width the book shows one page at a time instead of a spread.
const PORTRAIT_BREAKPOINT = 700;

const el = {
  viewer: document.querySelector(".viewer"),
  topbar: document.querySelector(".topbar"),
  controls: document.querySelector(".controls"),
  frame: document.getElementById("book-frame"),
  book: document.getElementById("flipbook"),
  loading: document.getElementById("loading"),
  prev: document.getElementById("btn-prev"),
  next: document.getElementById("btn-next"),
  pager: document.getElementById("pager"),
  input: document.getElementById("page-input"),
  total: document.getElementById("page-total"),

  thumbsBtn: document.getElementById("btn-thumbs"),
  thumbs: document.getElementById("thumbs"),
  thumbsStrip: document.getElementById("thumbs-strip"),
  thumbsClose: document.getElementById("thumbs-close"),

  zoomBtn: document.getElementById("btn-zoom"),
  zoom: document.getElementById("zoom"),
  zoomStage: document.getElementById("zoom-stage"),
  zoomImg: document.getElementById("zoom-img"),
  zoomLevel: document.getElementById("zoom-level"),
  zoomPage: document.getElementById("zoom-page"),
  zoomIn: document.getElementById("zoom-in"),
  zoomOut: document.getElementById("zoom-out"),
  zoomPrev: document.getElementById("zoom-prev"),
  zoomNext: document.getElementById("zoom-next"),
  zoomClose: document.getElementById("zoom-close"),
};

async function loadManifest() {
  const response = await fetch("pages/manifest.json");
  if (!response.ok) throw new Error(`manifest.json returned ${response.status}`);
  const manifest = await response.json();

  TOTAL_PAGES = manifest.totalPages;
  for (const page of manifest.pages) {
    labelByIndex.set(page.index, page.label);
    if (page.printed) indexByPrinted.set(Number(page.label), page.index);
  }
}

/** What the reader sees printed on that page - falls back to the file position. */
function labelOf(index) {
  return labelByIndex.get(index) ?? String(index);
}

/** "144 – 145" for a spread, or just "ปก" for a single page. */
function spreadLabel(current) {
  const left = labelOf(current);
  const right = current < TOTAL_PAGES ? labelOf(current + 1) : null;
  return right ? `${left} – ${right}` : left;
}

function padded(pageNumber) {
  return String(pageNumber).padStart(3, "0");
}

function pageSrc(pageNumber) {
  return `pages/page-${padded(pageNumber)}.webp`;
}

function zoomSrc(pageNumber) {
  return `pages/zoom/page-${padded(pageNumber)}.webp`;
}

function thumbSrc(pageNumber) {
  return `pages/thumbs/page-${padded(pageNumber)}.webp`;
}

/** Build 232 empty page elements. The <img> src stays blank until the page is near. */
function buildPages() {
  const fragment = document.createDocumentFragment();

  for (let page = 1; page <= TOTAL_PAGES; page++) {
    const pageEl = document.createElement("div");
    pageEl.className = "page";
    // showCover: true renders these two as stiff card-like pages.
    pageEl.dataset.density = page === 1 || page === TOTAL_PAGES ? "hard" : "soft";

    const img = document.createElement("img");
    img.className = "page__img";
    img.alt = `หน้า ${page}`;
    img.dataset.page = String(page);
    img.decoding = "async";
    img.draggable = false;

    pageEl.append(img);
    fragment.append(pageEl);
  }

  el.book.append(fragment);
  return el.book.querySelectorAll(".page");
}

/**
 * Load images inside the window around `current`, and drop the ones far away
 * so memory stays flat while the user browses all 232 pages.
 */
function updateLoadedImages(current) {
  const from = Math.max(1, current - LOAD_RADIUS);
  const to = Math.min(TOTAL_PAGES, current + LOAD_RADIUS);

  for (const img of el.book.querySelectorAll(".page__img")) {
    const page = Number(img.dataset.page);
    const shouldLoad = page >= from && page <= to;

    if (shouldLoad && !img.src) {
      img.src = pageSrc(page);
    } else if (!shouldLoad && img.src) {
      img.removeAttribute("src");
    }
  }
}

/**
 * StPageFlip's "stretch" size mode measures the container's WIDTH and derives the
 * height from it - so a tall book happily overflows a short window. We size the
 * container ourselves from the height that is actually free, then let it stretch.
 */
function fitBook(pageFlip) {
  const style = getComputedStyle(el.viewer);
  // Measured from the window, not from .viewer: before loadFromHTML() the 232 raw
  // page divs are still in normal flow, so .viewer would report a huge height.
  const chrome = el.topbar.offsetHeight + el.controls.offsetHeight;
  const availableHeight =
    window.innerHeight - chrome - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const availableWidth =
    document.documentElement.clientWidth -
    parseFloat(style.paddingLeft) -
    parseFloat(style.paddingRight);

  const ratio = PAGE_HEIGHT / PAGE_WIDTH;
  const pagesAcross = window.innerWidth < PORTRAIT_BREAKPOINT ? 1 : 2;

  const widthFromHeight = (availableHeight / ratio) * pagesAcross;
  const width = Math.max(200, Math.min(widthFromHeight, availableWidth));

  // Set it on the wrapper: StPageFlip resets its own container to width:100%.
  el.frame.style.width = `${Math.floor(width)}px`;
  if (pageFlip) pageFlip.update();
}

function syncControls(pageFlip) {
  // StPageFlip counts from 0; humans count from 1.
  const current = pageFlip.getCurrentPageIndex() + 1;
  const label = labelOf(current);

  // Front matter has no printed number, so leave the box empty rather than lie.
  el.input.value = indexByPrinted.has(Number(label)) ? label : "";
  el.total.textContent = spreadLabel(current);

  el.prev.disabled = current <= 1;
  el.next.disabled = current >= TOTAL_PAGES;
  updateLoadedImages(current);
  markCurrentThumb(current);
}

/* ---------------------------------------------------------------- page picker */

let thumbsBuilt = false;

/** Built on first open, not at startup - 232 nodes are wasted work if never used. */
function buildThumbs(pageFlip) {
  if (thumbsBuilt) return;

  const fragment = document.createDocumentFragment();
  for (let page = 1; page <= TOTAL_PAGES; page++) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "thumb";
    button.dataset.page = String(page);

    const img = document.createElement("img");
    img.src = thumbSrc(page);
    img.alt = "";
    img.loading = "lazy"; // the browser fetches these as they scroll into view
    // Reserve the space before the image arrives, so the row never jumps or collapses.
    img.width = 80;
    img.height = 114;

    const label = document.createElement("span");
    label.textContent = labelOf(page);

    button.append(img, label);
    fragment.append(button);
  }

  el.thumbsStrip.append(fragment);
  el.thumbsStrip.addEventListener("click", (event) => {
    const button = event.target.closest(".thumb");
    if (!button) return;
    pageFlip.turnToPage(Number(button.dataset.page) - 1);
    syncControls(pageFlip);
    closeThumbs();
  });

  thumbsBuilt = true;
}

function openThumbs(pageFlip) {
  buildThumbs(pageFlip);
  el.thumbs.hidden = false;
  markCurrentThumb(pageFlip.getCurrentPageIndex() + 1);
}

function closeThumbs() {
  el.thumbs.hidden = true;
}

function markCurrentThumb(current) {
  if (!thumbsBuilt) return;
  for (const button of el.thumbsStrip.children) {
    button.classList.toggle("is-current", Number(button.dataset.page) === current);
  }
  const active = el.thumbsStrip.querySelector(".is-current");
  if (active) active.scrollIntoView({ inline: "center", block: "nearest" });
}

/* ---------------------------------------------------------------------- zoom */

const MIN_SCALE = 1;
const MAX_SCALE = 4;

const zoom = { page: 1, scale: 1, x: 0, y: 0 };
const activePointers = new Map();
let pinchStartDistance = 0;
let pinchStartScale = 1;

function applyZoomTransform() {
  // Keep the image inside the stage: past 1x there is only as much slack as the
  // scaled image overflows by, otherwise it can be dragged off into empty space.
  const stage = el.zoomStage.getBoundingClientRect();
  const slackX = Math.max(0, (el.zoomImg.offsetWidth * zoom.scale - stage.width) / 2);
  const slackY = Math.max(0, (el.zoomImg.offsetHeight * zoom.scale - stage.height) / 2);
  zoom.x = Math.min(slackX, Math.max(-slackX, zoom.x));
  zoom.y = Math.min(slackY, Math.max(-slackY, zoom.y));

  el.zoomImg.style.transform = `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`;
  el.zoomLevel.textContent = `${Math.round(zoom.scale * 100)}%`;
}

function setScale(next) {
  zoom.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
  if (zoom.scale === MIN_SCALE) {
    zoom.x = 0;
    zoom.y = 0;
  }
  applyZoomTransform();
}

function showZoomPage(page) {
  zoom.page = Math.min(TOTAL_PAGES, Math.max(1, page));
  el.zoomImg.src = zoomSrc(zoom.page);
  el.zoomImg.alt = `หน้า ${labelOf(zoom.page)} (ขยาย)`;
  el.zoomPage.textContent = `หน้า ${labelOf(zoom.page)}`;
  el.zoomPrev.disabled = zoom.page <= 1;
  el.zoomNext.disabled = zoom.page >= TOTAL_PAGES;
  setScale(MIN_SCALE);
}

function openZoom(page) {
  el.zoom.hidden = false;
  document.body.classList.add("is-zoomed");
  showZoomPage(page);
}

function closeZoom() {
  el.zoom.hidden = true;
  document.body.classList.remove("is-zoomed");
  el.zoomImg.removeAttribute("src"); // drop the big image from memory
  activePointers.clear();
}

function distanceBetweenPointers() {
  const [a, b] = [...activePointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function wireZoom() {
  el.zoomIn.addEventListener("click", () => setScale(zoom.scale + 0.5));
  el.zoomOut.addEventListener("click", () => setScale(zoom.scale - 0.5));
  el.zoomClose.addEventListener("click", closeZoom);
  el.zoomPrev.addEventListener("click", () => showZoomPage(zoom.page - 1));
  el.zoomNext.addEventListener("click", () => showZoomPage(zoom.page + 1));

  el.zoomImg.addEventListener("dblclick", () => {
    setScale(zoom.scale > MIN_SCALE ? MIN_SCALE : 2);
  });

  el.zoomStage.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      setScale(zoom.scale + (event.deltaY < 0 ? 0.25 : -0.25));
    },
    { passive: false }
  );

  // Pointer events cover mouse, touch and pen with one code path.
  el.zoomStage.addEventListener("pointerdown", (event) => {
    el.zoomStage.setPointerCapture(event.pointerId);
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (activePointers.size === 2) {
      pinchStartDistance = distanceBetweenPointers();
      pinchStartScale = zoom.scale;
    }
  });

  el.zoomStage.addEventListener("pointermove", (event) => {
    const previous = activePointers.get(event.pointerId);
    if (!previous) return;
    const point = { x: event.clientX, y: event.clientY };
    activePointers.set(event.pointerId, point);

    if (activePointers.size === 2 && pinchStartDistance > 0) {
      setScale(pinchStartScale * (distanceBetweenPointers() / pinchStartDistance));
      return;
    }

    if (zoom.scale > MIN_SCALE) {
      zoom.x += point.x - previous.x;
      zoom.y += point.y - previous.y;
      applyZoomTransform();
    }
  });

  for (const type of ["pointerup", "pointercancel", "pointerleave"]) {
    el.zoomStage.addEventListener(type, (event) => {
      activePointers.delete(event.pointerId);
      if (activePointers.size < 2) pinchStartDistance = 0;
    });
  }
}

async function init() {
  await loadManifest();

  const pages = buildPages();

  const pageFlip = new St.PageFlip(el.book, {
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    size: "stretch",
    minWidth: 200,
    maxWidth: 1200,
    minHeight: 286,
    maxHeight: 1716,
    showCover: true,        // page 1 (ปก) stands alone, like a real book
    usePortrait: true,      // one page at a time on phones
    maxShadowOpacity: 0.5,
    mobileScrollSupport: false,
    drawShadow: true,
  });

  // The first pages must exist, and the container must be sized,
  // before StPageFlip measures anything.
  updateLoadedImages(1);
  fitBook(null);
  pageFlip.loadFromHTML(pages);

  const lastPrinted = Math.max(...indexByPrinted.keys());
  el.input.max = String(lastPrinted);
  el.input.placeholder = `1-${lastPrinted}`;
  el.loading.hidden = true;
  document.body.classList.add("is-ready");

  pageFlip.on("flip", () => syncControls(pageFlip));
  pageFlip.on("changeState", (e) => {
    document.body.classList.toggle("is-flipping", e.data === "flipping");
  });

  el.prev.addEventListener("click", () => pageFlip.flipPrev());
  el.next.addEventListener("click", () => pageFlip.flipNext());

  wireZoom();
  el.zoomBtn.addEventListener("click", () => openZoom(pageFlip.getCurrentPageIndex() + 1));
  el.thumbsBtn.addEventListener("click", () => {
    if (el.thumbs.hidden) openThumbs(pageFlip);
    else closeThumbs();
  });
  el.thumbsClose.addEventListener("click", closeThumbs);

  el.pager.addEventListener("submit", (event) => {
    event.preventDefault();
    // The reader types the number printed on the page; look up which file that is.
    const target = indexByPrinted.get(Number(el.input.value));
    if (target) {
      pageFlip.turnToPage(target - 1);
    } else {
      el.input.classList.add("is-invalid");
      setTimeout(() => el.input.classList.remove("is-invalid"), 600);
    }
    syncControls(pageFlip);
    el.input.blur();
  });

  document.addEventListener("keydown", (event) => {
    if (event.target === el.input) return; // typing a page number, not navigating

    if (event.key === "Escape") {
      closeZoom();
      closeThumbs();
      return;
    }

    // While the overlay is open the arrows should move the overlay, not the book.
    if (!el.zoom.hidden) {
      if (event.key === "ArrowLeft") showZoomPage(zoom.page - 1);
      if (event.key === "ArrowRight") showZoomPage(zoom.page + 1);
      return;
    }

    if (event.key === "ArrowLeft") pageFlip.flipPrev();
    if (event.key === "ArrowRight") pageFlip.flipNext();
  });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer); // recalculating on every resize event is wasteful
    resizeTimer = setTimeout(() => fitBook(pageFlip), 120);
  });

  syncControls(pageFlip);
}

init().catch((error) => {
  el.loading.textContent = "โหลดไม่สำเร็จ ลองรีเฟรชหน้าอีกครั้ง";
  console.error("[flipbook] init failed:", error);
});
