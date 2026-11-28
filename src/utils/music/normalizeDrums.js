/**
 * Normalising what only a drum part has: its kit, its grid and its lanes.
 * Isomorphic and pure.
 * @module utils/music/normalizeDrums
 */

import * as read from '#utils/web/coerce.js';
import { DRUM_NAMES } from './catalog/drums.js';
import { DEFAULT_KIT, KITS } from './catalog/kits.js';
import { fitLane, isSilentLane, laneLength } from './lanes.js';
import { SONG_LIMITS as LIMITS, STEP_COUNTS } from './limits.js';

/** Other names a lane is known by, lower case. */
const ALIASES = {
  bd: 'kick',
  bassdrum: 'kick',
  sd: 'snare',
  cp: 'clap',
  rimshot: 'rim',
  hh: 'hat',
  hihat: 'hat',
  closedhat: 'hat',
  ch: 'hat',
  oh: 'openHat',
  openhihat: 'openHat',
  lowtom: 'tomLow',
  midtom: 'tomMid',
  hightom: 'tomHigh',
  cymbal: 'crash',
  cb: 'cowbell',
};
const BY_LOWER = Object.fromEntries(DRUM_NAMES.map((name) => [name.toLowerCase(), name]));

/**
 * @param {string} name - A lane as it was written
 * @returns {string|undefined} The drum it means
 */
export function drumName(name) {
  const lower = typeof name === 'string' ? name.toLowerCase().replace(/[\s_-]/g, '') : '';
  return Object.hasOwn(BY_LOWER, lower) ? BY_LOWER[lower] : ALIASES[lower];
}

/**
 * @param {Record<string, any>} from - A drum part as written
 * @param {number|undefined} bars - Its loop, when it says
 * @returns {Record<string, any>} `kit`, `steps`, `bars`, `lanes`
 */
export function drumFields(from, bars) {
  const kit = read.textOf(read.own(from, 'kit'), 20);
  const steps = read.toNumber(read.own(from, 'steps'), 16);
  const perBar = STEP_COUNTS.includes(steps) ? steps : 16;
  /** @type {Record<string, any>} */
  const written = {};
  for (const [name, lane] of Object.entries(read.record(read.own(from, 'lanes'))).slice(0, 100)) {
    const drum = drumName(name);
    if (drum && typeof lane === 'string' && written[drum] === undefined) written[drum] = lane;
  }
  const longest = Math.max(
    0,
    ...Object.values(written).map((lane) => laneLength(lane.slice(0, 40000))),
  );
  const loop = bars ?? Math.min(LIMITS.bars[1], Math.max(1, Math.ceil(longest / perBar)));
  /** @type {Record<string, string>} */
  const lanes = {};
  for (const name of DRUM_NAMES) {
    const lane = written[name] === undefined ? '' : fitLane(written[name], perBar * loop);
    if (!isSilentLane(lane)) lanes[name] = lane;
  }
  return { kit: Object.hasOwn(KITS, kit) ? kit : DEFAULT_KIT, steps: perBar, bars: loop, lanes };
}
