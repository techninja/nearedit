/**
 * Bringing one timeline document up to date with a kit, on the command
 * line. Only what the brand owns is rewritten — the `element` block of the
 * clips that are restyled and the document's `fonts` table; every other
 * byte of meaning in the file stays as its author wrote it, defaults left
 * out included. The restyling itself is the editor's own `restyle`.
 * @module bin/lib/restyleDocument
 */

import { isAbsolute, relative, sep } from 'node:path';
import { cleanElement, cleanFonts, kitFiles, mapKitFiles, sameFonts } from '#utils/brand/index.js';
import { restyle } from '#utils/edl/index.js';
import { isPlainObject } from '#utils/edl/jsonBag.js';
import { isInside } from '../../src/api/lib/paths.js';

/**
 * What happened to the element clips of one document, by element id.
 * @typedef {Object} Outcome
 * @property {Record<string, number>} updated - Given the kit's design
 * @property {Record<string, number>} current - Already as the kit has them
 * @property {Record<string, number>} missing - Of an element the kit does
 *   not have: left as they are
 * @property {Record<string, number>} skipped - Left out by `--only`
 * @property {boolean} changed - Whether the document is different now
 * @property {string[]} outside - Files the new designs name by an absolute
 *   path: a render has to be allowed to read them with `--media`
 */

/**
 * A kit as a document in a given folder names its files: relative to that
 * folder when they lie inside it — the document then travels with them —
 * and by their absolute path otherwise.
 * @param {import('#utils/brand/types.js').Kit} effective - Files as absolute paths
 * @param {string} dir - The folder of the document
 * @returns {import('#utils/brand/types.js').Kit}
 */
export function kitFor(effective, dir) {
  return mapKitFiles(effective, (path) =>
    path && isAbsolute(path) && isInside(dir, path)
      ? relative(dir, path).split(sep).join('/')
      : path,
  );
}

/**
 * The clips of a parsed document as `restyle` needs them: each with a tag
 * for an id that says where it is, its text's font (the font table keeps
 * the families titles still use) and its element block.
 * @param {any[]} tracks
 * @returns {any[]}
 */
function tagged(tracks) {
  return tracks.map((track, t) => ({
    trackId: `t${t}`,
    type: 'video',
    clips: (Array.isArray(track?.clips) ? track.clips : []).map((clip, c) => {
      const element = cleanElement(clip?.element);
      const text = isPlainObject(clip?.text) ? clip.text : undefined;
      return { clipId: `${t}:${c}`, ...(text && { text }), ...(element && { element }) };
    }),
  }));
}

/** @type {(tally: Record<string, number>, id: string) => void} */
const count = (tally, id) => void (tally[id] = (tally[id] || 0) + 1);

/**
 * Restyle the element clips of a parsed document.
 * @param {any} raw - The parsed file: a document, or its bare list of tracks
 * @param {import('#utils/brand/types.js').Kit} kit - An effective kit whose
 *   files are named as this document names files (`kitFor`)
 * @param {{ only?: string[] }} [opts] - Element ids to restyle; default all
 * @returns {{ document: any, outcome: Outcome }} `document` is `raw` itself
 *   when nothing changed
 */
export function restyleDocument(raw, kit, opts = {}) {
  const tracks = Array.isArray(raw) ? raw : raw.tracks;
  const before = { tracks: tagged(tracks), fonts: cleanFonts(raw.fonts) };
  const clips = before.tracks.flatMap((track) => track.clips).filter((clip) => clip.element);
  const wanted = opts.only ? clips.filter((clip) => opts.only.includes(clip.element.id)) : clips;
  const after = restyle(
    /** @type {any} */ (before),
    kit,
    wanted.map((clip) => clip.clipId),
  );
  const restyled = new Map(after.tracks.flatMap((track) => track.clips).map((c) => [c.clipId, c]));
  /** @type {Outcome} */
  const outcome = {
    updated: {},
    current: {},
    missing: {},
    skipped: {},
    changed: false,
    outside: [],
  };
  const next = structuredClone(tracks);
  for (const clip of clips) {
    const { id } = clip.element;
    const now = restyled.get(clip.clipId);
    if (!wanted.includes(clip)) count(outcome.skipped, id);
    else if (!Object.hasOwn(kit.elements, id)) count(outcome.missing, id);
    else if (now === clip) count(outcome.current, id);
    else {
      count(outcome.updated, id);
      const [t, c] = clip.clipId.split(':').map(Number);
      next[t].clips[c].element = now.element;
      outcome.outside.push(...kitFiles(now.element.design).filter((path) => isAbsolute(path)));
    }
  }
  const fonts = after.fonts || [];
  const fontsMoved = !sameFonts(fonts, before.fonts);
  outcome.changed = fontsMoved || Object.keys(outcome.updated).length > 0;
  if (!outcome.changed) return { document: raw, outcome };
  // A bare list of tracks stays one, unless it now has fonts of its own to name.
  if (Array.isArray(raw) && !fonts.length) return { document: next, outcome };
  const document = Array.isArray(raw) ? { tracks: next } : { ...raw, tracks: next };
  if (fonts.length) document.fonts = fonts;
  else delete document.fonts;
  return { document, outcome };
}
