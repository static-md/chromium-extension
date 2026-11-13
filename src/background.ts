import cropScript from './content/crop.ts?script';
import { savePending } from './shared/pendingStore';
import type { BackgroundMessage, FullPageLayout, PendingImage, TileReply } from './shared/types';

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || tab.windowId === undefined) return;
  let captureDataUrl: string;
  try {
    captureDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'png',
    });
  } catch (err) {
    console.error('[StaticShot] capture failed:', err);
    return;
  }
  try {
    // The overlay is injected on each click, under activeTab. The guard inside
    // crop.ts keeps its listener from registering twice on a second click.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: [cropScript],
    });
    await chrome.tabs.sendMessage(tab.id, {
      type: 'START_CROP',
      captureDataUrl,
    } satisfies BackgroundMessage);
  } catch (err) {
    // Restricted URLs (chrome://, the Web Store, view-source:, etc.) reject
    // script injection. Fall back to sending the full viewport straight to
    // the editor — same outcome as the user pressing Space on the overlay.
    console.warn('[StaticShot] crop overlay unavailable, using full viewport:', err);
    await openEditorWithFullViewport(captureDataUrl);
  }
});

async function openEditor(image: PendingImage) {
  await savePending(image);
  await chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
}

async function openEditorWithFullViewport(captureDataUrl: string) {
  try {
    const bitmap = await createImageBitmap(await (await fetch(captureDataUrl)).blob());
    const image: PendingImage = {
      dataUrl: captureDataUrl,
      width: bitmap.width,
      height: bitmap.height,
      createdAt: Date.now(),
    };
    bitmap.close?.();
    await openEditor(image);
  } catch (err) {
    console.error('[StaticShot] failed to open editor with full viewport:', err);
  }
}

// ---- Full page: the tab scrolls, this worker captures each screen and stitches them

type Tile = { y: number; dataUrl: string };
type FullPageRun = { windowId: number; tiles: Tile[] };

const runs = new Map<number, FullPageRun>();

/** Chrome allows two captureVisibleTab calls a second */
const CAPTURE_GAP_MS = 550;
let lastCaptureAt = 0;

/** One canvas holds at most this many pixels here; past it the image is scaled down */
const MAX_PIXELS = 80_000_000;
const MAX_SIDE = 32_767;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function captureNow(windowId: number): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const wait = lastCaptureAt + CAPTURE_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCaptureAt = Date.now();
    try {
      return await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
    } catch (err) {
      const quota = String(err).includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND');
      if (!quota || attempt >= 2) throw err;
    }
  }
}

function setProgress(tabId: number, progress: number | null) {
  const text = progress === null ? '' : `${Math.min(99, Math.round(progress * 100))}%`;
  void chrome.action.setBadgeText({ tabId, text }).catch(() => {});
  if (progress !== null) {
    void chrome.action.setBadgeBackgroundColor({ tabId, color: '#0b63c5' }).catch(() => {});
  }
}

async function captureTile(tabId: number, y: number, progress: number): Promise<TileReply> {
  const run = runs.get(tabId);
  if (!run) return { ok: false, reason: 'no capture in progress' };
  // captureVisibleTab shoots whatever tab is in front: stop if you switched away
  const tab = await chrome.tabs.get(tabId);
  if (!tab.active) return { ok: false, reason: 'the tab is no longer in front' };
  run.tiles.push({ y, dataUrl: await captureNow(run.windowId) });
  setProgress(tabId, progress);
  return { ok: true };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function stitch(tiles: Tile[], layout: FullPageLayout): Promise<PendingImage> {
  const { region, totalHeight } = layout;
  const bitmaps = await Promise.all(
    tiles.map(async (t) => createImageBitmap(await (await fetch(t.dataUrl)).blob())),
  );
  try {
    // Device pixels per CSS pixel, from the shot itself (covers Retina and page zoom)
    const shotScale = bitmaps[0].width / layout.viewportWidth;
    const scale = Math.min(
      shotScale,
      MAX_SIDE / totalHeight,
      MAX_SIDE / region.w,
      Math.sqrt(MAX_PIXELS / (region.w * totalHeight)),
    );
    const canvas = new OffscreenCanvas(
      Math.round(region.w * scale),
      Math.round(totalHeight * scale),
    );
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    ctx.imageSmoothingQuality = 'high';
    tiles.forEach((tile, i) => {
      ctx.drawImage(
        bitmaps[i],
        region.x * shotScale,
        region.y * shotScale,
        region.w * shotScale,
        region.h * shotScale,
        0,
        Math.round(tile.y * scale),
        Math.round(region.w * scale),
        Math.round(region.h * scale),
      );
    });
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return {
      dataUrl: await blobToDataUrl(blob),
      width: region.w,
      height: totalHeight,
      createdAt: Date.now(),
    };
  } finally {
    bitmaps.forEach((b) => b.close?.());
  }
}

async function finishFullPage(tabId: number, layout: FullPageLayout) {
  const run = runs.get(tabId);
  runs.delete(tabId);
  try {
    if (!run?.tiles.length) throw new Error('no screens were captured');
    await openEditor(await stitch(run.tiles, layout));
  } finally {
    setProgress(tabId, null);
  }
}

chrome.tabs.onRemoved.addListener((tabId) => runs.delete(tabId));

chrome.runtime.onMessage.addListener((msg: BackgroundMessage, sender, sendResponse) => {
  if (msg.type === 'CROP_COMPLETE') {
    (async () => {
      try {
        await openEditor(msg.image);
        sendResponse({ ok: true });
      } catch (err) {
        console.error('[StaticShot] failed to open editor:', err);
        sendResponse({ ok: false });
      }
    })();
    return true; // keep the channel open for the async response
  }

  const tabId = sender.tab?.id;
  const windowId = sender.tab?.windowId;
  if (tabId === undefined || windowId === undefined) return false;

  switch (msg.type) {
    case 'FULL_PAGE_START':
      runs.set(tabId, { windowId, tiles: [] });
      setProgress(tabId, 0);
      sendResponse({ ok: true });
      return false;
    case 'FULL_PAGE_TILE':
      captureTile(tabId, msg.y, msg.progress)
        .then(sendResponse)
        .catch((err) => sendResponse({ ok: false, reason: String(err) } satisfies TileReply));
      return true;
    case 'FULL_PAGE_FINISH':
      finishFullPage(tabId, msg.layout)
        .then(() => sendResponse({ ok: true }))
        .catch((err) => {
          console.error('[StaticShot] full-page stitch failed:', err);
          sendResponse({ ok: false });
        });
      return true;
    case 'FULL_PAGE_CANCEL':
      runs.delete(tabId);
      setProgress(tabId, null);
      sendResponse({ ok: true });
      return false;
    default:
      return false;
  }
});
