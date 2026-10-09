// EXPORTS: getAllSongs, putSong, deleteSong, getAllPlaylists, putPlaylist, deletePlaylist,
//          deleteMusicDatabase
import { deleteDB, openDB, type DBSchema } from 'idb';
import type { ISong } from '@/lib/music';
import type { Playlist } from '@/lib/playlists';

interface MusicDB extends DBSchema {
  songs: {
    key: string;
    value: ISong;
    indexes: { addedAt: number };
  };
  playlists: {
    key: string;
    value: Playlist;
    indexes: { createdAt: number };
  };
}

const DB_NAME = 'endfield-player-db';
const DB_VERSION = 2;

let dbPromise: ReturnType<typeof openDB<MusicDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<MusicDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1 && !db.objectStoreNames.contains('songs')) {
          const store = db.createObjectStore('songs', { keyPath: 'id' });
          store.createIndex('addedAt', 'addedAt');
        }
        if (oldVersion < 2 && !db.objectStoreNames.contains('playlists')) {
          const store = db.createObjectStore('playlists', { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
        }
      },
      // Another context still holds an older version open, so the upgrade waits.
      // Surfacing it beats hanging silently on a locked database.
      blocked() {
        console.warn('[db] upgrade blocked — another context has the database open');
      },
      // We are the ones blocking an upgrade elsewhere: release the connection and
      // drop the cache, so the next call reopens at the newer version.
      blocking() {
        console.warn('[db] closing connection so another context can upgrade');
        const pending = dbPromise;
        dbPromise = null;
        void pending?.then((db) => db.close()).catch(() => {});
      },
      // The browser closed the connection (storage pressure or eviction).
      terminated() {
        console.warn('[db] connection terminated by the browser');
        dbPromise = null;
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

export async function getAllPlaylists(): Promise<Playlist[]> {
  const db = await getDb();
  return db.getAll('playlists');
}

export async function putPlaylist(playlist: Playlist): Promise<void> {
  const db = await getDb();
  await db.put('playlists', playlist);
}

export async function deletePlaylist(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('playlists', id);
}

/** Drop the whole database (used by "clear all data"). */
export async function deleteMusicDatabase(): Promise<void> {
  if (dbPromise) {
    try {
      (await dbPromise).close();
    } catch {
      /* already closed */
    }
    dbPromise = null;
  }
  await deleteDB(DB_NAME);
}
