/**
 * The music of a timeline: point every music clip at the rendering of its
 * song — the song is the source of truth, whatever file the document names
 * — and make the renderings a render is about to read. Music is cheap and
 * deterministic, so unlike a web clip's recording nobody is asked first.
 * Contract: MUSIC.md § In the document, RENDER.md § Limits.
 * @module api/music/timeline
 */

import { mapClips } from '#utils/edl/immutable.js';
import { isMusicClip, isStaleMusic } from '#utils/music/clip.js';
import { songKey } from '#utils/music/key.js';
import { renderMusic } from './cache.js';
import { musicFolder, musicPath, readMusic } from './renderings.js';

/**
 * @typedef {Object} Unrendered - A music clip whose rendering does not exist yet
 * @property {string} clipId
 * @property {string} key
 * @property {any} song
 * @property {string} file - Where it will be: in the first folder
 */

/**
 * Point every music clip of a document — on every track, also muted and
 * locked ones — at the rendering of its song as it is now.
 * @param {any} edl - Normalised
 * @param {string[]} folders - Where renderings are looked for; the first is
 *   where a missing one is made
 * @param {{ placeholders?: boolean }} [opts] - `placeholders`: a clip
 *   without a rendering is left a placeholder (the command line, which
 *   renders it before it loads the document again) instead of pointed at
 *   the file to come (the server, which renders it as the render starts)
 * @returns {{ edl: any, missing: Unrendered[] }}
 */
export function attachMusic(edl, folders, opts = {}) {
  /** @type {Unrendered[]} */
  const missing = [];
  /** @type {Map<string, import('./renderings.js').Rendering|undefined>} */
  const known = new Map();
  const attached = mapClips(
    edl,
    (clip) => {
      if (!isMusicClip(clip)) return clip;
      const { song } = clip.music;
      const key = songKey(song);
      // Split clips share a song: one look per key.
      if (!known.has(key)) known.set(key, folders.map((at) => readMusic(at, key)).find(Boolean));
      const file = known.get(key)?.file || musicPath(folders[0], key);
      if (!known.get(key)) missing.push({ clipId: clip.clipId, key, song, file });
      // Whatever file the document names belongs to another song, or is not here.
      if (!known.get(key) && opts.placeholders)
        return { ...clip, sourceFile: '', placeholder: true };
      return { ...clip, sourceFile: file, placeholder: false, music: { song, key } };
    },
    true,
  );
  return { edl: attached, missing };
}

/**
 * Render what a list of clips is about to play and is not there: for every
 * music clip that points at the rendering of its own song, that rendering.
 * A clip that points anywhere else is left to the caller's own checks.
 * @param {any[]} clips - The clips a render reads
 * @param {{ signal?: AbortSignal, log?: (message: string) => void }} [opts]
 * @returns {Promise<import('./renderings.js').Rendering[]>} What was made
 * @throws {Error} As `renderMusic`
 */
export async function renderMusicOf(clips, opts = {}) {
  /** @type {Map<string, { folder: string, song: any }>} */
  const wanted = new Map();
  for (const clip of clips) {
    if (!isMusicClip(clip) || isStaleMusic(clip) || !clip.sourceFile) continue;
    const { song, key } = clip.music;
    const folder = musicFolder(clip.sourceFile, key);
    if (folder && !readMusic(folder, key)) wanted.set(clip.sourceFile, { folder, song });
  }
  if (!wanted.size) return [];
  opts.log?.(`Rendering music: ${wanted.size} song${wanted.size === 1 ? '' : 's'}`);
  const { signal } = opts;
  return Promise.all([...wanted.values()].map((job) => renderMusic({ ...job, signal })));
}
