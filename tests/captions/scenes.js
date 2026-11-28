/**
 * What the caption tests draw: a paragraph timed like speech, backdrops to
 * draw captions over, and the three frame formats. Loaded by Node and, for
 * the parity test, by the page in Chromium — so nothing here may import a
 * Node module or touch the DOM.
 * @module tests/captions/scenes
 */

/** Short and long words, numbers, punctuation, a dash on its own, an emoji. */
export const PARAGRAPH =
  "So, here's the thing: in 2024 we shipped 37 features, and honestly? It was " +
  'unbelievably hard. But the team — all 12 of us — never gave up. I am proud. 🎉 ' +
  'Thanks for watching, see you tomorrow!';

/** Output sizes by format. */
export const FORMATS = { wide: [1920, 1080], tall: [1080, 1920], square: [1080, 1080] };

/**
 * Words timed at a speaking pace: about 55 ms a character, a short pause
 * after a comma, a long one after a sentence.
 * @param {string} text
 * @param {number} [from=0.4] - When the first word starts, seconds
 * @returns {[number, number, string][]}
 */
export function timed(text, from = 0.4) {
  const ms = (/** @type {number} */ v) => Math.round(v * 1000) / 1000;
  const symbol = (/** @type {string|undefined} */ w) => w !== undefined && !/[\p{L}\p{N}]/u.test(w);
  const all = text.split(/\s+/).filter(Boolean);
  /** @type {[number, number, string][]} */
  const words = [];
  let at = from;
  all.forEach((word, i) => {
    const length = Math.max(0.12, Math.min(0.75, 0.055 * [...word].length + 0.08));
    words.push([ms(at), ms(at + length), word]);
    at += length + 0.03;
    if (symbol(all[i + 1])) return; // an emoji or a dash follows at once
    const ended = /[.!?]$/.test(word) || (symbol(word) && /[.!?]$/.test(all[i - 1] || ''));
    if (ended) at += 0.55;
    else if (/[,:;—]$/.test(word)) at += 0.22;
  });
  return words;
}

/** The paragraph's words. */
export const WORDS = timed(PARAGRAPH);

/**
 * A small generator of repeatable numbers, 0..1.
 * @param {number} seed
 * @returns {() => number}
 */
function sequence(seed) {
  let state = seed >>> 0;
  return () => (state = (state * 1664525 + 1013904223) >>> 0) / 4294967296;
}

const CONFETTI = ['#facc15', '#fb7185', '#38bdf8', '#4ade80', '#ffffff', '#f97316', '#111827'];

/**
 * Paint a picture to draw captions over, with nothing but gradients and
 * rectangles (which both canvases paint alike): `photo` — a soft scene with
 * skin, sky and a white shirt; `bright` — a light, busy one; `dark`.
 * @param {any} ctx
 * @param {'photo'|'bright'|'dark'} kind
 * @param {number} width
 * @param {number} height
 */
export function backdrop(ctx, kind, width, height) {
  const unit = Math.min(width, height) / 100;
  const across = ctx.createLinearGradient(0, 0, width, height);
  const stops = {
    photo: ['#8fb6d9', '#e8c9a8', '#7a4b2a'],
    bright: ['#fff7cc', '#ffffff', '#ffd1e8'],
    dark: ['#05070d', '#0b1326', '#161022'],
  }[kind];
  stops.forEach((color, i) => across.addColorStop(i / 2, color));
  ctx.fillStyle = across;
  ctx.fillRect(0, 0, width, height);
  const next = sequence(kind.length * 7);
  const count = kind === 'bright' ? 220 : 40;
  for (let i = 0; i < count; i++) {
    const size = (1 + next() * 7) * unit;
    const [x, y] = [next() * width, next() * height];
    const color = CONFETTI[Math.floor(next() * CONFETTI.length)];
    ctx.fillStyle = kind === 'bright' ? color : kind === 'dark' ? '#ffffff14' : '#ffffff30';
    ctx.fillRect(x - size / 2, y - size / 4, size, size / 2 + (i % 2) * size);
  }
  if (kind !== 'photo') return;
  // A white shirt under a face-coloured block: the hardest ground for white letters.
  ctx.fillStyle = '#f4f1ea';
  ctx.fillRect(width * 0.2, height * 0.62, width * 0.6, height * 0.38);
  ctx.fillStyle = '#d9a37e';
  ctx.fillRect(width * 0.38, height * 0.18, width * 0.24, height * 0.36);
}

/**
 * The frame description of a canvas `width` wide in a format.
 * @param {'wide'|'tall'|'square'} format
 * @param {number} width - Canvas pixels
 * @returns {{ width: number, height: number, scale: number, outWidth: number,
 *   outHeight: number, fps: number }}
 */
export function frameOf(format, width) {
  const [outWidth, outHeight] = FORMATS[format];
  const height = Math.round((width * outHeight) / outWidth);
  return { width, height, scale: width / outWidth, outWidth, outHeight, fps: 30 };
}

/**
 * Draw a backdrop and the captions of one or more voices over it.
 * @param {any} ctx - A context of a canvas the size of `frame`
 * @param {typeof import('../../src/utils/captions/index.js')} captions - The library
 * @param {{ kind: 'photo'|'bright'|'dark', frame: ReturnType<typeof frameOf>, style: unknown,
 *   time: number, voices?: unknown[] }} scene - `voices` defaults to the paragraph
 */
export function drawScene(ctx, captions, scene) {
  backdrop(ctx, scene.kind, scene.frame.width, scene.frame.height);
  (scene.voices || [WORDS]).forEach((words, lane) => {
    captions.drawCaptionAt(ctx, words, scene.time, scene.style, scene.frame, lane);
  });
}
