/**
 * The birth schedule — which particles exist at a moment, and how old each
 * is. Nothing is simulated: the stream's particle `n` is born somewhere
 * inside the `n`-th slot of `1 / rate` seconds (where, is a random number
 * of its own), a burst's particles are all born at the burst's instant, and
 * a particle lives for a share of `lifetime` that is again its own. So the
 * particles alive at clip-local time `t` are found by looking at the slots
 * and bursts of the last `lifetime` seconds, whatever was drawn before.
 * Isomorphic and pure. Reference: docs/app-spec/PARTICLES.md § Schedule.
 * @module utils/compose/generators/particles/schedule
 */

import { hash, rand } from '#utils/compose/random.js';
import { KEY, SALT } from './keys.js';

/**
 * The schedule of a parameter set, after the cap on particles alive.
 * @typedef {Object} Plan
 * @property {number} rate - Stream particles per second
 * @property {number} burst - Particles per burst
 * @property {number} every - Seconds from one burst to the next; 0 = one burst
 * @property {number} life - Longest lifetime, seconds
 * @property {number} jitter - Share of the lifetime that varies, 0..1
 * @property {number} until - Clip-local time emission stops at (may be Infinity)
 * @property {boolean} prewarm - Emission has always been running
 * @property {number} stream - Seed of the stream's particles
 * @property {number} bursts - Seed of the bursts' particles
 * @property {number} kept - Share of the asked-for particles the cap lets through
 */

/**
 * Called for each particle alive.
 * @callback Visit
 * @param {number} seed - The stream's or the bursts'; with `index` and
 *   `group` it names the particle
 * @param {number} index - Number in the stream, or within its burst
 * @param {number} group - 0 in the stream, the number of the burst otherwise
 * @param {number} age - Seconds since birth
 * @param {number} span - Its lifetime, seconds
 * @param {number} born - Clip-local time of birth
 * @returns {void}
 */

/**
 * Work out the schedule. When rate × lifetime plus the bursts that overlap
 * would put more than `maxParticles` in the air, rate and burst size are
 * scaled down together: fewer particles are born, each still lives its
 * whole life, and the count can never pass the cap.
 * @param {Record<string, any>} p - Resolved parameters
 * @returns {Plan}
 */
export function planOf(p) {
  const life = p.lifetime;
  const every = p.burstEvery;
  const burst = Math.round(p.burst);
  const overlapping = every > 0 ? Math.ceil(life / every) : 1;
  const demand = p.rate * life + burst * overlapping;
  // A window of `life` seconds can touch two slots more than rate × life.
  const room = Math.max(0, Math.round(p.maxParticles) - 2);
  const kept = demand > room ? room / demand : 1;
  return {
    rate: p.rate * kept,
    burst: Math.floor(burst * kept),
    every,
    life,
    jitter: p.lifetimeJitter,
    until: p.emitFor > 0 ? p.emitFor : Infinity,
    prewarm: p.prewarm === true,
    stream: hash(p.seed, SALT.STREAM),
    bursts: hash(p.seed, SALT.BURSTS),
    kept,
  };
}

/**
 * Visit every particle alive at a time, oldest of the stream first, then
 * the bursts in order.
 * @param {Plan} plan
 * @param {number} t - Clip-local time, seconds
 * @param {Visit} visit
 */
export function eachAlive(plan, t, visit) {
  const { rate, life, jitter, until, every } = plan;
  const start = plan.prewarm ? -Infinity : 0;
  if (rate > 0) {
    const first = Math.max(start, Math.floor((t - life) * rate));
    const last = Math.min(Math.floor(t * rate), Math.ceil(until * rate) - 1);
    for (let n = first; n <= last; n++) {
      const born = (n + rand(plan.stream, n, KEY.BIRTH)) / rate;
      const age = t - born;
      if (age < 0) continue;
      const span = life * (1 - jitter * rand(plan.stream, n, KEY.LIFE));
      if (age < span) visit(plan.stream, n, 0, age, span, born);
    }
  }
  if (!(plan.burst > 0)) return;
  const repeats = every > 0;
  const first = repeats ? Math.max(start, Math.floor((t - life) / every) + 1) : 0;
  const last = repeats ? Math.min(Math.floor(t / every), Math.ceil(until / every) - 1) : 0;
  for (let b = first; b <= last; b++) {
    const born = repeats ? b * every : 0;
    const age = t - born;
    if (age < 0 || age >= life) continue;
    for (let j = 0; j < plan.burst; j++) {
      const span = life * (1 - jitter * rand(plan.bursts, j, KEY.LIFE, b));
      if (age < span) visit(plan.bursts, j, b, age, span, born);
    }
  }
}

/**
 * How many particles are alive at a time.
 * @param {Record<string, any>} p - Resolved parameters (with `seed`)
 * @param {number} t - Clip-local time, seconds
 * @returns {number}
 */
export function countAlive(p, t) {
  let count = 0;
  eachAlive(planOf(p), t, () => count++);
  return count;
}
