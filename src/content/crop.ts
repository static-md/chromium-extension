import styleText from './crop.css?inline';
import type { BackgroundMessage, PendingImage } from '../shared/types';

// This script is statically injected into every page via manifest content_scripts.
// It stays dormant until the background worker sends a START_CROP message.

declare global {
  interface Window {
    __staticshotCropActive?: boolean;
  }
}

chrome.runtime.onMessage.addListener((msg: BackgroundMessage, _sender, sendResponse) => {
  if (msg.type === 'START_CROP') {
    if (window.__staticshotCropActive) {
      sendResponse({ ok: false, reason: 'already-active' });
      return false;
    }
    startCrop(msg.captureDataUrl);
    sendResponse({ ok: true });
  }
  return false;
});

function startCrop(captureDataUrl: string) {
  window.__staticshotCropActive = true;
  const dpr = window.devicePixelRatio || 1;

  const styleEl = document.createElement('style');
  styleEl.setAttribute('data-staticshot', '');
  styleEl.textContent = styleText;
  document.documentElement.appendChild(styleEl);

  const overlay = document.createElement('div');
  overlay.className = 'staticshot-overlay';

  const dim = document.createElement('div');
  dim.className = 'staticshot-overlay-dim';
  overlay.appendChild(dim);

  const selection = document.createElement('div');
  selection.className = 'staticshot-selection';
  overlay.appendChild(selection);

  const hint = document.createElement('div');
  hint.className = 'staticshot-hint';
  hint.textContent =
    'Drag to crop · Click or Space = full viewport · Esc to cancel';

  document.body.appendChild(overlay);
  document.body.appendChild(hint);

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let rect: { x: number; y: number; w: number; h: number } | null = null;

  const setSelectionRect = (
    r: { x: number; y: number; w: number; h: number } | null,
  ) => {
    rect = r;
    if (!r || r.w < 1 || r.h < 1) {
      overlay.classList.remove('has-selection');
      selection.style.left = '0px';
      selection.style.top = '0px';
      selection.style.width = '0px';
      selection.style.height = '0px';
      return;
    }
    overlay.classList.add('has-selection');
    selection.style.left = `${r.x}px`;
    selection.style.top = `${r.y}px`;
    selection.style.width = `${r.w}px`;
    selection.style.height = `${r.h}px`;
  };

  const useFullViewport = () => {
    setSelectionRect({
      x: 0,
      y: 0,
      w: window.innerWidth,
      h: window.innerHeight,
    });
  };

  const onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    setSelectionRect({ x: startX, y: startY, w: 0, h: 0 });
    e.preventDefault();
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!dragging) return;
    const x = Math.min(e.clientX, startX);
    const y = Math.min(e.clientY, startY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);
    if (rect && rect.x === x && rect.y === y && rect.w === w && rect.h === h) return;
    setSelectionRect({ x, y, w, h });
  };

  const onMouseUp = (e: MouseEvent) => {
    if (!dragging) return;
    dragging = false;
    // Plain click (no meaningful drag) → capture the full viewport.
    if (!rect || rect.w < 5 || rect.h < 5) {
      useFullViewport();
    }
    void confirmCrop();
    e.preventDefault();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      teardown();
    } else if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      useFullViewport();
      void confirmCrop();
    }
  };

  async function confirmCrop() {
    if (!rect) return;
    try {
      const cropped = await cropDataUrl(captureDataUrl, rect, dpr);
      const pending: PendingImage = {
        dataUrl: cropped.dataUrl,
        width: rect.w,
        height: rect.h,
        createdAt: Date.now(),
      };
      await chrome.runtime.sendMessage({
        type: 'CROP_COMPLETE',
        image: pending,
      } satisfies BackgroundMessage);
    } catch (err) {
      console.error('[StaticShot] crop failed:', err);
    } finally {
      teardown();
    }
  }

  function teardown() {
    overlay.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mousemove', onMouseMove, true);
    window.removeEventListener('mouseup', onMouseUp, true);
    window.removeEventListener('keydown', onKeyDown, true);
    overlay.remove();
    hint.remove();
    styleEl.remove();
    window.__staticshotCropActive = false;
  }

  overlay.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove, true);
  window.addEventListener('mouseup', onMouseUp, true);
  window.addEventListener('keydown', onKeyDown, true);
}

async function cropDataUrl(
  dataUrl: string,
  r: { x: number; y: number; w: number; h: number },
  dpr: number,
): Promise<{ dataUrl: string }> {
  const img = await loadImage(dataUrl);
  const sx = Math.round(r.x * dpr);
  const sy = Math.round(r.y * dpr);
  const sw = Math.round(r.w * dpr);
  const sh = Math.round(r.h * dpr);

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return { dataUrl: canvas.toDataURL('image/png') };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
