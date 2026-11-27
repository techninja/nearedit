/**
 * The random numbers of a particle. Everything that varies from one
 * particle to the next is `rand(seed, index, KEY, group)`: `index` and
 * `group` name the particle (its number in the stream, or its number in a
 * burst and the burst's number), the key names the property. A particle
 * therefore gets the same values in every frame, on every canvas.
 * @module utils/compose/generators/particles/keys
 */

/** One key per property that varies between particles. */
export const KEY = {
  BIRTH: 0,
  LIFE: 1,
  PLACE_A: 2,
  PLACE_B: 3,
  DIRECTION: 4,
  SPEED: 5,
  SIZE: 6,
  ROTATION: 7,
  SPIN: 8,
  FLIP_RATE: 9,
  FLIP_PHASE: 10,
  COLOR: 11,
  DENSITY: 12,
  TWINKLE_RATE: 13,
  TWINKLE_PHASE: 14,
};

/** Salts that turn the clip's seed into the seeds of its parts. */
export const SALT = { STREAM: 1, BURSTS: 2, WANDER_X: 3, WANDER_Y: 4 };
