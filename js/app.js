// Sangudom Catalog Flipbook
// Phase 2 — StPageFlip page turning + a simple lazy-load window.
// Phase 3 will add zoom (pages/zoom/), thumbnails, and preload tuning.

const TOTAL_PAGES = 232;

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
};

function pageSrc(pageNumber) {
  return `pages/page-${String(pageNumber).padStart(3, "0")}.webp`;
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
  el.input.value = String(current);
  el.prev.disabled = current <= 1;
  el.next.disabled = current >= TOTAL_PAGES;
  updateLoadedImages(current);
}

function init() {
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

  el.total.textContent = `/ ${pageFlip.getPageCount()}`;
  el.input.max = String(pageFlip.getPageCount());
  el.loading.hidden = true;
  document.body.classList.add("is-ready");

  pageFlip.on("flip", () => syncControls(pageFlip));
  pageFlip.on("changeState", (e) => {
    document.body.classList.toggle("is-flipping", e.data === "flipping");
  });

  el.prev.addEventListener("click", () => pageFlip.flipPrev());
  el.next.addEventListener("click", () => pageFlip.flipNext());

  el.pager.addEventListener("submit", (event) => {
    event.preventDefault();
    const wanted = Number(el.input.value);
    if (Number.isInteger(wanted) && wanted >= 1 && wanted <= TOTAL_PAGES) {
      pageFlip.turnToPage(wanted - 1);
      syncControls(pageFlip);
    }
    el.input.blur();
  });

  document.addEventListener("keydown", (event) => {
    if (event.target === el.input) return; // typing a page number, not navigating
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

init();
