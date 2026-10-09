// EXPORTS: usePlaylists
import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { Playlist } from '@/lib/playlists';
import { FAVORITES_ID, makePlaylistId, normalizePlaylistName } from '@/lib/playlists';
import { putPlaylist, deletePlaylist as dbDeletePlaylist } from '@/lib/db';

interface PlaylistDeps {
  setPlaylists: Dispatch<SetStateAction<Playlist[]>>;
  /** clearing the active queue context is part of deleting a playlist */
  setActiveQueueId: Dispatch<SetStateAction<string | null>>;
}

/**
 * Playlist (播放序列) CRUD, extracted from PlayerProvider verbatim: create,
 * rename, delete, add a song, remove a song. Every mutation writes through to
 * IndexedDB and only then updates React state.
 */
export function usePlaylists({ setPlaylists, setActiveQueueId }: PlaylistDeps) {
  const createPlaylist = useCallback((name: string) => {
    const pl: Playlist = {
      id: makePlaylistId(),
      name: normalizePlaylistName(name),
      songIds: [],
      createdAt: Date.now(),
    };
    void putPlaylist(pl);
    setPlaylists((prev) => [...prev, pl]);
    return pl.id;
  }, [setPlaylists]);

  const renamePlaylist = useCallback((id: string, name: string) => {
    setPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id !== id) return pl;
        const next = { ...pl, name: normalizePlaylistName(name) };
        void putPlaylist(next);
        return next;
      }),
    );
  }, [setPlaylists]);

  const deletePlaylist = useCallback(
    (id: string) => {
      if (id === FAVORITES_ID) return;
      void dbDeletePlaylist(id);
      setPlaylists((prev) => prev.filter((pl) => pl.id !== id));
      setActiveQueueId((cur) => (cur === id ? null : cur));
    },
    [setPlaylists, setActiveQueueId],
  );

  const addToPlaylist = useCallback((playlistId: string, songId: string) => {
    setPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id !== playlistId || pl.songIds.includes(songId)) return pl;
        const next = { ...pl, songIds: [...pl.songIds, songId] };
        void putPlaylist(next);
        return next;
      }),
    );
  }, [setPlaylists]);

  const removeFromPlaylist = useCallback((playlistId: string, songId: string) => {
    setPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id !== playlistId || !pl.songIds.includes(songId)) return pl;
        const next = { ...pl, songIds: pl.songIds.filter((sid) => sid !== songId) };
        void putPlaylist(next);
        return next;
      }),
    );
  }, [setPlaylists]);

  return { createPlaylist, renamePlaylist, deletePlaylist, addToPlaylist, removeFromPlaylist };
}
