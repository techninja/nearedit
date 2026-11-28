/**
 * The arc of a score: what its sections are called and how much happens in
 * each. It opens quietly, builds, may fall back for a break, reaches its
 * peak in the last lift and winds down — and the `energy` parameter moves
 * the whole arc up or down.
 * Reference: docs/app-spec/DIRECTOR-SCORE.md § Sections. Isomorphic and pure.
 * @module utils/director/score/arc
 */

/** The kinds of section, and how much happens in each when the energy is 0.5. */
export const SECTION_ENERGY = Object.freeze({
  intro: 0.3,
  verse: 0.55,
  lift: 0.9,
  break: 0.3,
  outro: 0.45,
});

/** The names a section may have. */
export const SECTION_NAMES = Object.freeze(Object.keys(SECTION_ENERGY));

/** Other words for the kinds of section, as plans and people write them. */
const WORDS = {
  opening: 'intro',
  start: 'intro',
  beginning: 'intro',
  build: 'verse',
  buildup: 'verse',
  main: 'verse',
  body: 'verse',
  a: 'verse',
  chorus: 'lift',
  drop: 'lift',
  peak: 'lift',
  climax: 'lift',
  hook: 'lift',
  reveal: 'lift',
  b: 'lift',
  bridge: 'break',
  breakdown: 'break',
  pause: 'break',
  quiet: 'break',
  ending: 'outro',
  end: 'outro',
  close: 'outro',
  closing: 'outro',
  coda: 'outro',
};

/**
 * @param {any} name - A kind of section in any of its words: `Chorus`, `build-up`
 * @returns {string|null} One of `SECTION_NAMES`, or null
 */
export function sectionName(name) {
  if (typeof name !== 'string') return null;
  const word = name
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
    .replace(/\d+$/, '');
  if (SECTION_NAMES.includes(word)) return word;
  return Object.hasOwn(WORDS, word) ? WORDS[word] : null;
}

/**
 * What the sections of a score are called, in order: it opens with an
 * intro and closes with an outro, and between them verses, lifts and breaks
 * take turns so that the last thing before the outro is a lift.
 * @param {number} count
 * @returns {string[]}
 */
export function sectionNames(count) {
  if (count <= 1) return ['verse'];
  if (count === 2) return ['intro', 'lift'];
  const middle = Array.from({ length: count - 2 }, (_, i) => ['verse', 'lift', 'break'][i % 3]);
  middle[middle.length - 1] = 'lift';
  if (middle.length > 2 && middle[middle.length - 2] === 'lift')
    middle[middle.length - 2] = 'break';
  return ['intro', ...middle, 'outro'];
}

/**
 * The level of every section of an arc before the energy parameter: its
 * kind's, and 1 for the last of several lifts — the peak.
 * @param {string[]} names
 * @returns {number[]}
 */
export function arcLevels(names) {
  const peak = names.lastIndexOf('lift');
  return names.map((name, i) =>
    i === peak && names.indexOf('lift') !== peak ? 1 : (SECTION_ENERGY[name] ?? 0.55),
  );
}

/**
 * How much happens in a section: its level, moved by the energy asked for.
 * @param {number} level - 0 … 1: the section's own
 * @param {number} energy - 0 … 1: the parameter; 0.5 leaves the level as it is
 * @returns {number} 0.05 … 1
 */
export function shapeEnergy(level, energy) {
  const asked = Math.min(1, Math.max(0, Number.isFinite(energy) ? energy : 0.5));
  return Math.round(Math.min(1, Math.max(0.05, level * (0.5 + asked))) * 1000) / 1000;
}
