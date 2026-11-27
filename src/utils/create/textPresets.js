/**
 * Ready-made text styles for the Create tab: a title, a lower third, a
 * caption, a big number and credit lines. Each is a title clip with a
 * style, a place in the frame and an entrance; sizes are fractions of the
 * frame height, so a preset looks the same at any output resolution.
 * Pure and isomorphic.
 * @module utils/create/textPresets
 */

/**
 * @typedef {Object} TextPreset
 * @property {string} id
 * @property {string} label
 * @property {string} description
 * @property {number} duration - Seconds
 * @property {number} close - How much closer its thumbnail is framed, so
 *   small text can be read on a tile (1 = the whole frame)
 * @property {(width: number, height: number) => { text: Record<string, any>,
 *   transform?: Record<string, any> }} build - The look at an output size
 */

/** @type {(value: number) => number} */
const px = (value) => Math.round(value);

/** @type {TextPreset[]} */
export const TEXT_PRESETS = [
  {
    id: 'title',
    label: 'Title',
    description: 'A big centred headline that rises in',
    duration: 5,
    close: 1.6,
    build: (_w, h) => ({
      text: {
        content: 'Your title',
        fontFamily: 'Inter',
        weight: 900,
        fontSize: px(h * 0.13),
        letterSpacing: px(-h * 0.003),
        shadowBlur: px(h * 0.02),
        shadowY: px(h * 0.006),
        shadowColor: '#000000',
        animateIn: { type: 'slide-up', duration: 0.6, by: 'word', stagger: 0.08, ease: 'ease-out' },
        animateOut: { type: 'fade', duration: 0.4, by: 'block', stagger: 0, ease: 'ease-in' },
      },
    }),
  },
  {
    id: 'lower-third',
    label: 'Lower third',
    description: 'Name and role on a bar, lower left',
    duration: 5,
    close: 3.2,
    build: (w, h) => ({
      text: {
        content: 'Full Name\nRole or place',
        fontFamily: 'Inter',
        weight: 700,
        fontSize: px(h * 0.045),
        align: 'left',
        lineHeight: 1.25,
        background: '#0f172ae6',
        boxPadding: 0.5,
        boxRadius: px(h * 0.008),
        animateIn: {
          type: 'slide-right',
          duration: 0.5,
          by: 'block',
          stagger: 0,
          ease: 'ease-out',
        },
        animateOut: { type: 'fade', duration: 0.3, by: 'block', stagger: 0, ease: 'ease-in' },
      },
      transform: { x: px(-w * 0.3), y: px(h * 0.32) },
    }),
  },
  {
    id: 'caption',
    label: 'Caption',
    description: 'A subtitle line at the bottom, wrapped to the frame',
    duration: 3,
    close: 2.2,
    build: (w, h) => ({
      text: {
        content: 'A caption for what is being said',
        fontFamily: 'Inter',
        weight: 700,
        fontSize: px(h * 0.042),
        maxWidth: px(w * 0.8),
        background: '#000000b3',
        boxPadding: 0.3,
        boxRadius: px(h * 0.006),
        animateIn: { type: 'fade', duration: 0.15, by: 'block', stagger: 0, ease: 'linear' },
      },
      transform: { y: px(h * 0.38) },
    }),
  },
  {
    id: 'big-number',
    label: 'Big number',
    description: 'A figure that pops in, with a line under it',
    duration: 4,
    close: 1.2,
    build: (_w, h) => ({
      text: {
        content: '87%\nof it, in one figure',
        fontFamily: 'Bebas Neue',
        fontSize: px(h * 0.2),
        lineHeight: 0.95,
        color: '#fde047',
        outlineColor: '#000000',
        outlineWidth: px(h * 0.004),
        animateIn: { type: 'scale', duration: 0.6, by: 'line', stagger: 0.2, ease: 'back-out' },
      },
    }),
  },
  {
    id: 'credits',
    label: 'Credit lines',
    description: 'Centred lines that fade in one after another',
    duration: 8,
    close: 2.4,
    build: (_w, h) => ({
      text: {
        content: 'Directed by\nYour Name\n\nMusic\nAnother Name',
        fontFamily: 'Playfair Display',
        bold: false,
        fontSize: px(h * 0.05),
        lineHeight: 1.5,
        animateIn: { type: 'fade', duration: 0.8, by: 'line', stagger: 0.35, ease: 'ease-out' },
        animateOut: { type: 'fade', duration: 0.6, by: 'block', stagger: 0, ease: 'ease-in' },
      },
    }),
  },
];

/**
 * @param {string} id
 * @returns {TextPreset|undefined}
 */
export const textPreset = (id) => TEXT_PRESETS.find((preset) => preset.id === id);
