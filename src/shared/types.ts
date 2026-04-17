export const STORAGE_KEY = 'staticshot:pendingImage';

export type PendingImage = {
  dataUrl: string;
  width: number; // in CSS pixels of the original viewport (for Excalidraw sizing)
  height: number;
  createdAt: number;
};

export type BackgroundMessage =
  | { type: 'CROP_COMPLETE'; image: PendingImage } // content -> bg (bg stores + opens editor tab)
  | { type: 'START_CROP'; captureDataUrl: string }; // bg -> content
