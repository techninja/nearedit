/**
 * The host environment as compositor modules see it. A host (the browser
 * preview, the server render) supplies the four members of
 * docs/app-spec/COMPOSITOR.md § The host environment; the core wraps it once
 * so that a missing optional member behaves like "nothing available" and so
 * that modules can borrow pooled scratch surfaces. Isomorphic.
 * @module utils/compose/host
 */

import { createPool } from './pool.js';

/**
 * What a host provides.
 * @typedef {Object} HostEnv
 * @property {(width: number, height: number) => any} createCanvas - A canvas with a 2D context
 * @property {(path: string) => any} [image] - The decoded still or sprite for a
 *   media path (something `drawImage` takes, with `width` and `height`), or null while it loads
 * @property {(clip: any, sourceTime: number) => any} [frameOf] - The footage frame
 *   of a clip (anything `drawImage` takes), or null when there is none
 * @property {(font: string, text: string) => boolean} [fontReady] - False while
 *   a font still has to load
 * @property {(fonts: any[]) => void} [fonts] - Make a document's own font
 *   files (`edl.fonts`) known under their family names. Called with the
 *   table of every frame that has one, so it must cost nothing for a table
 *   it has seen; a file that cannot be used is reported once and its text
 *   falls back to the bundled sans-serif
 */

/**
 * What generators and effects receive as `env`: the host's members, plus
 * `scratch`.
 * @typedef {Object} ComposeEnv
 * @property {(width: number, height: number) => any} createCanvas - A new canvas.
 *   Prefer `scratch`: creating canvases every frame is slow
 * @property {(path: string) => any} image
 * @property {(clip: any, sourceTime: number) => any} frameOf
 * @property {(font: string, text: string) => boolean} fontReady
 * @property {(fonts: any[]) => void} fonts
 * @property {(width?: number, height?: number) => import('./pool.js').Surface} scratch -
 *   A blank pooled surface `{ canvas, ctx, width, height }`, frame-sized by
 *   default. It is taken back when the module's `draw` / `apply` returns
 */

/**
 * @typedef {Object} Compose
 * @property {import('./pool.js').Pool} pool
 * @property {ComposeEnv} env
 */

/** @type {WeakMap<object, Compose>} */
const hosts = new WeakMap();

/**
 * The pool and module environment that belong to a host environment —
 * created on first use and kept for as long as the host object lives.
 * @param {HostEnv} host
 * @returns {Compose}
 */
export function composeFor(host) {
  let compose = hosts.get(host);
  if (!compose) {
    const pool = createPool((width, height) => host.createCanvas(width, height));
    compose = {
      pool,
      env: {
        createCanvas: (width, height) => host.createCanvas(width, height),
        image: (path) => (path && host.image ? host.image(path) || null : null),
        frameOf: (clip, sourceTime) =>
          host.frameOf ? host.frameOf(clip, sourceTime) || null : null,
        fontReady: (font, text) => (host.fontReady ? host.fontReady(font, text) !== false : true),
        fonts: (fonts) => void (host.fonts && host.fonts(fonts)),
        scratch: (width, height) => pool.lease(width, height),
      },
    };
    hosts.set(host, compose);
  }
  return compose;
}

/** @type {Set<string>} */
const warned = new Set();

/**
 * Log a problem once, however many frames meet it.
 * @param {string} key
 * @param {string} message
 */
export function warnOnce(key, message) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[compose] ${message}`);
}

/**
 * Natural size of anything `drawImage` takes: a video element reports it as
 * `videoWidth`, an image element as `naturalWidth`, everything else as `width`.
 * @param {any} picture
 * @returns {{ width: number, height: number }}
 */
export function pictureSize(picture) {
  return {
    width: picture?.videoWidth || picture?.naturalWidth || picture?.width || 0,
    height: picture?.videoHeight || picture?.naturalHeight || picture?.height || 0,
  };
}
