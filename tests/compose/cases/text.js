/**
 * Reference documents: titles at rest, in several styles.
 * @module tests/compose/cases/text
 */

import { doc, gen, title } from '../build.js';

/** What every text case is drawn over. */
export const backdrop = () =>
  gen('bg', 'gradient', { angle: 120, color1: '#0f172a', color2: '#475569' });

/** A document with one title over the backdrop. */
export const titled = (
  /** @type {string} */ content,
  /** @type {object} */ text,
  /** @type {object} */ extra = {},
) => doc([[title('a', content, text, extra)], [backdrop()]]);

const line = (
  /** @type {string} */ id,
  /** @type {string} */ content,
  /** @type {object} */ text,
  /** @type {number} */ y,
) => [title(id, content, text, { transform: { y } })];

/**
 * @returns {Record<string, any>} Documents by case name
 */
export function textDocs() {
  return {
    'text-v2': titled('A plain v2 title\nin two lines', {}),
    'text-styled': titled('Styled & Spaced', {
      fontFamily: 'Playfair Display',
      italic: true,
      fontSize: 150,
      color: '#fef08a',
      background: '#1e1b4b',
      boxRadius: 40,
      boxPadding: 0.5,
      outlineColor: '#7c2d12',
      outlineWidth: 6,
      letterSpacing: 12,
    }),
    'text-wrap-left': titled(
      'Word wrap keeps every line inside the width, breaking antidisestablishmentarianism too.\n\nSecond paragraph.',
      {
        fontFamily: 'Inter',
        bold: false,
        fontSize: 64,
        maxWidth: 640,
        align: 'left',
        lineHeight: 1.5,
        background: '#00000080',
      },
    ),
    'text-families': doc([
      line('a', 'JetBrains Mono 123', { fontFamily: 'JetBrains Mono', fontSize: 80 }, -330),
      line('b', 'BEBAS NEUE', { fontFamily: 'Bebas Neue', fontSize: 170, color: '#f97316' }, -110),
      line('c', 'Caveat handwriting', { fontFamily: 'Caveat', fontSize: 150 }, 130),
      line('d', 'Inter Black Привет', { fontFamily: 'Inter', weight: 900, fontSize: 96 }, 350),
      [backdrop()],
    ]),
    'text-shadow': titled('Drop shadow', {
      fontSize: 200,
      shadowColor: '#000000b0',
      shadowBlur: 30,
      shadowX: 14,
      shadowY: 18,
      outlineWidth: 5,
      outlineColor: '#0ea5e9',
    }),
    // Fading as one picture: the outline must not show through the fill.
    'text-fade': titled(
      'Fading as one',
      { fontSize: 190, outlineWidth: 10, outlineColor: '#be123c', background: '#fde68a' },
      { fadeIn: 3 },
    ),
    'text-transformed': titled(
      'Rotated\nand scaled',
      { fontSize: 120, background: '#0f766e' },
      { transform: { rotation: -14, scaleX: 1.6, scaleY: 1.3, x: 200, y: -60, opacity: 0.9 } },
    ),
    'text-right-cropped': titled(
      'Right aligned\nand cropped',
      { fontSize: 150, align: 'right', background: '#1d4ed8' },
      { transform: { fit: 'contain', cropLeft: 0.3, cropBottom: 0.45 } },
    ),
  };
}

/**
 * Colour emoji, kept apart because it depends on the vendored emoji files:
 * the package's WOFF2 subsets draw nothing in either canvas, so
 * `scripts/vendor-fonts.js` ships its WOFF files instead.
 * @returns {any} A document
 */
export const emojiDoc = () => titled('Emoji 🎬🔥👍🏽 too', { fontSize: 170 });
