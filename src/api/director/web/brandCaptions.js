/**
 * The captions of a site demo in the brand: every stop that says something
 * shows the kit's own `caption` element for as long as the stop lasts.
 * Under a window the caption sits in the band kept for it; over a page
 * that fills the frame it stays where the kit puts it — unless the action
 * is there, and then it goes to the head of the picture.
 * Reference: docs/app-spec/DIRECTOR-BRAND.md § Site demo.
 * @module api/director/web/brandCaptions
 */

import { brandCaption } from './brand.js';
import { CLEARLY, busyBox, captionStops, overlap } from './captionStops.js';

/** Gap between a caption at the head and the edge of the picture, share of the shorter side. */
const GAP = 0.03;

/**
 * @param {Object} input
 * @param {import('#utils/brand/types.js').Kit} input.kit
 * @param {import('#utils/web/types.js').Track} input.track
 * @param {number[]} input.owners - Per step, the stop it belongs to
 * @param {Record<string, any[]>} input.keys - The camera's keyframes
 * @param {import('./stage.js').Stage} input.stage
 * @param {{ fps: number, width: number, height: number }} input.format
 * @param {number} input.startF - The frame of the fragment the recording starts on
 * @returns {{ clips: any[], top: number }} `top`: how many were put at the head
 */
export function brandCaptionClips({ kit, track, owners, keys, stage, format, startF }) {
  const { fps } = format;
  const { band, window: win, short } = stage;
  const clips = [];
  let top = 0;
  for (const { words, fromF, toF, last } of captionStops({ track, owners, fps, startF })) {
    const span = { ...format, startF: fromF, endF: toF };
    // A touch above the middle of the band: the window's shadow falls into it.
    const inBand = band ? { centre: band.y + band.height * 0.52 } : {};
    let made = brandCaption(kit, words, span, inBand);
    if (!made) continue;
    if (!band) {
      const busy = busyBox(last, keys, track, stage);
      const head = { ...made.box, y: win.y + Math.round(GAP * short) };
      const worse = overlap(made.box, busy) - overlap(head, busy);
      if (worse > CLEARLY * made.box.width * made.box.height) {
        made = brandCaption(kit, words, span, { top: head.y });
        top++;
      }
    }
    clips.push(made.clip);
  }
  return { clips, top };
}
