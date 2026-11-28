/**
 * Where a cut-out person usually goes, as geometry: full height at one
 * side, smaller in a lower corner, or in a circle in a corner. A placement
 * is nothing special in the document — a transform, and for the circle a
 * `mask` effect — so it can be adjusted by hand afterwards
 * (`placementEdit.js` writes it). The person is assumed to be in the middle
 * of their own picture. Pure and isomorphic.
 * @module utils/cutoutUi/placements
 */

/** @typedef {{ width: number, height: number }} Size */

/**
 * @typedef {Object} PlacementGeometry
 * @property {{ fit: 'cover'|'contain', x: number, y: number, scaleX: number,
 *   scaleY: number }} transform - Offsets in output pixels
 * @property {{ center: { x: number, y: number }, width: number, height: number }|null} circle -
 *   The round window, in fractions of the frame
 */

/** The placements, in the order the inspector offers them. */
export const PLACEMENTS = [
  { id: 'fill', label: 'Fill the frame', hint: 'As the clip was: it fills the frame' },
  { id: 'left', label: 'Full height, left', hint: 'As tall as the frame, at the left' },
  { id: 'right', label: 'Full height, right', hint: 'As tall as the frame, at the right' },
  { id: 'corner-left', label: 'Lower left corner', hint: 'Half height, in the lower left' },
  { id: 'corner-right', label: 'Lower right corner', hint: 'Half height, in the lower right' },
  { id: 'circle-left', label: 'Circle, lower left', hint: 'In a round window, lower left' },
  { id: 'circle-right', label: 'Circle, lower right', hint: 'In a round window, lower right' },
];

/** The id of the `mask` effect a circle placement adds to a clip. */
export const CIRCLE_EFFECT = 'cutout-circle';

/** Where the middle of a full-height person sits: this far in from the side. */
const SIDE_CENTER = 0.25;
/** A corner person: this much of the frame's height, this far in from the side. */
const CORNER_HEIGHT = 0.5;
const CORNER_CENTER = 0.18;
/** A narrow picture keeps at least this much air to the side, of the frame's width. */
const SIDE_AIR = 0.03;
/** The circle: its diameter and its distance from the edges, of the frame's shorter side. */
const CIRCLE_SIZE = 0.3;
const CIRCLE_AIR = 0.045;

const round = (/** @type {number} */ value) => Math.round(value);
const ratio = (/** @type {number} */ value) => Math.round(value * 10000) / 10000;

/**
 * The geometry of a placement for a picture of one size in a frame of another.
 * @param {string} id - One of `PLACEMENTS`
 * @param {Size} frame - The output frame, pixels
 * @param {Size} [source] - The picture as shown; default: the frame's proportions
 * @returns {PlacementGeometry|null} null for an unknown placement
 */
export function placementGeometry(id, frame, source = frame) {
  const { width: W, height: H } = frame;
  if (!PLACEMENTS.some((placement) => placement.id === id) || !(W > 0 && H > 0)) return null;
  if (id === 'fill')
    return { transform: { fit: 'cover', x: 0, y: 0, scaleX: 1, scaleY: 1 }, circle: null };
  const aspect = source.width > 0 && source.height > 0 ? source.width / source.height : W / H;
  // With `contain` the picture is fitted whole: this is its height at scale 1.
  const fitted = Math.min(H, W / aspect);
  const right = id.endsWith('right');
  /**
   * A picture `height` tall whose middle is at (`cx`, `cy`).
   * @param {number} height
   * @param {number} cx
   * @param {number} cy
   */
  const at = (height, cx, cy) => {
    const scale = ratio(height / fitted);
    const transform = { x: round(cx - W / 2), y: round(cy - H / 2), scaleX: scale, scaleY: scale };
    return { fit: /** @type {'contain'} */ ('contain'), ...transform };
  };
  if (id.startsWith('circle')) {
    const size = Math.min(W, H) * CIRCLE_SIZE;
    const air = Math.min(W, H) * CIRCLE_AIR;
    const cx = right ? W - air - size / 2 : air + size / 2;
    const cy = H - air - size / 2;
    // The picture covers the window: its shorter side is the diameter.
    const height = aspect >= 1 ? size : size / aspect;
    const center = { x: ratio(cx / W), y: ratio(cy / H) };
    const circle = { center, width: ratio(size / W), height: ratio(size / H) };
    return { transform: at(height, cx, cy), circle };
  }
  const corner = id.startsWith('corner');
  const height = corner ? H * CORNER_HEIGHT : H;
  const inset = Math.min(
    W * (corner ? CORNER_CENTER : SIDE_CENTER),
    (height * aspect) / 2 + W * SIDE_AIR,
  );
  const transform = at(height, right ? W - inset : inset, H - height / 2);
  return { transform, circle: null };
}

/**
 * Which placement a clip is in, if it is exactly one of them.
 * @param {any} clip
 * @param {Size} frame
 * @param {Size} [source]
 * @returns {string} A placement id, or '' for a clip placed by hand
 */
export function placementOf(clip, frame, source) {
  const t = clip?.transform || {};
  const circled = (clip?.effects || []).some((fx) => fx.effectId === CIRCLE_EFFECT);
  const same = (/** @type {number} */ a, /** @type {number} */ b) => Math.abs(a - b) < 0.002;
  const found = PLACEMENTS.find(({ id }) => {
    const want = placementGeometry(id, frame, source);
    if (!want || Boolean(want.circle) !== circled || want.transform.fit !== t.fit) return false;
    const { x, y, scaleX, scaleY } = want.transform;
    return (
      Math.abs(x - t.x) < 1 &&
      Math.abs(y - t.y) < 1 &&
      same(scaleX, t.scaleX) &&
      same(scaleY, t.scaleY)
    );
  });
  return found ? found.id : '';
}
