/**
 * State badges on a clip — what the features registered with
 * `#utils/timeline/badges.js` say about it ("CC" for captions, a mark while
 * a cutout is being made): small pills at the right end of the label strip,
 * left of the "fx" badge and of a clip's own mark. A clip too narrow for
 * pills shows a dot instead, and one narrower still shows nothing. Where
 * each pill was drawn is remembered per canvas, so the pointer can be told
 * what a badge means.
 * @module utils/timeline/draw/badges
 */

import { clipBadges } from '#utils/timeline/badges.js';

/** @typedef {import('./scene.js').Scene} Scene */
/** @typedef {import('#utils/timeline/badges.js').ClipBadge} ClipBadge */
/** @typedef {{ x0: number, x1: number, y: number, height: number }} ClipBox */
/** @typedef {{ x: number, y: number, width: number, height: number, title: string }} BadgeSpot */

const PILL_H = 11;
const PILL_PAD = 4;
const PILL_GAP = 3;
const DOT = 7;
/** A clip at least this wide shows its badges as pills with their text. */
export const PILL_MIN = 48;
/** A clip at least this wide, and narrower than `PILL_MIN`, shows one dot. */
export const DOT_MIN = 16;
/** Which badge a single dot stands for: what needs attention first. */
const URGENCY = { warn: 0, busy: 1, on: 2 };

/** @type {WeakMap<object, BadgeSpot[]>} Where the last frame drew badges, by canvas */
const spots = new WeakMap();

/**
 * Forget where badges were: call before a frame's clips are drawn.
 * @param {object} canvas
 */
export function resetBadgeSpots(canvas) {
  spots.set(canvas, []);
}

/**
 * What the badge under a point means.
 * @param {object} canvas
 * @param {number} x - Canvas x, CSS pixels
 * @param {number} y
 * @returns {string} The badge's sentence; '' when no badge is there
 */
export function badgeTitleAt(canvas, x, y) {
  const hit = (spots.get(canvas) || []).find(
    (spot) =>
      x >= spot.x - 2 &&
      x <= spot.x + spot.width + 2 &&
      y >= spot.y - 2 &&
      y <= spot.y + spot.height + 2,
  );
  return hit?.title || '';
}

/**
 * Where the badges of a clip go, right to left from what is already taken.
 * @param {ClipBadge[]} badges
 * @param {{ width: number, right: number, taken: number }} room - The clip's
 *   width, its right end on screen, and the pixels at that end in use
 * @param {(text: string) => number} measure - Width of a badge's text
 * @returns {{ badge: ClipBadge, x: number, width: number, dot: boolean }[]}
 */
export function layoutBadges(badges, room, measure) {
  if (!badges.length || room.width < DOT_MIN) return [];
  if (room.width < PILL_MIN) {
    const [first] = [...badges].sort((a, b) => URGENCY[a.tone] - URGENCY[b.tone]);
    return [{ badge: first, x: room.right - room.taken - DOT - 3, width: DOT, dot: true }];
  }
  let x = room.right - room.taken - 3;
  /** @type {{ badge: ClipBadge, x: number, width: number, dot: boolean }[]} */
  const placed = [];
  for (const badge of badges) {
    const width = Math.ceil(measure(badge.text)) + 2 * PILL_PAD;
    // Never over the clip's left end: what does not fit is left out.
    if (x - width < room.right - room.width + 4) break;
    x -= width;
    placed.push({ badge, x, width, dot: false });
    x -= PILL_GAP;
  }
  return placed;
}

/**
 * The fill and text colours of a tone.
 * @param {Scene['palette']} palette
 * @param {ClipBadge['tone']} tone
 * @returns {{ fill: string, text: string }}
 */
function toneColors(palette, tone) {
  if (tone === 'warn') return { fill: palette.warning, text: '#1c1917' };
  // Being made: the inverse of a badge that is simply on.
  if (tone === 'busy') return { fill: palette.clipText, text: '#0f172a' };
  return { fill: 'rgb(0 0 0 / 55%)', text: palette.clipText };
}

/**
 * Draw the badges of a clip.
 * @param {Scene} scene
 * @param {any} clip
 * @param {any} track
 * @param {ClipBox} box
 * @param {number} taken - Pixels at the right end already used (the "fx"
 *   badge, the clip's own mark)
 * @returns {number} Pixels the badges take from the label's room
 */
export function drawBadges(scene, clip, track, box, taken) {
  const badges = clipBadges(clip, track);
  if (!badges.length) return 0;
  const { ctx, palette, vp } = scene;
  ctx.font = `bold 9px ${palette.sans}`;
  // Beside another mark, where that mark ends; alone, inside what is on screen.
  const right = Math.min(box.x1, taken ? vp.width + 8 : vp.width - 2);
  const room = { width: box.x1 - box.x0, right, taken };
  const placed = layoutBadges(badges, room, (text) => ctx.measureText(text).width);
  const seen = spots.get(ctx.canvas);
  const y = box.y + 2;
  for (const { badge, x, width, dot } of placed) {
    const colors = toneColors(palette, badge.tone);
    ctx.fillStyle = colors.fill;
    ctx.beginPath();
    if (dot) ctx.roundRect(x, y + 2, DOT, DOT, DOT / 2);
    else ctx.roundRect(x, y, width, PILL_H, 3);
    ctx.fill();
    if (!dot) {
      ctx.textBaseline = 'middle';
      ctx.fillStyle = colors.text;
      ctx.fillText(badge.text, x + PILL_PAD, y + PILL_H / 2 + 0.5);
    }
    seen?.push({ x, y, width, height: PILL_H, title: badge.title || '' });
  }
  if (!placed.length) return 0;
  return room.right - taken - placed[placed.length - 1].x;
}
