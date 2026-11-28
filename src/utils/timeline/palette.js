/**
 * The timeline's colours and fonts, read from the design tokens so the
 * canvas follows the theme. Canvas code never hard-codes a colour: it asks
 * for the palette, and the stage drops its cached copy when the theme
 * changes.
 * @module utils/timeline/palette
 */

/** Palette key → CSS custom property. */
const TOKENS = {
  bg: '--color-timeline-bg',
  ruler: '--color-timeline-ruler',
  lane: '--color-timeline-lane',
  laneAlt: '--color-timeline-lane-alt',
  grid: '--color-timeline-grid',
  video: '--color-clip-video',
  audio: '--color-clip-audio',
  image: '--color-clip-image',
  title: '--color-clip-title',
  generator: '--color-clip-generator',
  web: '--color-clip-web',
  placeholder: '--color-clip-placeholder',
  clipText: '--color-clip-text',
  playhead: '--color-playhead',
  cursor: '--color-cursor',
  selection: '--color-selection',
  snap: '--color-snap',
  marker: '--color-marker',
  region: '--color-success',
  warning: '--color-warning',
  loop: '--color-loop',
  text: '--color-text',
  muted: '--color-text-muted',
  primary: '--color-primary',
  sans: '--font-sans',
  mono: '--font-mono',
};

/** @typedef {Record<keyof typeof TOKENS, string>} Palette */

/**
 * Which token colours the hatching of a placeholder, and how the lines
 * lean, for each intent (EDL.md § Clip).
 * @type {Record<string, { color: keyof typeof TOKENS, slant: number }>}
 */
export const INTENT_HATCH = {
  narration: { color: 'audio', slant: 1 },
  broll: { color: 'video', slant: -1 },
  sfx: { color: 'image', slant: 1 },
  music: { color: 'marker', slant: -1 },
  title: { color: 'title', slant: 1 },
  transition: { color: 'snap', slant: -1 },
};

/**
 * Read the palette as it applies to an element (so a themed ancestor wins).
 * @param {Element} element
 * @returns {Palette}
 */
export function readPalette(element) {
  const style = getComputedStyle(element);
  const palette = /** @type {Palette} */ ({});
  for (const [key, token] of Object.entries(TOKENS)) {
    palette[key] = style.getPropertyValue(token).trim();
  }
  return palette;
}

/**
 * Call back whenever the theme may have changed: the `data-theme`
 * attribute, a class or inline style on the root element, or the system
 * colour scheme.
 * @param {() => void} onChange
 * @returns {() => void} Stop watching
 */
export function watchTheme(onChange) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'class', 'style'],
  });
  const scheme = window.matchMedia('(prefers-color-scheme: dark)');
  scheme.addEventListener('change', onChange);
  return () => {
    observer.disconnect();
    scheme.removeEventListener('change', onChange);
  };
}
