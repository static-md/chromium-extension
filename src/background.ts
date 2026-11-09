import cropScript from './content/crop.ts?script';
import type { BackgroundMessage, PendingImage } from './shared/types';
import { STORAGE_KEY } from './shared/types';

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

/**
 * Session storage holds about 10 MB. A large, busy page can exceed that as a
 * PNG, so such a capture is kept as a high-quality JPEG instead of failing.
 */
async function storePending(image: PendingImage) {
  try {
    await chrome.storage.session.set({ [STORAGE_KEY]: image });
  } catch {
    await chrome.storage.session.set({ [STORAGE_KEY]: await asJpeg(image) });
  }
}

async function asJpeg(image: PendingImage): Promise<PendingImage> {
  const bitmap = await createImageBitmap(await (await fetch(image.dataUrl)).blob());
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return { ...image, dataUrl };
}

async function openEditorWithFullViewport(captureDataUrl: string) {
  try {
    const blob = await (await fetch(captureDataUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    const image: PendingImage = {
      dataUrl: captureDataUrl,
      width: bitmap.width,
      height: bitmap.height,
      createdAt: Date.now(),
    };
    bitmap.close?.();
    await storePending(image);
    await chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
  } catch (err) {
    console.error('[StaticShot] failed to open editor with full viewport:', err);
  }
}

chrome.runtime.onMessage.addListener((msg: BackgroundMessage, _sender, sendResponse) => {
  if (msg.type === 'CROP_COMPLETE') {
    (async () => {
      try {
        await storePending(msg.image);
        await chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
        sendResponse({ ok: true });
      } catch (err) {
        console.error('[StaticShot] failed to open editor:', err);
        sendResponse({ ok: false });
      }
    })();
    return true; // keep the channel open for the async response
  }
  return false;
});
