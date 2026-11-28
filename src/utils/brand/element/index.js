/**
 * The element language — how a brand kit writes a design with blanks, and
 * the reference of every word it has. An element is plain JSON:
 *
 * ```json
 * { "label": "Lower third", "kind": "overlay", "duration": 5, "minDuration": 1.5,
 *   "slots": { "name": { "label": "Name" }, "role": { "label": "Role", "optional": true } },
 *   "groups": { "block": { "at": "bottom-left", "align": "left", "gap": 0.7, "pad": [3.2, 2] } },
 *   "layers": [
 *     { "id": "plate", "type": "shape", "around": "block", "fill": "{color.surface}eb",
 *       "radius": "{shape.radius}", "enter": { "motion": "wipe", "duration": 0.45 }, "exit": "fade" },
 *     { "id": "name", "type": "text", "in": "block", "text": "{slot.name}", "font": "{font.heading}",
 *       "size": 5.2, "color": "{color.text}", "lines": 2,
 *       "enter": { "motion": "{motion.enter}", "delay": 0.2 }, "exit": "fade" },
 *     { "id": "role", "type": "text", "in": "block", "when": "{slot.role}", "text": "{slot.role}",
 *       "font": "{font.body}", "size": 3.2, "color": "{color.muted}" } ],
 *   "formats": { "tall": { "groups": { "block": { "y": -14 } }, "layers": { "name": { "size": 6.2 } } } } }
 * ```
 *
 * **Element.** `kind`: `overlay` (over the picture), `segment` (fills the
 * frame, takes its own time) or `transition` (covers the frame at `cover`,
 * a share 0..1 of its length, where the cut belongs). `duration` and
 * `minDuration` in seconds. `slots`: its blanks by name (`label`, `sample`,
 * `optional`, `lines`, `max` are for forms). `margin`: the safe margin in
 * units (the kit's `space.margin` by default). `layers`: back to front.
 *
 * **Units.** Every length is in units: 1 unit is a hundredth of the frame's
 * shorter side. A width or height may also be a share of what the layer is
 * placed in: `"80%"`.
 *
 * **References.** Any value may be a reference in braces: a token
 * (`{color.primary}`, `{font.heading}`, `{shape.radius}`, `{motion.enter}`)
 * or a slot (`{slot.name}`). A string that is one reference stands for the
 * value itself — a number, a whole font; inside a longer string it is
 * written out: `"— {slot.by}"`, and `"{color.surface}cc"` is that colour at
 * 80 % opacity. Tokens are filled in by `resolveElement` (the **design** a
 * clip carries refers to nothing but slots); slots when it is expanded.
 *
 * **Layers.** Every layer has a `type` and may have an `id` (so others can
 * refer to it), `opacity`, `rotate` (degrees), `blend` (a blend mode),
 * `enter`, `exit`, and `when` / `unless`: the layer is left out when the
 * value of `when` is empty, or that of `unless` is not.
 * - `text`: `text`, `font` (`{ family, weight, italic, tracking, lineHeight,
 *   upper, scale }` — a font token; the layer's own `weight`, `italic`,
 *   `tracking`, `lineHeight`, `upper` go on top), `size`, `minSize`, `color`,
 *   `align`, `maxWidth`, `lines` (most lines; the text is set smaller, down
 *   to `minSize`, until it fits, then cut with an ellipsis), `shadow`
 *   `{ color, blur, x, y }`, `outline` `{ color, width }`, `plate`
 *   `{ color, pad, radius }` (a box behind it, `pad` in font sizes).
 * - `shape`: `shape` (rectangle, ellipse, polygon, star, line), `w`, `h`,
 *   `fill`, `stroke`, `strokeWidth`, `radius`, `sides`, `points`, `inner`.
 * - `image`: `src` (a path, usually `{logo.mark}`), `h`, and `w` as its
 *   widest; it keeps its proportions.
 * - `generator`: `generator` (a generator of the compositor's catalog),
 *   `params` (its parameters), `lengths` (parameters given in units),
 *   `animate` (`{ "<param>": [from, to] }`, over the layer's whole time),
 *   `seed`. It fills the frame.
 *
 * **Placement.** A layer is placed in one of four ways:
 * - `in: "<group>"` — a member of a group: a stack of its members, top to
 *   bottom, that closes up around those that are there. A group has `at`,
 *   `x`, `y`, `inside` (as below), `gap`, `align` (left, center, right),
 *   `pad` (`n` or `[x, y]`: room around the stack — a plate `around` the
 *   group covers it) and `maxWidth`. A member's own `gap` replaces the
 *   group's before it. A stack too tall for its place is set smaller.
 * - `at: "<anchor>"` with offsets `x`, `y` — held at an anchor (`top-left`,
 *   `top`, `top-right`, `left`, `center`, `right`, `bottom-left`, `bottom`,
 *   `bottom-right`) of the box named by `inside`: `safe` (the frame inside
 *   its margins, the default — what is placed there never leaves it),
 *   `frame`, a layer or a group.
 * - `around: "<box>"` with `pad` — as large as that box and its padding:
 *   plates. `around: "frame"` covers the picture.
 * - `beside: "<box>"` with `side` (left, right, top, bottom), `gap` and
 *   `align` along it — next to that box. A shape without a size of its own
 *   is a bar: `thickness` across, `span` × the side's length along.
 * A layer placed by a box that is absent is absent too.
 *
 * **Motion.** `enter` and `exit` are a motion's name or `{ motion, delay,
 * duration, by, ease, stagger, travel, angle }`. Motions: `none`, `fade`,
 * `slide-up`, `slide-down`, `slide-left`, `slide-right`, `scale`, `wipe`,
 * and for text `type` (type-on) and `blur`. An entrance starts `delay`
 * seconds after the element's start; an exit is over `delay` seconds
 * before its end — so an element arrives and leaves the same way however
 * long it is held. `by` (block, line, word, char) is the unit of text that
 * moves, the whole entrance taking `duration`; `travel` is how far a slide
 * comes from, in units, or `"out"` for from outside the frame; `angle`
 * turns a wipe. The kit's `motion.by` and `motion.ease` apply where a layer
 * names none, and its `motion.speed` divides every time.
 *
 * **Formats.** `formats.wide` / `tall` / `square` change fields of groups
 * and layers (by id), and `margin`, for a frame of that shape — chosen from
 * the frame an element is expanded in, so a clip lays itself out anew when
 * its document changes shape.
 *
 * Reading: `normalizeElement`, `normalizeDesign` (`normalize.js`,
 * `fields.js`). Checking: `validateDesign` (`validate.js`). From element to
 * design: `resolveElement`. From design to clips: `expandElement`. Where an
 * element is in its frame at rest: `elementBounds`.
 * Isomorphic and pure.
 * @module utils/brand/element
 */

export {
  ANCHORS,
  FORMATS,
  KINDS,
  LAYER_TYPES,
  MOTIONS,
  SHAPES,
  SIDES,
  formatOf,
} from './vocabulary.js';
export { elementBounds } from './bounds.js';
export { GROUP_FIELDS, LAYER_FIELDS } from './fields.js';
export { normalizeDesign, normalizeElement } from './normalize.js';
export { resolveElement } from './resolve.js';
export { coverTime, expandElement } from './expand.js';
export { estimateMeasure } from './measure.js';
export { elementNeeds } from './needs.js';
export { validateDesign } from './validate.js';
