import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Excalidraw, exportToBlob } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';

import type { PendingImage } from '../shared/types';
import { clearPending, readPending } from '../shared/pendingStore';
import { ACCOUNT_URL, HOME_URL, saveAsNote, uploadImage, withRef } from '../shared/upload';
import './editor.css';

type Op = 'copy' | 'save' | 'note' | 'upload';

type Status =
  | { kind: 'idle' }
  | { kind: 'working'; op: Op }
  | { kind: 'copied' }
  | { kind: 'success'; url: string }
  | { kind: 'error'; message: string };

/** static.md takes uploads up to 10 MB: a bigger PNG goes as a JPEG */
const UPLOAD_LIMIT = 10 * 1024 * 1024;
const JPEG_QUALITIES = [0.92, 0.85, 0.75];

type ExcalidrawApi = {
  getSceneElements: () => readonly unknown[];
  getFiles: () => Record<string, unknown>;
  getAppState: () => { width: number; height: number };
  updateScene: (scene: { appState: object }) => void;
};

const FAILED: Record<Op, string> = {
  copy: "Couldn't copy the image",
  save: "Couldn't save the image",
  note: "Couldn't save the note",
  upload: 'Upload failed',
};

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const CopyIcon = () => (
  <Icon>
    <rect x="9" y="9" width="12" height="12" rx="1" />
    <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  </Icon>
);

const CheckIcon = () => (
  <Icon>
    <polyline points="20 6 9 17 4 12" />
  </Icon>
);

const UploadIcon = () => (
  <Icon>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </Icon>
);

const NoteIcon = () => (
  <Icon>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </Icon>
);

const DownloadIcon = () => (
  <Icon>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </Icon>
);

function Banner({
  variant,
  onDismiss,
  children,
}: {
  variant: 'success' | 'error';
  onDismiss: () => void;
  children: ReactNode;
}) {
  return (
    <div className={`staticshot-banner staticshot-banner--${variant}`} role="status">
      {children}
      <button
        type="button"
        className="staticshot-banner-close"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  );
}

function downloadScreenshot(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `screenshot-${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function App() {
  const [pending, setPending] = useState<PendingImage | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [linkCopied, setLinkCopied] = useState(false);
  const apiRef = useRef<ExcalidrawApi | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const image = await readPending();
        if (cancelled) return;
        if (image && image.dataUrl) {
          setPending(image);
          void clearPending();
        }
      } catch (err) {
        console.error('[StaticShot] failed to read pending image:', err);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const initialData = useMemo(() => {
    if (!pending) return null;
    const fileId = 'screenshot-bg';
    const mimeType = pending.dataUrl.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png';
    return {
      elements: [
        {
          type: 'image',
          id: 'screenshot-element',
          x: 0,
          y: 0,
          width: pending.width,
          height: pending.height,
          angle: 0,
          strokeColor: 'transparent',
          backgroundColor: 'transparent',
          fillStyle: 'solid',
          strokeWidth: 0,
          strokeStyle: 'solid',
          roughness: 0,
          opacity: 100,
          groupIds: [],
          frameId: null,
          roundness: null,
          seed: 1,
          version: 1,
          versionNonce: 1,
          isDeleted: false,
          boundElements: null,
          updated: pending.createdAt,
          link: null,
          locked: true,
          status: 'saved',
          fileId,
          scale: [1, 1],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      ],
      files: {
        [fileId]: {
          mimeType,
          id: fileId,
          dataURL: pending.dataUrl,
          created: pending.createdAt,
          lastRetrieved: pending.createdAt,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      },
      appState: {
        viewBackgroundColor: '#f3f5f8',
        currentItemStrokeColor: '#e03131',
        currentItemFillStyle: 'hachure' as const,
        currentItemRoughness: 1,
      },
    };
  }, [pending]);

  /**
   * Opens with the whole capture centered in view, never enlarged, clear of the
   * toolbars. A full-page capture would shrink to a sliver that way, so it
   * opens at full width from the top instead, to scroll down through.
   */
  function fitScreenshot() {
    const api = apiRef.current;
    if (!api || !pending) return;
    const { width, height } = api.getAppState();
    if (!width || !height) {
      window.setTimeout(fitScreenshot, 60);
      return;
    }
    const room = { top: 84, bottom: 72, side: 32 };
    const usable = height - room.top - room.bottom;
    const fitWidth = Math.min(1, (width - 2 * room.side) / pending.width);
    const tall = pending.height * fitWidth > usable * 1.5;
    const zoom = tall ? fitWidth : Math.min(fitWidth, usable / pending.height);
    api.updateScene({
      appState: {
        zoom: { value: zoom },
        scrollX: (width / zoom - pending.width) / 2,
        scrollY: tall
          ? room.top / zoom
          : (room.top + usable / 2) / zoom - pending.height / 2,
      },
    });
  }

  async function exportScene(format: { type: 'png' } | { type: 'jpeg'; quality: number } = { type: 'png' }): Promise<Blob> {
    const api = apiRef.current;
    if (!api) throw new Error('The editor is still loading');
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const appState = api.getAppState() as any;
    return exportToBlob({
      elements: api.getSceneElements() as any,
      files: api.getFiles() as any,
      // JPEG has no transparency: anything outside the screenshot turns white, not black
      appState:
        format.type === 'png'
          ? { ...appState, exportBackground: false }
          : { ...appState, exportBackground: true, viewBackgroundColor: '#ffffff' },
      exportPadding: 0,
      mimeType: `image/${format.type}`,
      ...(format.type === 'jpeg' ? { quality: format.quality } : {}),
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  /** PNG when it fits static.md's limit, otherwise the best JPEG that does */
  async function exportForUpload(): Promise<Blob> {
    const png = await exportScene();
    if (png.size <= UPLOAD_LIMIT) return png;
    for (const quality of JPEG_QUALITIES) {
      const jpeg = await exportScene({ type: 'jpeg', quality });
      if (jpeg.size <= UPLOAD_LIMIT) return jpeg;
    }
    const mb = (png.size / 1024 / 1024).toFixed(0);
    throw new Error(`the image is too big for static.md (${mb} MB, the limit is 10 MB). Download it instead`);
  }

  async function runAction(op: Op) {
    if (status.kind === 'working') return;
    setStatus({ kind: 'working', op });
    setLinkCopied(false);
    try {
      if (op === 'copy') {
        // Handed over as a promise: the export can outlast the click that allows the copy
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': exportScene() })]);
        setStatus({ kind: 'copied' });
        window.setTimeout(
          () => setStatus((now) => (now.kind === 'copied' ? { kind: 'idle' } : now)),
          1800,
        );
        return;
      }
      if (op === 'save') {
        downloadScreenshot(await exportScene());
        setStatus({ kind: 'idle' });
        return;
      }
      const blob = await exportForUpload();
      const url = op === 'upload' ? (await uploadImage(blob)).page : await saveAsNote(blob);
      setStatus({ kind: 'success', url });
      void chrome.tabs.create({ url: withRef(url), active: true });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      setStatus({ kind: 'error', message: `${FAILED[op]}: ${reason}` });
    }
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
    } catch (err) {
      console.error('[StaticShot] clipboard write failed:', err);
    }
  }

  if (!loaded) return null;

  if (!pending || !initialData) {
    return (
      <div className="staticshot-empty">
        Nothing to edit yet. Click the StaticShot icon on any page to capture it.
      </div>
    );
  }

  const workingOp = status.kind === 'working' ? status.op : null;
  const dismiss = () => setStatus({ kind: 'idle' });

  return (
    <div className="staticshot-editor">
      <header className="staticshot-bar">
        <a className="staticshot-brand" href={HOME_URL} target="_blank" rel="noreferrer">
          <img src="/icons/48.png" alt="" width="22" height="22" />
          <span>StaticShot</span>
        </a>
        <div className="staticshot-actions">
          <button
            type="button"
            className="staticshot-action-btn"
            onClick={() => runAction('copy')}
            disabled={workingOp !== null}
            title="Copy the image to your clipboard"
          >
            {status.kind === 'copied' ? <CheckIcon /> : <CopyIcon />}
            <span>{status.kind === 'copied' ? 'Copied' : 'Copy'}</span>
          </button>
          <button
            type="button"
            className="staticshot-action-btn"
            onClick={() => runAction('save')}
            disabled={workingOp !== null}
            title="Download a PNG to your computer"
          >
            <DownloadIcon />
            <span>{workingOp === 'save' ? 'Saving…' : 'Download'}</span>
          </button>
          <button
            type="button"
            className="staticshot-action-btn"
            onClick={() => runAction('note')}
            disabled={workingOp !== null}
            title="Save as a markdown note on static.md"
          >
            <NoteIcon />
            <span>{workingOp === 'note' ? 'Saving…' : 'Save as note'}</span>
          </button>
          <button
            type="button"
            className="staticshot-action-btn staticshot-action-btn--primary"
            onClick={() => runAction('upload')}
            disabled={workingOp !== null}
            title="Upload to static.md and get a link"
          >
            <UploadIcon />
            <span>{workingOp === 'upload' ? 'Uploading…' : 'Upload'}</span>
          </button>
        </div>
      </header>
      {status.kind === 'success' && (
        <Banner variant="success" onDismiss={dismiss}>
          <a href={status.url} target="_blank" rel="noreferrer">
            {status.url.replace('https://', '')}
          </a>
          <button type="button" onClick={() => copyLink(status.url)}>
            {linkCopied ? 'Copied' : 'Copy link'}
          </button>
          <a className="staticshot-invite" href={ACCOUNT_URL} target="_blank" rel="noreferrer">
            Free account: keep your notes in one place and let your AI read them
          </a>
        </Banner>
      )}
      {status.kind === 'error' && (
        <Banner variant="error" onDismiss={dismiss}>
          {status.message}
        </Banner>
      )}
      <div className="staticshot-editor-canvas">
        <Excalidraw
          initialData={initialData}
          autoFocus
          UIOptions={{ tools: { image: false } }}
          excalidrawAPI={(api) => {
            apiRef.current = api as unknown as ExcalidrawApi;
            window.setTimeout(fitScreenshot, 60);
          }}
        />
      </div>
    </div>
  );
}
