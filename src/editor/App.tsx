import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Excalidraw, exportToBlob } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';

import type { PendingImage } from '../shared/types';
import { STORAGE_KEY } from '../shared/types';
import { uploadImage, saveAsNote } from '../shared/upload';
import './editor.css';

type Op = 'upload' | 'note' | 'save';

type Status =
  | { kind: 'idle' }
  | { kind: 'working'; op: Op }
  | { kind: 'success'; url: string }
  | { kind: 'error'; message: string };

type ExcalidrawApi = {
  getSceneElements: () => readonly unknown[];
  getFiles: () => Record<string, unknown>;
  getAppState: () => unknown;
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
    <polyline points="10 9 9 9 8 9" />
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
    <div className={`staticshot-banner staticshot-banner--${variant}`}>
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
  const apiRef = useRef<ExcalidrawApi | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const got = await chrome.storage.session.get(STORAGE_KEY);
        const image = got[STORAGE_KEY] as PendingImage | undefined;
        if (cancelled) return;
        if (image && image.dataUrl) {
          setPending(image);
          void chrome.storage.session.remove(STORAGE_KEY);
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
    const sceneX = Math.round(window.innerWidth / 2 - pending.width / 2);
    const sceneY = Math.round(window.innerHeight / 2 - pending.height / 2);
    return {
      elements: [
        {
          type: 'image',
          id: 'screenshot-element',
          x: sceneX,
          y: sceneY,
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
          mimeType: 'image/png',
          id: fileId,
          dataURL: pending.dataUrl,
          created: pending.createdAt,
          lastRetrieved: pending.createdAt,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      },
      appState: {
        viewBackgroundColor: '#f7f7f8',
        scrollX: 0,
        scrollY: 0,
        currentItemFillStyle: 'hachure' as const,
        currentItemRoughness: 1,
      },
    };
  }, [pending]);

  async function exportScene(): Promise<Blob | null> {
    const api = apiRef.current;
    if (!api) return null;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    return exportToBlob({
      elements: api.getSceneElements() as any,
      files: api.getFiles() as any,
      appState: { ...(api.getAppState() as any), exportBackground: false },
      exportPadding: 0,
      mimeType: 'image/png',
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  async function runAction(op: Op) {
    if (status.kind === 'working') return;
    setStatus({ kind: 'working', op });
    try {
      const blob = await exportScene();
      if (!blob) throw new Error('Scene export failed');
      if (op === 'save') {
        downloadScreenshot(blob);
        setStatus({ kind: 'idle' });
        return;
      }
      const url =
        op === 'upload' ? (await uploadImage(blob)).page : await saveAsNote(blob);
      setStatus({ kind: 'success', url });
      void chrome.tabs.create({ url, active: true });
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
    } catch (err) {
      console.error('[StaticShot] clipboard write failed:', err);
    }
  }

  if (!loaded) return null;

  if (!pending || !initialData) {
    return (
      <div className="staticshot-empty">
        No image to edit. Close this tab and click the extension icon to start.
      </div>
    );
  }

  const workingOp = status.kind === 'working' ? status.op : null;
  const dismiss = () => setStatus({ kind: 'idle' });

  return (
    <div className="staticshot-editor-root">
      <div className="staticshot-terminal">
        <div className="staticshot-titlebar">
          <div className="staticshot-dots" aria-hidden="true">
            <span className="staticshot-dot staticshot-dot--close" />
            <span className="staticshot-dot staticshot-dot--min" />
            <span className="staticshot-dot staticshot-dot--max" />
          </div>
          <span className="staticshot-title">~/screenshot.png</span>
        </div>
        {status.kind === 'success' && (
          <Banner variant="success" onDismiss={dismiss}>
            <a href={status.url} target="_blank" rel="noreferrer">
              {status.url}
            </a>
            <button type="button" onClick={() => copyUrl(status.url)}>
              Copy URL
            </button>
          </Banner>
        )}
        {status.kind === 'error' && (
          <Banner variant="error" onDismiss={dismiss}>
            Upload failed: {status.message}
          </Banner>
        )}
        <div className="staticshot-editor-canvas">
          <Excalidraw
            initialData={initialData}
            UIOptions={{ tools: { image: false } }}
            renderTopRightUI={() => (
              <div className="staticshot-actions">
                <button
                  type="button"
                  className="staticshot-action-btn staticshot-action-btn--secondary"
                  onClick={() => runAction('note')}
                  disabled={workingOp !== null}
                  title="Save as Markdown note on static.md"
                >
                  <NoteIcon />
                  <span>{workingOp === 'note' ? 'Saving…' : 'Save as Note'}</span>
                </button>
                <button
                  type="button"
                  className="staticshot-action-btn staticshot-action-btn--secondary"
                  onClick={() => runAction('save')}
                  disabled={workingOp !== null}
                  title="Download PNG to your computer"
                >
                  <DownloadIcon />
                  <span>{workingOp === 'save' ? 'Saving…' : 'Save to PC'}</span>
                </button>
                <button
                  type="button"
                  className="staticshot-action-btn staticshot-action-btn--primary"
                  onClick={() => runAction('upload')}
                  disabled={workingOp !== null}
                  title="Upload image to static.md"
                >
                  <UploadIcon />
                  <span>{workingOp === 'upload' ? 'Uploading…' : 'Upload'}</span>
                </button>
              </div>
            )}
            excalidrawAPI={(api) => {
              apiRef.current = api as unknown as ExcalidrawApi;
            }}
          />
        </div>
      </div>
    </div>
  );
}
