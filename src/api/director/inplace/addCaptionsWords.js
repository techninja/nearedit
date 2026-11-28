/**
 * `add_captions` as `words` — captions switched on for the speech on
 * the timeline, instead of title clips: each clip that is heard and has a
 * transcript gets `captions: { on: true }` (on its sound clip, where the
 * voice is), and the timeline takes the look that was asked for — or, when
 * none was and it has no caption style of its own, the project's brand
 * kit's (`captionsStyle.js`). Nothing is laid out here — the compositor
 * draws the words from the transcript, so they stay in step however the
 * speech is cut afterwards.
 * @module api/director/inplace/addCaptionsWords
 */

import { wordRange } from '#utils/director/speech.js';
import { captionInfo, captionedClips, setCaptions } from '#utils/edl/index.js';
import { chooseLook } from './captionsLook.js';
import { captionStyleFor } from './captionsStyle.js';
import { docTracks, inPlaceResult, mediaLookup } from './doc.js';
import { scopedClips } from './scope.js';

/** @typedef {import('../context/mediaInfo.js').MediaInfo} MediaInfo */

/**
 * Whether the part of a file a clip plays has anything to show.
 * @param {any} clip
 * @param {MediaInfo|null} media
 * @returns {boolean}
 */
function hasWords(clip, media) {
  if (!media) return false;
  if (wordRange(media.words, clip.sourceIn, clip.sourceOut)) return true;
  // Phrases without word times are spread into words when they are drawn.
  return (
    !media.words.length &&
    media.segments.some((s) => s.text && s.end > clip.sourceIn && s.start < clip.sourceOut)
  );
}

/**
 * The voices of the scope: which to switch on, which already are, which
 * have no transcript.
 * @param {import('../pipeline.js').ActionContext} ctx
 * @returns {{ on: Map<string, string>, already: number, lacking: string[] }} `on`:
 *   the clips that carry the voices, id → file name; `lacking`: file names
 */
function voicesInScope(ctx) {
  const lookup = mediaLookup(ctx.media);
  const tracks = docTracks(ctx.edl);
  const byId = new Map(
    tracks.flatMap((track) => track.clips.map((clip) => [clip.clipId, { clip, track }])),
  );
  const seen = new Set();
  /** @type {Map<string, string>} */
  const on = new Map();
  const lacking = new Set();
  let already = 0;
  for (const { clip, chosen } of scopedClips(tracks, ctx.directive)) {
    const info = captionInfo(ctx.edl, clip.clipId);
    if (!info.can || seen.has(info.carrierId)) continue;
    seen.add(info.carrierId);
    const voice = byId.get(info.carrierId);
    const media = lookup(voice.clip.sourceFile);
    // Unless asked for, caption only what is heard: sound that is not music or muted.
    const heard = voice.track.type === 'audio' && !voice.track.muted;
    const music = media?.kind === 'music' || voice.clip.intent === 'music' || voice.clip.music;
    if (!chosen && (!heard || music)) continue;
    const name = media?.filename || 'A clip';
    if (info.on) already++;
    else if (info.ownWords || hasWords(voice.clip, media)) on.set(info.carrierId, name);
    else if (chosen || media?.hasAudio) lacking.add(name);
  }
  return { on, already, lacking: [...lacking] };
}

/**
 * @param {import('../pipeline.js').ActionContext} ctx
 * @returns {Promise<import('../result.js').DirectorResult>}
 */
export async function captionWords(ctx) {
  const notes = [];
  const { on: wanted, already, lacking } = voicesInScope(ctx);
  // The document decides what can be switched: nothing changes on a locked track — for a
  // linked pair, when either of the two is locked (a voice may be scoped by its picture).
  const edl = setCaptions(ctx.edl, [...wanted.keys()], true);
  const now = new Set(captionedClips(edl).map(({ clip }) => clip.clipId));
  const on = [...wanted.keys()].filter((clipId) => now.has(clipId));
  const held = [...wanted].filter(([clipId]) => !now.has(clipId)).map(([, name]) => name);
  const look = await chooseLook(ctx, notes);
  const chosen = captionStyleFor(ctx, look);
  // A style is set only where there are captions to draw with it.
  const captioned = on.length + already > 0;
  const restyle = Boolean(chosen.style) && captioned;
  const { label } = chosen;
  for (const name of lacking) {
    notes.push(
      `${name} has no transcript for this part — transcribe it and switch its captions on (Inspector ▸ Captions).`,
    );
  }
  for (const name of new Set(held)) {
    notes.push(
      `${name} is on a locked track, or linked to a clip on one — its captions were not switched on.`,
    );
  }
  const s = (/** @type {number} */ n) => (n === 1 ? '' : 's');
  let summary = held.length
    ? 'No captions switched on — the speech with a transcript is on locked tracks'
    : 'No speech with a transcript on the timeline — no captions switched on';
  if (on.length)
    summary = `Captions switched on for ${on.length} clip${s(on.length)} (${chosen.said})`;
  else if (already) {
    summary = restyle
      ? `Captions were already on — the style is now ${chosen.said}`
      : `Captions were already on for ${already} clip${s(already)} (${label})`;
  }
  if (on.length && already)
    notes.unshift(`${already} clip${s(already)} already had captions switched on.`);
  if (look.by === 'words') notes.push(`“${ctx.directive.prompt}” was read as the ${label} look.`);
  if (captioned && chosen.note) notes.push(chosen.note);
  const result = inPlaceResult(ctx, docTracks(edl), summary, notes);
  if (!restyle) return result;
  const fonts = chosen.fonts.length ? { fonts: chosen.fonts } : {};
  return { ...result, document: { ...fonts, captions: { style: chosen.style } } };
}
