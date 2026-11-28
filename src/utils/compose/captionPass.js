/**
 * The caption pass — the last thing a frame gets, over every track: for
 * each captioned clip that is heard at this moment, the group of words on
 * screen, laid out and drawn in the timeline's caption style. The words are
 * the clip's own, or its file's transcript as the host hands it over
 * (`env.words`); a voice whose words or font have not arrived draws
 * nothing, and the host paints again when they do.
 * Isomorphic. Reference: docs/app-spec/CAPTIONS.md § Drawing.
 * @module utils/compose/captionPass
 */

import { captionAt } from '#utils/captions/at.js';
import { captionFont, captionFontNeed, drawCaptionAt } from '#utils/captions/drawAt.js';
import { captionGroups } from '#utils/captions/groups.js';
import { resolveCaptionStyle } from '#utils/captions/resolve.js';
import { captionVoices, voiceFiles, voiceWords, voicesAt } from '#utils/captions/voices.js';
import { runModule } from './applyEffects.js';

/** What a font is warmed up with when a voice's words are not known yet. */
const SAMPLE = 'Aa0';

/**
 * The words a voice shows, in timeline seconds.
 * @param {import('#utils/captions/voices.js').Voice} voice
 * @param {((clip: any) => any)|undefined} wordsOf - The transcript of a clip's file
 * @returns {import('#utils/captions/types.js').Word[]} The same array for
 *   the same voice and transcript
 */
function wordsFor(voice, wordsOf) {
  const own = Array.isArray(voice.clip.captions?.words);
  return voiceWords(voice, own || !wordsOf ? null : wordsOf(voice.clip));
}

/**
 * Draw the captions of a frame. Voices that sound together stack: the
 * first with words takes the style's place, the next sits clear of it.
 * @param {any} ctx - The frame, after every track
 * @param {import('./drawClip.js').FrameRun} run
 */
export function drawCaptions(ctx, run) {
  const { edl, time, frame, compose } = run;
  const voices = voicesAt(edl, time);
  if (!voices.length) return;
  const style = resolveCaptionStyle(edl.captions?.style);
  let lane = 0;
  for (const voice of voices) {
    const words = wordsFor(voice, compose.env.words);
    if (!words.length) continue;
    const mine = lane++;
    const found = captionAt(captionGroups(words, style), time);
    if (!found) continue;
    // Until its font is there a caption is left out rather than drawn in another.
    if (!compose.env.fontReady(captionFont(style, frame), found.group.text)) continue;
    runModule('captions', ctx, compose.pool, () =>
      drawCaptionAt(ctx, words, time, style, frame, mine),
    );
  }
}

/**
 * What the captions of a document need from a host: the files whose
 * transcripts they are made from, and the font with the characters it will
 * be asked for.
 * @param {{ tracks?: any[], fonts?: any[], captions?: { style?: unknown } }} edl
 * @param {(clip: any) => any} [wordsOf] - The transcript of a clip's file,
 *   when the host has it; without it the font is asked for with a few
 *   plain letters (and for the words clips carry themselves)
 * @returns {{ words: string[], fonts: { font: string, text: string }[] }}
 */
export function captionRequirements(edl, wordsOf) {
  const voices = captionVoices(edl);
  if (!voices.length) return { words: [], fonts: [] };
  const style = resolveCaptionStyle(edl.captions?.style);
  const chars = new Set(SAMPLE);
  let font = '';
  for (const voice of voices) {
    const need = captionFontNeed(wordsFor(voice, wordsOf), style, edl.fonts);
    font = need.font;
    for (const char of need.text) chars.add(char);
  }
  return { words: voiceFiles(edl), fonts: [{ font, text: [...chars].join('') }] };
}
