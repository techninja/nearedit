/**
 * Shared JSDoc types of brand kits. No runtime code.
 * Field semantics: docs/app-spec/BRAND.md; the element language:
 * `element/index.js`.
 * @module utils/brand/types
 */

/**
 * A kit's tokens, by group: `color`, `font`, `logo`, `shape`, `space`,
 * `motion`, `sound` (see `TOKEN_SCHEMA`). A kit holds only what it sets;
 * an effective kit holds every token.
 * @typedef {Record<string, Record<string, any>>} Tokens
 */

/**
 * A brand kit as a file holds it, or — after `resolveKit` — the effective
 * kit: complete, with `chain` naming the kits it was made from.
 * @typedef {Object} Kit
 * @property {string} id
 * @property {string} name
 * @property {string} extends - Another kit's id, `builtin:<id>`, or ''
 * @property {Tokens} tokens
 * @property {import('./fontTable.js').FontFace[]} fonts - Font files the kit brings
 * @property {Record<string, Element>} elements - By element id
 * @property {Record<string, string>} defaults - What the director and the
 *   tools reach for: role (`captions`, `intro`, `outro`, `bug`…) → element id
 * @property {string[]} [chain] - Effective kits only: ids, child first
 */

/**
 * One blank of an element.
 * @typedef {Object} Slot
 * @property {string} [label]
 * @property {string} [sample] - What a thumbnail shows
 * @property {boolean} [optional] - May be left empty; the layout closes up
 * @property {number} [lines] - A form shows this many lines for it
 * @property {number} [max] - Longest text, characters
 */

/**
 * One layer of an element or a design — a text, a shape, a picture or a
 * generator. The fields are listed in `element/index.js`.
 * @typedef {Record<string, any> & { type: 'text'|'shape'|'image'|'generator', id?: string }} Layer
 */

/**
 * A design with blanks, as a kit defines it: written with token references.
 * @typedef {Object} Element
 * @property {string} label
 * @property {'overlay'|'segment'|'transition'} kind
 * @property {number} [duration] - Seconds it lasts when placed
 * @property {number} [minDuration] - Shortest it should be made
 * @property {number} [cover] - Transitions: the share of its length at
 *   which the frame is covered, 0..1
 * @property {number|string} [margin] - Safe margin, units; the kit's `space.margin` by default
 * @property {Record<string, Slot>} slots
 * @property {Record<string, Record<string, any>>} [groups] - Stacks, by id
 * @property {Layer[]} layers - Back to front
 * @property {Record<string, { margin?: number|string, groups?: Record<string, any>,
 *   layers?: Record<string, any> }>} [formats] - Adjustments for `tall` and
 *   `square` (and `wide`) frames
 */

/**
 * An element with every token filled in: what an element clip carries. It
 * is self-contained — it draws with no kit at hand.
 * @typedef {Object} Design
 * @property {'overlay'|'segment'|'transition'} kind
 * @property {number} [duration]
 * @property {number} [minDuration]
 * @property {number} [cover]
 * @property {number} [margin]
 * @property {string[]} slots - The names of its blanks
 * @property {{ by?: string, ease?: string, speed?: number }} [motion] - What
 *   a layer's motion takes when it does not say
 * @property {Record<string, Record<string, any>>} [groups]
 * @property {Layer[]} layers
 * @property {Record<string, any>} [formats]
 * @property {import('./fontTable.js').FontFace[]} [fonts] - Font files its text needs
 */

/**
 * What is filled into the blanks of an element: slot name → text.
 * @typedef {Record<string, string>} Slots
 */

/**
 * The `element` field of a clip (docs/app-spec/EDL.md § element).
 * @typedef {Object} ElementBlock
 * @property {{ id: string, key: string }} kit - The kit it came from and its revision
 * @property {string} id - The element's id in that kit
 * @property {Slots} slots
 * @property {Design} design
 */

/**
 * What a host tells `expandElement`.
 * @typedef {Object} ExpandOptions
 * @property {number} duration - Seconds the element lasts
 * @property {{ width: number, height: number }} frame - Output size, pixels
 * @property {(text: string, style: { fontFamily: string, fontSize: number, weight: number,
 *   italic: boolean, letterSpacing: number, fonts?: any }) => number} [measure] - Width of
 *   a run of text, output pixels, letter spacing included
 * @property {(path: string) => { width: number, height: number } | null} [sizeOf] - Natural
 *   size of a picture, or null while it is not known
 * @property {import('./fontTable.js').FontFace[]} [fonts] - The document's font table
 * @property {(message: string) => void} [warn]
 */

/**
 * A problem found in a kit or a design.
 * @typedef {{ path: string, message: string, level: 'error'|'warning' }} Problem
 */

export {};
