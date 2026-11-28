/**
 * What `validate` says about captions. Loading repairs them without a word
 * — a preset that does not exist becomes `clean`, words out of order are
 * sorted, captions on a title are dropped — and the generic comparison of
 * what was written with what was read (`repairs.js`) would answer a list of
 * three hundred words with three hundred lines. These findings replace it
 * for the captions fields: one line per thing that matters. They also name
 * the captioned clips for which no words can be found.
 * @module bin/lib/captionsCheck
 */

import { CAPTION_STYLE, PRESET_NAMES, resolveCaptionStyle } from '#utils/captions/index.js';
import { readPath } from '#utils/captions/style.js';
import { captionVoices } from '#utils/captions/voices.js';
import { normalizeCaptions } from '#utils/captions/words.js';

/** @typedef {import('./repairs.js').Finding} Finding */

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const show = (value) => JSON.stringify(value);
const CLIP = /^(tracks\[(\d+)\]\.clips\[(\d+)\])\.captions(?:$|[.[])/;

/**
 * @param {Finding} finding - One of `repairFindings`
 * @returns {boolean} True when it is about a captions field: said here instead
 */
export const isCaptionsOwn = (finding) =>
  finding.path === 'captions' || finding.path.startsWith('captions.') || CLIP.test(finding.path);

/**
 * @param {any} style - `captions.style` as written
 * @returns {Finding[]} Where it says something that was not read as written
 */
function styleFindings(style) {
  /** @type {Finding[]} */
  const out = [];
  const note = (path, message) => void out.push({ path, message, level: 'warning' });
  const presets = PRESET_NAMES.join(', ');
  if (typeof style === 'string') {
    if (!PRESET_NAMES.includes(style))
      note('captions.style', `${show(style)} is not a preset (${presets}): "clean" is used`);
    return out;
  }
  if (!isObject(style)) return (note('captions.style', 'must be a preset or a style object'), out);
  const read = resolveCaptionStyle(style);
  const walk = (node, path) => {
    for (const [key, value] of Object.entries(node)) {
      const at = path ? `${path}.${key}` : key;
      const known = Object.hasOwn(CAPTION_STYLE, at);
      if (!known && isObject(value)) walk(value, at);
      else if (!known) note(`captions.style.${at}`, 'is not a field of a caption style');
      else if (show(readPath(read, at)) !== show(value))
        note(`captions.style.${at}`, `${show(value)} was read as ${show(readPath(read, at))}`);
    }
  };
  walk(style, '');
  return out;
}

/**
 * What the captions fields of a written document say that was repaired or
 * ignored on the way in.
 * @param {any} raw - The parsed file
 * @param {Finding[]} repairs - `repairFindings(raw, edl)`, before filtering
 * @returns {Finding[]}
 */
export function captionFindings(raw, repairs) {
  /** @type {Finding[]} */
  const out = [];
  const note = (path, message) => void out.push({ path, message, level: 'warning' });
  const doc = Array.isArray(raw) ? {} : raw;
  if (doc.captions !== undefined) {
    if (!isObject(doc.captions)) note('captions', 'must be { style }: ignored');
    else {
      for (const key of Object.keys(doc.captions))
        if (key !== 'style') note(`captions.${key}`, 'is not a field of the document');
      if (doc.captions.style !== undefined) out.push(...styleFindings(doc.captions.style));
    }
  }
  // A clip's block: once per clip the generic comparison had something to say about.
  /** @type {Map<string, { t: number, c: number, gone: boolean }>} */
  const clips = new Map();
  for (const { path, message } of repairs) {
    const [, clip, t, c] = CLIP.exec(path) || [];
    if (!clip) continue;
    // Said of the block as a whole: the clip that was read has none.
    const gone = path === `${clip}.captions` && /not a field/.test(message);
    clips.set(clip, { t: Number(t), c: Number(c), gone: gone || clips.get(clip)?.gone === true });
  }
  for (const [clip, { t, c, gone }] of clips) {
    const block = (Array.isArray(raw) ? raw : raw.tracks)[t].clips[c].captions;
    const at = `${clip}.captions`;
    if (!isObject(block)) note(at, 'must be { on, words? }: ignored');
    const read = normalizeCaptions(block);
    // Switched off and without words: nothing was lost by dropping it.
    if (!isObject(block) || (!read.on && !read.words)) continue;
    if (gone) note(at, 'only a clip that plays video or sound has captions: ignored');
    if (gone) continue;
    if (typeof block.on !== 'boolean' && block.on !== undefined)
      note(`${at}.on`, `${show(block.on)} was read as ${read.on}`);
    const written = Array.isArray(block.words) ? block.words.length : 0;
    const usable = read.words?.length || 0;
    if (block.words !== undefined && written !== usable)
      note(`${at}.words`, `has ${written} entries, ${usable} were usable ([start, end, "text"])`);
  }
  return out;
}

/**
 * The captioned clips that will show nothing: no words of their own, and
 * no transcript beside their file.
 * @param {{ tracks: any[] }} edl - The loaded document
 * @param {import('../../src/api/render/words.js').WordTable} words - `prepareRender(edl).words`
 * @returns {Finding[]}
 */
export function wordFindings(edl, words) {
  /** @type {Finding[]} */
  const out = [];
  for (const { clip, pieces } of captionVoices(edl)) {
    if (Array.isArray(clip.captions?.words) || words[clip.sourceFile]) continue;
    for (const piece of pieces) {
      const t = edl.tracks.findIndex((track) => track.clips.includes(piece));
      const path = `tracks[${t}].clips[${edl.tracks[t].clips.indexOf(piece)}].captions`;
      const message = `captions are on, but ${clip.sourceFile} has no transcript beside it (${clip.sourceFile}.nearedit.json) and the clip carries no words: it is rendered without captions`;
      out.push({ path, level: 'warning', message });
    }
  }
  return out;
}
