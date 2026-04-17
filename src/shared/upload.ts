import SparkMD5 from 'spark-md5';

const API_BASE = 'https://static.md/api/v2';
const NOTES_ENDPOINT = 'https://static.md/api/v4/notes';

export async function computeMd5(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  return SparkMD5.ArrayBuffer.hash(buf);
}

export type UploadResult = {
  /** Direct image URL — use this when embedding in markdown. */
  image: string;
  /** Gallery/page URL — open this to show the image with metadata. */
  page: string;
};

export async function uploadImage(blob: Blob): Promise<UploadResult> {
  const md5 = await computeMd5(blob);

  const tokenForm = new FormData();
  tokenForm.append('md5', md5);
  const tokenRes = await fetch(`${API_BASE}/get-token/`, {
    method: 'POST',
    body: tokenForm,
  });
  const tokenJson = (await tokenRes.json()) as {
    token?: string;
    token_valid_after_seconds?: number;
    error?: string;
  };
  if (tokenJson.error) throw new Error(tokenJson.error);
  if (!tokenJson.token) throw new Error('No token received');

  const waitSec = tokenJson.token_valid_after_seconds ?? 0;
  if (waitSec > 0) {
    await new Promise((r) => setTimeout(r, waitSec * 1000));
  }

  const uploadForm = new FormData();
  uploadForm.append('token', tokenJson.token);
  uploadForm.append('image', blob, 'image.png');
  const upRes = await fetch(`${API_BASE}/upload/`, {
    method: 'POST',
    body: uploadForm,
  });
  const upJson = (await upRes.json()) as {
    page?: string;
    image?: string;
    error?: string;
  };
  if (upJson.error) throw new Error(upJson.error);
  const image = upJson.image;
  const page = upJson.page || image;
  if (!image || !page) throw new Error('No URL in upload response');
  return { image, page };
}

/** Upload then create a markdown note on static.md embedding the image. */
export async function saveAsNote(blob: Blob): Promise<string> {
  const { image } = await uploadImage(blob);
  const res = await fetch(NOTES_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: `![Screenshot](${image})\n\n` }),
  });
  if (!res.ok) throw new Error(`Note creation failed (HTTP ${res.status})`);
  const json = (await res.json()) as { noteId?: string };
  if (!json.noteId) throw new Error('No noteId in response');
  return `https://static.md/md/${json.noteId}`;
}
