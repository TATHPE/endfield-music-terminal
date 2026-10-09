// Regenerate public/songs/manifest.json from the preset audio files that sit in
// public/songs/. The manifest is a *generated* index (embedded cover art +
// lyrics, which is why it is ~1 MB) and is intentionally NOT tracked by git —
// only the audio files are missing from the repository, the index is derived.
//
// Usage:  node tools/gen-song-manifest.mjs
//
// The song assets themselves ship as the "EndfieldSongs-v1.0.zip" release asset.

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFile } from 'music-metadata';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const songsDir = join(root, 'public', 'songs');
const outFile = join(songsDir, 'manifest.json');

const AUDIO = /\.(mp3|flac|m4a|aac|ogg|opus|wav|wma|aiff)$/i;

if (!existsSync(songsDir)) {
  console.error(`No song directory at ${songsDir} — download the EndfieldSongs asset pack first.`);
  process.exit(1);
}

const files = readdirSync(songsDir)
  .filter((f) => AUDIO.test(f))
  .sort((a, b) => a.localeCompare(b, 'en'));

if (files.length === 0) {
  console.error(`No audio files in ${songsDir} — nothing to index.`);
  process.exit(1);
}

/** Flatten music-metadata's lyrics (string | {text} | array) into one string. */
function lyricsText(common) {
  const raw = common.lyrics;
  if (!raw) return '';
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .map((l) => (typeof l === 'string' ? l : l?.text ?? ''))
    .filter(Boolean)
    .join('\n');
}

const tracks = [];
for (const file of files) {
  const { common, format } = await parseFile(join(songsDir, file), { duration: true });
  const picture = common.picture?.[0];
  tracks.push({
    file,
    title: common.title || file.replace(/\.[^.]+$/, ''),
    artist: common.artist || '铁痕电台-MSR',
    album: common.album || '明日方舟：终末地',
    duration: format.duration ?? 0,
    codec: format.codec || 'MP3',
    sampleRate: format.sampleRate ?? 0,
    bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : 0,
    cover: picture ? `data:${picture.format};base64,${Buffer.from(picture.data).toString('base64')}` : '',
    lyrics: lyricsText(common),
  });
  console.log(`  ${file}  ${tracks[tracks.length - 1].title}  ${Math.round(tracks[tracks.length - 1].duration)}s`);
}

writeFileSync(outFile, JSON.stringify(tracks, null, 1));
const kb = (readFileSync(outFile).length / 1024).toFixed(0);
console.log(`Wrote ${outFile} — ${tracks.length} tracks, ${kb} KB`);
