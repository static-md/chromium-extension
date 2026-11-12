export type PendingImage = {
  dataUrl: string;
  width: number; // in CSS pixels of the original viewport (for Excalidraw sizing)
  height: number;
  createdAt: number;
};

/** The part of the viewport a full-page capture keeps, in CSS pixels */
export type Region = { x: number; y: number; w: number; h: number };

export type FullPageLayout = {
  /** Width of the whole visible tab in CSS pixels: sets the scale of each capture */
  viewportWidth: number;
  /** What scrolls: the page itself, or the largest scrolling box when the page doesn't */
  region: Region;
  /** Height of everything the region scrolls through, in CSS pixels */
  totalHeight: number;
};

export type BackgroundMessage =
  | { type: 'CROP_COMPLETE'; image: PendingImage } // content -> bg (bg stores + opens editor tab)
  | { type: 'START_CROP'; captureDataUrl: string } // bg -> content
  | { type: 'FULL_PAGE_START' } // content -> bg: a full-page capture begins in this tab
  | { type: 'FULL_PAGE_TILE'; y: number; progress: number } // content -> bg: capture the view now
  | { type: 'FULL_PAGE_FINISH'; layout: FullPageLayout } // content -> bg: stitch and open the editor
  | { type: 'FULL_PAGE_CANCEL' }; // content -> bg: drop the tiles

export type TileReply = { ok: true } | { ok: false; reason: string };
