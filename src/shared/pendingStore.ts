import type { PendingImage } from './types';

/**
 * Hands the capture from the background worker to the editor tab. Both run on
 * the extension's origin, so they share this IndexedDB. Unlike session storage
 * (about 10 MB), it holds a full-page capture of a long page.
 */
const DB_NAME = 'staticshot';
const STORE = 'pending';
const KEY = 'image';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = op(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function savePending(image: PendingImage): Promise<void> {
  await run('readwrite', (store) => store.put(image, KEY));
}

export async function readPending(): Promise<PendingImage | undefined> {
  return run('readonly', (store) => store.get(KEY) as IDBRequest<PendingImage | undefined>);
}

export async function clearPending(): Promise<void> {
  await run('readwrite', (store) => store.delete(KEY));
}
