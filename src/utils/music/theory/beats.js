/**
 * Named drum patterns, as lane strings: one bar of sixteen steps unless a
 * pattern says otherwise, each with a fill — the bar that leads into the
 * next section. Isomorphic and pure.
 * @module utils/music/theory/beats
 */

/**
 * @typedef {Object} Beat
 * @property {string} label
 * @property {string} description
 * @property {number} steps - Steps per bar
 * @property {number} swing - The swing it is usually played with
 * @property {number[]} bpm - `[from, to]`: tempos it sits well at
 * @property {Record<string, string>} lanes - One bar
 * @property {Record<string, string>} fill - The lanes of a fill bar; a drum
 *   it does not name plays its usual bar
 */

/**
 * @param {string} label
 * @param {string} description
 * @param {number[]} feel - `[steps, swing, slowest, fastest]`
 * @param {Record<string, string>} lanes
 * @param {Record<string, string>} fill
 * @returns {Beat}
 */
function beat(label, description, [steps, swing, from, to], lanes, fill) {
  return Object.freeze({ label, description, steps, swing, bpm: [from, to], lanes, fill });
}

/** @type {Readonly<Record<string, Beat>>} */
export const BEATS = Object.freeze({
  fourOnTheFloor: beat(
    'Four on the floor',
    'A kick on every beat, claps on two and four, open hats in between: house, disco, techno',
    [16, 0, 115, 132],
    {
      kick: 'X...X...X...X...',
      clap: '....X.......X...',
      hat: 'x.o.x.o.x.o.x.o.',
      openHat: '..x...x...x...x.',
    },
    { kick: 'X...X...X...X.x.', clap: '....X.......X.xX', snare: '..........o.o.xX' },
  ),
  backbeat: beat(
    'Backbeat',
    'Kick on one and three, snare on two and four, steady eighths on the hat: rock and pop',
    [16, 0, 85, 135],
    { kick: 'X.......X.x.....', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.' },
    {
      kick: 'X.......X.......',
      snare: '....X...x.x.....',
      tomHigh: '..........xx....',
      tomMid: '............xx..',
      tomLow: '..............xX',
    },
  ),
  boomBap: beat(
    'Boom bap',
    'A lazy, swung kick against a hard snare: classic hip-hop',
    [16, 0.3, 80, 98],
    { kick: 'X......x.xx.....', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.' },
    { kick: 'X......x.x......', snare: '....X.....o.X.oX', openHat: '..............x.' },
  ),
  halfTime: beat(
    'Half-time',
    'The snare falls only on three, so the bar feels twice as long: slow and heavy',
    [16, 0, 120, 160],
    { kick: 'X.........x.....', snare: '........X.......', hat: 'x.x.x.x.x.x.x.x.' },
    { kick: 'X.........x...x.', snare: '........X...o.xX', tomLow: '.............x..' },
  ),
  breakbeat: beat(
    'Breakbeat',
    'A broken, syncopated kick and ghosted snares, after the funk breaks: jungle, big beat',
    [16, 0.1, 120, 172],
    { kick: 'X.x.......xx....', snare: '....X..o.o..X...', hat: 'x.x.x.x.x.x.x.x.' },
    { kick: 'X.x.......x.....', snare: '....X..o.oX.XoXX', crash: 'X...............' },
  ),
  trap: beat(
    'Trap',
    'A sparse, booming kick, a clap on three and hats that break into rolls',
    [32, 0, 130, 150],
    {
      kick: 'X.............x.....X...........',
      clap: '................X...............',
      hat: 'x...x...x...x.x.x...x...xxxxx...',
    },
    {
      kick: 'X.............x.....X.....x.....',
      clap: '................X...........X...',
      hat: 'x...x...x.x.x...xxxxxxxxx.x.xxxx',
      openHat: '............................x...',
    },
  ),
  bossa: beat(
    'Bossa nova',
    'A soft two-bar clave on the rim over a heartbeat kick and whispering hats',
    [16, 0, 100, 140],
    {
      kick: 'X.....x.X.....x.',
      rim: 'x..x..x...x..x..',
      hat: 'x.x.x.x.x.x.x.x.',
      shaker: 'o.o.o.o.o.o.o.o.',
    },
    {
      kick: 'X.....x.X.....x.',
      rim: 'x..x..x...x.x.x.',
      tomHigh: '............o.o.',
      tomMid: '.............o.o',
    },
  ),
});

/**
 * A drum part that plays a named pattern.
 * @param {string} name - A key of `BEATS`
 * @param {{ kit?: string, bars?: number, fillEvery?: number }} [opts] -
 *   `bars`: length of the part's loop (default 1); `fillEvery`: every that
 *   many bars the bar is the fill (default 0: never)
 * @returns {{ kind: 'drums', name: string, kit: string, steps: number, bars: number,
 *   lanes: Record<string, string> } | null} null for an unknown pattern
 */
export function drumPart(name, opts = {}) {
  const found = Object.hasOwn(BEATS, name) ? BEATS[name] : null;
  if (!found) return null;
  const bars = Math.min(64, Math.max(1, Math.round(opts.bars) || 1));
  const every = Math.round(opts.fillEvery) || 0;
  const rest = '.'.repeat(found.steps);
  /** @type {Record<string, string>} */
  const lanes = {};
  for (const drum of new Set([
    ...Object.keys(found.lanes),
    ...(every > 0 ? Object.keys(found.fill) : []),
  ])) {
    lanes[drum] = '';
    for (let bar = 0; bar < bars; bar++) {
      const filled = every > 0 && (bar + 1) % every === 0;
      lanes[drum] += (filled && found.fill[drum]) || found.lanes[drum] || rest;
    }
  }
  return {
    kind: 'drums',
    name: found.label,
    kit: opts.kit ?? '808',
    steps: found.steps,
    bars,
    lanes,
  };
}
