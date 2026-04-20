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
    // Static content_scripts only inject on navigation. Tabs opened before the
    // extension was installed/updated won't have the listener, so re-inject.
    // The guard inside crop.ts keeps the listener from double-registering.
    const cropJs = chrome.runtime.getManifest().content_scripts?.[0]?.js?.[0];
    if (cropJs) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: [cropJs],
      });
    }
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
    await chrome.storage.session.set({ [STORAGE_KEY]: image });
    await chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
  } catch (err) {
    console.error('[StaticShot] failed to open editor with full viewport:', err);
  }
}

chrome.runtime.onMessage.addListener((msg: BackgroundMessage, _sender, sendResponse) => {
  if (msg.type === 'CROP_COMPLETE') {
    (async () => {
      try {
        await chrome.storage.session.set({ [STORAGE_KEY]: msg.image });
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
