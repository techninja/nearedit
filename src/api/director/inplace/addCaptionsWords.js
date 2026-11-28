/**
 * `add_captions` as `words` — captions switched on for the speech on
 * the timeline, instead of title clips: each clip that is heard and has a
 * transcript gets `captions: { on: true }` (on its sound clip, where the
 * voice is), and the timeline takes the look that was asked for. Nothing
 * is laid out here — the compositor draws the words from the transcript,
 * so they stay in step however the speech is cut afterwards.
 * @module api/director/inplace/addCaptionsWords
 */

import { CAPTION_PRESETS } from '#utils/captions/presets.js';
import { resolveCaptionStyle } from '#utils/captions/resolve.js';
import { wordRange } from '#utils/director/speech.js';
import { captionInfo, setCaptions } from '#utils/edl/index.js';
import { chooseLook } from './captionsLook.js';
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
 * @returns {{ on: string[], already: number, lacking: string[] }} `on`:
 *   ids of the clips that carry the voices; `lacking`: file names
 */
function voicesInScope(ctx) {
  const lookup = mediaLookup(ctx.media);
  const tracks = docTracks(ctx.edl);
  const byId = new Map(
    tracks.flatMap((track) => track.clips.map((clip) => [clip.clipId, { clip, track }])),
  );
  const seen = new Set();
  /** @type {string[]} */
  const on = [];
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
    if (info.on) already++;
    else if (info.ownWords || hasWords(voice.clip, media)) on.push(info.carrierId);
    else if (chosen || media?.hasAudio) lacking.add(media?.filename || 'A clip');
  }
  return { on, already, lacking: [...lacking] };
}

/**
 * @param {import('../pipeline.js').ActionContext} ctx
 * @returns {Promise<import('../result.js').DirectorResult>}
 */
export async function captionWords(ctx) {
  const notes = [];
  const { on, already, lacking } = voicesInScope(ctx);
  const look = await chooseLook(ctx, notes);
  const current = resolveCaptionStyle(ctx.edl.captions?.style).preset;
  const restyle = Boolean(look.preset) && look.preset !== current && on.length + already > 0;
  const label = CAPTION_PRESETS[look.preset || current].label;
  for (const name of lacking) {
    notes.push(
      `${name} has no transcript for this part — transcribe it and switch its captions on (Inspector ▸ Captions).`,
    );
  }
  const s = (/** @type {number} */ n) => (n === 1 ? '' : 's');
  let summary = 'No speech with a transcript on the timeline — no captions switched on';
  if (on.length) summary = `Captions switched on for ${on.length} clip${s(on.length)} (${label})`;
  else if (already) {
    summary = restyle
      ? `Captions were already on — the style is now ${label}`
      : `Captions were already on for ${already} clip${s(already)} (${label})`;
  }
  if (on.length && already)
    notes.unshift(`${already} clip${s(already)} already had captions switched on.`);
  if (look.by === 'words') notes.push(`“${ctx.directive.prompt}” was read as the ${label} look.`);
  const result = inPlaceResult(ctx, docTracks(setCaptions(ctx.edl, on, true)), summary, notes);
  return restyle
    ? { ...result, document: { captions: { style: { preset: look.preset } } } }
    : result;
}
