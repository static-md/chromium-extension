// Point Excalidraw at the assets bundled inside the extension. Its default
// falls back to unpkg.com which MV3's CSP blocks. Runs as a side effect on
// import, so it must be imported before any Excalidraw code evaluates.

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string;
  }
}

if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
  window.EXCALIDRAW_ASSET_PATH = chrome.runtime.getURL('excalidraw-assets/');
}

export {};
