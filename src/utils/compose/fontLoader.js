/**
 * On-demand font loading for a host that loads fonts through `@font-face`
 * rules (the browser). The set of faces is passed in — `document.fonts` —
 * so this module stays free of globals.
 *
 * It decides readiness from the faces themselves (family, weight, style,
 * `unicode-range`, `status`) rather than from `FontFaceSet.check()`: Chrome
 * answers `check()` with true whenever a font of that name is installed on
 * the machine, even while the bundled file has not loaded, and the canvas
 * would then draw one frame in a fallback font.
 * Isomorphic. Contract: docs/app-spec/COMPOSITOR.md § The host environment.
 * @module utils/compose/fontLoader
 */

/** Font checks remembered before the list is started afresh. */
const MAX_KEYS = 500;
/** What `fontString()` produces: `[italic ]<weight> <size>px <families>`. */
const SHORTHAND = /^(italic )?(\d+) [\d.]+px (.+)$/;
const unquote = (/** @type {string} */ name) => name.trim().replace(/^["']|["']$/g, '');

/** @type {WeakMap<object, number[][]>} */
const parsed = new WeakMap();

/**
 * The code point ranges of a face's `unicode-range`.
 * @param {{ unicodeRange?: string }} face
 * @returns {number[][]} `[from, to]` pairs
 */
function rangesOf(face) {
  if (!parsed.has(face)) {
    const ranges = String(face.unicodeRange || 'U+0-10FFFF')
      .split(',')
      .map((range) => {
        const [from, to = from] = range.trim().replace(/^U\+/i, '').split('-');
        return [parseInt(from.replace(/\?/g, '0'), 16), parseInt(to.replace(/\?/g, 'F'), 16)];
      });
    parsed.set(face, ranges);
  }
  return parsed.get(face);
}

/**
 * The faces of a set that drawing `text` in `font` needs.
 * @param {Iterable<any>} fontSet
 * @param {string} font - As `fontString()` writes it
 * @param {string} text
 * @returns {any[]|null} null when the font value cannot be read
 */
export function facesFor(fontSet, font, text) {
  const match = SHORTHAND.exec(font);
  if (!match) return null;
  const style = match[1] ? 'italic' : 'normal';
  const weight = Number(match[2]);
  const families = match[3].split(',').map(unquote);
  const points = [...new Set(Array.from(text, (ch) => ch.codePointAt(0)))];
  return [...fontSet].filter((face) => {
    const at = families.indexOf(unquote(face.family));
    if (at < 0) return false;
    // Only the first family is styled; the fallbacks come in one face.
    const [low, high = low] = String(face.weight).replace('normal', '400').split(' ').map(Number);
    if (at === 0 && (face.style !== style || weight < low || weight > high)) return false;
    return points.some((p) => rangesOf(face).some(([from, to]) => p >= from && p <= to));
  });
}

/**
 * Create the `fontReady(font, text)` of a host environment. A font counts
 * as ready once every face the text needs has loaded — or failed, so a
 * missing file falls back instead of hiding a title for good.
 * @param {any} fontSet - A FontFaceSet: iterable of faces, with `load()` and `check()`
 * @param {() => void} onArrive - Called when faces finished loading
 * @returns {(font: string, text: string) => boolean}
 */
export function createFontLoader(fontSet, onArrive) {
  /** @type {Set<string>} */
  const settled = new Set();
  /** @type {Set<string>} */
  const loading = new Set();
  const settle = (/** @type {string} */ key) => {
    if (settled.size >= MAX_KEYS) settled.clear();
    settled.add(key);
  };
  return (font, text) => {
    // The size does not decide which files are needed; leave it out of the key.
    const key = `${font.replace(/[\d.]+px/, '')}\n${text}`;
    if (settled.has(key)) return true;
    const faces = facesFor(fontSet, font, text);
    const here = faces
      ? faces.every((face) => face.status === 'loaded' || face.status === 'error')
      : fontSet.check(font, text);
    if (here) {
      settle(key);
      return true;
    }
    if (!loading.has(key)) {
      loading.add(key);
      fontSet
        .load(font, text)
        .catch((/** @type {Error} */ err) =>
          console.warn(`[compose] could not load font ${font}: ${err.message}`),
        )
        .finally(() => {
          loading.delete(key);
          settle(key);
          onArrive();
        });
    }
    return false;
  };
}
