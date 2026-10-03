// EXPORTS: getAllSongs, putSong, deleteSong
import { openDB, type DBSchema } from 'idb';
import type { ISong } from '@/lib/music';

interface MusicDB extends DBSchema {
  songs: {
    key: string;
    value: ISong;
    indexes: { addedAt: number };
  };
}

const DB_NAME = 'endfield-player-db';
const DB_VERSION = 1;

let dbPromise: ReturnType<typeof openDB<MusicDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<MusicDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('songs')) {
          const store = db.createObjectStore('songs', { keyPath: 'id' });
          store.createIndex('addedAt', 'addedAt');
        }
      },
    });
  }
  return dbPromise;
}

export async function getAllSongs(): Promise<ISong[]> {
  const db = await getDb();
  return db.getAll('songs');
}

export async function putSong(song: ISong): Promise<void> {
  const db = await getDb();
  await db.put('songs', song);
}

export async function deleteSong(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('songs', id);
}
