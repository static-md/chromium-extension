import type { BackgroundMessage, FullPageLayout, Region, TileReply } from '../shared/types';

/**
 * Full-page capture, run inside the tab: scroll one screen at a time and ask
 * the background worker to capture each view, then hand it the layout to
 * stitch. Uses only the activeTab grant from the click, so the extension still
 * needs no access to the sites you visit.
 */

/** Longer pages stop here: the stitched image has to fit in one canvas */
export const MAX_CSS_HEIGHT = 30000;

/** While capturing: no scrollbars or smooth scrolling in the shots, no snapping between screens */
const CAPTURE_CSS = `
html, html * {
  scrollbar-width: none !important;
  scroll-behavior: auto !important;
  scroll-snap-type: none !important;
  cursor: progress !important;
}
html::-webkit-scrollbar, html *::-webkit-scrollbar {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}`;

type Scroller = {
  region: () => Region;
  height: () => number;
  top: () => number;
  scrollTo: (y: number) => void;
};

/** A fixed element and the screens it shows on: headers on the first, cookie bars on the last */
type Pinned = { el: HTMLElement; showOn: 'first' | 'last' | 'none' };

class Cancelled extends Error {}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** One painted frame, or a short wait when the tab doesn't paint (minimised window) */
const frame = () =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 100);
    requestAnimationFrame(() => {
      clearTimeout(timer);
      resolve();
    });
  });

/** Sets inline !important values and returns how to put the old ones back */
function override(el: HTMLElement, props: Record<string, string>): () => void {
  const saved = Object.keys(props).map(
    (p) => [p, el.style.getPropertyValue(p), el.style.getPropertyPriority(p)] as const,
  );
  for (const [p, v] of Object.entries(props)) el.style.setProperty(p, v, 'important');
  return () => {
    for (const [p, v, priority] of saved) {
      if (v) el.style.setProperty(p, v, priority);
      else el.style.removeProperty(p);
    }
  };
}

function viewportSize() {
  const root = document.documentElement;
  return {
    w: root.clientWidth || window.innerWidth,
    h: document.compatMode === 'CSS1Compat' ? root.clientHeight : window.innerHeight,
  };
}

function pageScrolls(): boolean {
  const root = document.scrollingElement ?? document.documentElement;
  if (root.scrollHeight <= window.innerHeight + 1) return false;
  const html = getComputedStyle(document.documentElement).overflowY;
  const body = document.body ? getComputedStyle(document.body).overflowY : 'visible';
  // The body's overflow applies to the page when the html element leaves it visible
  const page = html !== 'visible' ? html : body;
  return page !== 'hidden' && page !== 'clip';
}

function windowScroller(): Scroller {
  const root = document.scrollingElement ?? document.documentElement;
  return {
    region: () => ({ x: 0, y: 0, ...viewportSize() }),
    height: () => Math.max(root.scrollHeight, document.body?.scrollHeight ?? 0),
    top: () => window.scrollY,
    scrollTo: (y) => window.scrollTo({ left: window.scrollX, top: y, behavior: 'instant' }),
  };
}

/** Web apps that keep the page still and scroll a box inside it (mail, docs, chats) */
function elementScroller(el: HTMLElement): Scroller {
  return {
    region: () => {
      const r = el.getBoundingClientRect();
      const x = Math.max(0, r.left + el.clientLeft);
      const y = Math.max(0, r.top + el.clientTop);
      return {
        x,
        y,
        w: Math.min(r.left + el.clientLeft + el.clientWidth, window.innerWidth) - x,
        h: Math.min(r.top + el.clientTop + el.clientHeight, window.innerHeight) - y,
      };
    },
    height: () => el.scrollHeight,
    top: () => el.scrollTop,
    scrollTo: (y) => el.scrollTo({ top: y, behavior: 'instant' }),
  };
}

function scanPage(findScroller: boolean) {
  const sticky: HTMLElement[] = [];
  const fixed: HTMLElement[] = [];
  let scroller: HTMLElement | null = null;
  let scrollerArea = 0;
  const { w: vw, h: vh } = viewportSize();
  const all = document.body ? [document.body, ...document.body.getElementsByTagName('*')] : [];
  for (const el of all) {
    if (!(el instanceof HTMLElement)) continue;
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed') fixed.push(el);
    else if (cs.position === 'sticky') sticky.push(el);
    if (!findScroller) continue;
    const oy = cs.overflowY;
    if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollHeight > el.clientHeight + 1) {
      const r = el.getBoundingClientRect();
      const area = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)) *
        Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
      // Only a box that is most of what you see, not a dropdown or a code block
      if (area >= vw * vh * 0.3 && area > scrollerArea) {
        scroller = el;
        scrollerArea = area;
      }
    }
  }
  return { sticky, fixed, scroller };
}

function classifyFixed(fixed: HTMLElement[]): Pinned[] {
  const { w: vw, h: vh } = viewportSize();
  const pinned: Pinned[] = [];
  for (const el of fixed) {
    const r = el.getBoundingClientRect();
    // Full-screen backdrops and app shells stay on every screen
    if (r.width >= vw * 0.9 && r.height >= vh * 0.9) continue;
    const visible = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh;
    pinned.push({
      el,
      showOn: !visible ? 'none' : r.top + r.height / 2 < vh / 2 ? 'first' : 'last',
    });
  }
  return pinned;
}

/** Lazy images that came into view get a moment to load */
async function imagesInView(region: Region) {
  const loading = [...document.images].filter((img) => {
    if (img.complete) return false;
    const r = img.getBoundingClientRect();
    return r.bottom > region.y && r.top < region.y + region.h && r.width > 0;
  });
  if (!loading.length) return;
  await Promise.race([
    Promise.all(
      loading.map(
        (img) =>
          new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          }),
      ),
    ),
    sleep(1500),
  ]);
}

export async function captureFullPage(): Promise<void> {
  const send = (msg: BackgroundMessage) => chrome.runtime.sendMessage(msg);
  const undo: Array<() => void> = [];
  let cancelled = false;

  // Your scrolling would move the page under the capture: wheel and keys wait, Esc cancels
  const block = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') cancelled = true;
    block(e);
  };
  window.addEventListener('wheel', block, { capture: true, passive: false });
  window.addEventListener('touchmove', block, { capture: true, passive: false });
  window.addEventListener('keydown', onKey, true);
  undo.push(() => {
    window.removeEventListener('wheel', block, true);
    window.removeEventListener('touchmove', block, true);
    window.removeEventListener('keydown', onKey, true);
  });

  const startX = window.scrollX;
  const startY = window.scrollY;
  undo.push(() => window.scrollTo({ left: startX, top: startY, behavior: 'instant' }));

  const style = document.createElement('style');
  style.setAttribute('data-staticshot', '');
  style.textContent = CAPTURE_CSS;
  document.documentElement.appendChild(style);
  undo.push(() => style.remove());

  try {
    await send({ type: 'FULL_PAGE_START' });
    await frame();
    await frame();

    const usePage = pageScrolls();
    const { sticky, fixed, scroller: box } = scanPage(!usePage);
    const scroller = usePage || !box ? windowScroller() : elementScroller(box);
    if (box && !usePage) {
      const boxTop = box.scrollTop;
      undo.push(() => box.scrollTo({ top: boxTop, behavior: 'instant' }));
    }

    // Sticky bars sit where they belong in the page instead of following each screen
    for (const el of sticky) {
      undo.push(override(el, { position: 'relative', top: 'auto', bottom: 'auto' }));
    }
    const pinned = classifyFixed(fixed);
    // No fades while bars come and go between screens; put back after their opacity is
    const transitions = pinned.map(({ el }) => override(el, { transition: 'none' }));
    const opacities = new Map<HTMLElement, () => void>();
    undo.push(() => {
      for (const put of opacities.values()) put();
      void document.documentElement.offsetHeight;
      for (const put of transitions) put();
    });
    const showPinned = (first: boolean, last: boolean) => {
      for (const { el, showOn } of pinned) {
        const show = (showOn === 'first' && first) || (showOn === 'last' && last);
        const hidden = opacities.get(el);
        if (show && hidden) {
          hidden();
          opacities.delete(el);
        } else if (!show && !hidden) {
          opacities.set(el, override(el, { opacity: '0' }));
        }
      }
    };

    const region = scroller.region();
    const step = region.h;
    let y = 0;
    let index = 0;
    let prevAt = -1;
    let covered = 0;
    for (;;) {
      if (cancelled) throw new Cancelled();
      scroller.scrollTo(y);
      await frame();
      await frame();
      await imagesInView(region);
      const at = scroller.top();
      // Scrolling stopped moving: the previous screen was the last one
      if (index > 0 && at <= prevAt) break;
      const total = Math.min(scroller.height(), MAX_CSS_HEIGHT);
      const last = at + step >= total - 1;
      showPinned(index === 0, last);
      await frame();
      if (cancelled) throw new Cancelled();
      const reply = (await send({
        type: 'FULL_PAGE_TILE',
        y: at,
        progress: Math.min(1, (at + step) / Math.max(total, 1)),
      })) as TileReply | undefined;
      if (!reply?.ok) throw new Error(reply?.reason ?? 'capture failed');
      covered = at + step;
      if (last) break;
      prevAt = at;
      y = at + step;
      index++;
    }

    const layout: FullPageLayout = {
      viewportWidth: window.innerWidth,
      region,
      totalHeight: Math.min(covered, MAX_CSS_HEIGHT),
    };
    // Put the page back before the editor opens
    while (undo.length) undo.pop()?.();
    await send({ type: 'FULL_PAGE_FINISH', layout });
  } catch (err) {
    if (!(err instanceof Cancelled)) console.error('[StaticShot] full-page capture failed:', err);
    while (undo.length) undo.pop()?.();
    await send({ type: 'FULL_PAGE_CANCEL' }).catch(() => {});
  }
}
