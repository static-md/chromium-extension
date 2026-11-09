const API_BASE = 'https://static.md/api/v4';
/** The public form token static.md's own upload page sends */
const UPLOAD_TOKEN = 'carocetoken';
const REF = 'chrome-extension';

export type UploadResult = {
  /** Direct image URL — use this when embedding in markdown. */
  image: string;
  /** Gallery page — open this to show or share the image. */
  page: string;
};

/** The link to open: shows static.md this visit came from the extension. Shared links stay clean. */
export function withRef(url: string): string {
  const tagged = new URL(url);
  tagged.searchParams.set('ref', REF);
  return tagged.toString();
}

/** Where the note after a save leads */
export const ACCOUNT_URL = withRef('https://static.md/agents');
export const HOME_URL = withRef('https://static.md/');

export async function uploadImage(blob: Blob): Promise<UploadResult> {
  const form = new FormData();
  form.append('token', UPLOAD_TOKEN);
  form.append('file', blob, 'screenshot.png');
  const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: form });
  const json = (await res.json().catch(() => ({}))) as {
    gallery?: string;
    links?: Array<{ url: string }>;
    errors?: string[];
    error?: string;
  };
  if (json.error) throw new Error(json.error);
  const image = json.links?.[0]?.url;
  if (!image || !json.gallery) {
    throw new Error(json.errors?.[0] ?? `Upload failed (HTTP ${res.status})`);
  }
  return { image, page: `https://static.md/g/${json.gallery}` };
}

/** Upload then create a markdown note on static.md embedding the image. */
export async function saveAsNote(blob: Blob): Promise<string> {
  const { image } = await uploadImage(blob);
  const res = await fetch(`${API_BASE}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: `![Screenshot](${image})\n\n` }),
  });
  if (!res.ok) throw new Error(`Note creation failed (HTTP ${res.status})`);
  const json = (await res.json()) as { noteId?: string };
  if (!json.noteId) throw new Error('No noteId in response');
  return `https://static.md/md/${json.noteId}`;
}
