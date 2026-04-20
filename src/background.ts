import type { BackgroundMessage } from './shared/types';
import { STORAGE_KEY } from './shared/types';

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || tab.windowId === undefined) return;
  try {
    const captureDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'png',
    });
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
    console.error('[StaticShot] capture failed:', err);
  }
});

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
