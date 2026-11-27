/**
 * Motion — where a particle is at an age, in closed form. From its birth
 * place it coasts with its launch velocity, slowed by drag; that path is
 * turned about the emitter by the swirl; gravity adds its fall (limited by
 * the same drag); turbulence adds a wander that starts at nothing. No step
 * depends on an earlier frame.
 *
 *   coast(a) = (1 − e^(−drag·a)) / drag          → a          without drag
 *   fall(a)  = (a − coast(a)) / drag             → a² / 2     without drag
 *   place(a) = turn(swirl·a)·(birth + v·coast) + travel + g·fall + wander
 *
 * Positions are output pixels relative to the emitter's centre.
 * Isomorphic and pure. Reference: docs/app-spec/PARTICLES.md § Motion.
 * @module utils/compose/generators/particles/motion
 */

import { hash, noise3, rand } from '#utils/compose/random.js';
import { place } from './emitter.js';
import { KEY, SALT } from './keys.js';

const RAD = Math.PI / 180;
/** Drag below this is no drag (the formulas divide by it). */
const NO_DRAG = 1e-4;

/**
 * What stays the same for every particle of a frame.
 * @typedef {ReturnType<typeof motionOf>} Motion
 */

/**
 * What a particle is launched with.
 * @typedef {Object} Birth
 * @property {number} x - Birth place on the emitter
 * @property {number} y
 * @property {number} vx - Launch velocity, pixels per second
 * @property {number} vy
 * @property {number} tx - How far the emitter had travelled by then
 * @property {number} ty
 * @property {number} born - Clip-local time of birth
 * @property {number} wx - The turbulence field at the birth place and time
 * @property {number} wy
 */

/**
 * @param {Record<string, any>} p - Resolved parameters
 * @param {import('#utils/compose/frame.js').Frame} frame
 */
export function motionOf(p, frame) {
  const turned = p.emitterRotation * RAD;
  return {
    shape: /** @type {string} */ (p.emitter),
    width: p.emitterWidth * frame.outWidth,
    height: p.emitterHeight * frame.outHeight,
    cos: Math.cos(turned),
    sin: Math.sin(turned),
    driftX: /** @type {number} */ (p.driftX),
    driftY: /** @type {number} */ (p.driftY),
    speed: /** @type {number} */ (p.speed),
    speedJitter: /** @type {number} */ (p.speedJitter),
    direction: p.direction * RAD,
    spread: p.spread * RAD,
    radial: /** @type {number} */ (p.radial),
    gravityX: /** @type {number} */ (p.gravityX),
    gravityY: /** @type {number} */ (p.gravityY),
    drag: /** @type {number} */ (p.drag),
    swirl: p.swirl * RAD,
    wander: /** @type {number} */ (p.turbulence),
    grain: /** @type {number} */ (p.turbulenceScale),
    pace: /** @type {number} */ (p.turbulenceSpeed),
    seedX: hash(p.seed, SALT.WANDER_X),
    seedY: hash(p.seed, SALT.WANDER_Y),
  };
}

/**
 * Launch a particle: its birth place, velocity and the rest of what its
 * whole path follows from.
 * @param {Motion} m
 * @param {number} seed
 * @param {number} index
 * @param {number} group
 * @param {number} born - Clip-local time of birth
 * @param {Birth} out
 */
export function launch(m, seed, index, group, born, out) {
  const u = rand(seed, index, KEY.PLACE_A, group);
  place(m.shape, m.width, m.height, u, rand(seed, index, KEY.PLACE_B, group), out);
  const x = out.x * m.cos - out.y * m.sin;
  const y = out.x * m.sin + out.y * m.cos;
  const angle = m.direction + (rand(seed, index, KEY.DIRECTION, group) - 0.5) * m.spread;
  const speed = m.speed * (1 - m.speedJitter * rand(seed, index, KEY.SPEED, group));
  const reach = Math.sqrt(x * x + y * y);
  const away = reach > 1e-9 ? m.radial / reach : 0;
  out.x = x;
  out.y = y;
  out.vx = Math.sin(angle) * speed + x * away;
  out.vy = -Math.cos(angle) * speed + y * away;
  out.tx = m.driftX * born;
  out.ty = m.driftY * born;
  out.born = born;
  if (!(m.wander > 0)) return;
  const fx = (x + out.tx) / m.grain;
  const fy = (y + out.ty) / m.grain;
  out.wx = noise3(fx, fy, born * m.pace, m.seedX);
  out.wy = noise3(fx, fy, born * m.pace, m.seedY);
}

/**
 * Where a launched particle is at an age.
 * @param {Motion} m
 * @param {Birth} b
 * @param {number} age - Seconds since birth
 * @param {{ x: number, y: number }} out - Receives the place, output pixels
 *   from the emitter's centre
 */
export function travel(m, b, age, out) {
  const dragged = m.drag > NO_DRAG;
  const coast = dragged ? -Math.expm1(-m.drag * age) / m.drag : age;
  const fall = dragged ? (age - coast) / m.drag : (age * age) / 2;
  let x = b.x + b.vx * coast;
  let y = b.y + b.vy * coast;
  if (m.swirl !== 0) {
    const cos = Math.cos(m.swirl * age);
    const sin = Math.sin(m.swirl * age);
    const turned = x * cos - y * sin;
    y = x * sin + y * cos;
    x = turned;
  }
  x += b.tx + m.gravityX * fall;
  y += b.ty + m.gravityY * fall;
  if (m.wander > 0) {
    const fx = x / m.grain;
    const fy = y / m.grain;
    const fz = (b.born + age) * m.pace;
    x += m.wander * (noise3(fx, fy, fz, m.seedX) - b.wx);
    y += m.wander * (noise3(fx, fy, fz, m.seedY) - b.wy);
  }
  out.x = x;
  out.y = y;
}

/**
 * A blank birth record to launch into.
 * @returns {Birth}
 */
export const newBirth = () => ({ x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, born: 0, wx: 0, wy: 0 });
