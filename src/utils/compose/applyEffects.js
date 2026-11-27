/**
 * The effect pipeline — run an effect stack over a surface, in order.
 * An effect module is one of two kinds: a `filter` (a CSS-style filter
 * string; neighbouring filter effects are merged into a single pass) or an
 * `apply` pass that redraws the surface itself. Disabled effects are left
 * out by the caller; an unknown type is skipped with one warning; a module
 * that throws is skipped with one warning and the frame carries on.
 * Isomorphic. Reference: docs/app-spec/COMPOSITOR.md § Module contracts.
 * @module utils/compose/applyEffects
 */

import { effectModule } from './catalog.js';
import { filterInPlace } from './filterPass.js';
import { warnOnce } from './host.js';
import { resolveParams } from './params.js';

/**
 * Run a module's code so that a failure, a context left in an odd state or
 * a borrowed surface never leaks into the rest of the frame.
 * @param {string} name - For the warning
 * @param {any} ctx - Context the module draws on
 * @param {import('./pool.js').Pool} pool
 * @param {() => void} run
 */
export function runModule(name, ctx, pool, run) {
  const mark = pool.mark();
  ctx.save();
  try {
    run();
  } catch (err) {
    warnOnce(`${name}:failed`, `${name} failed and was skipped: ${err?.message || err}`);
  } finally {
    ctx.restore();
    pool.settle(mark);
  }
}

/**
 * Apply effects to a surface in place.
 * @param {import('./pool.js').Surface} surface - Frame-sized
 * @param {any[]} effects - Enabled effects, `[{ type, params }]`
 * @param {import('./frame.js').Time} time
 * @param {import('./frame.js').Frame} frame
 * @param {import('./host.js').Compose} compose
 */
export function applyEffects(surface, effects, time, frame, compose) {
  const { env, pool } = compose;
  /** @type {string[]} */
  let filters = [];
  let reach = 0;
  const flush = () => {
    if (!filters.length) return;
    const list = filters.join(' ');
    const far = reach;
    filters = [];
    reach = 0;
    runModule('filter pass', surface.ctx, pool, () => filterInPlace(surface, list, far, env));
  };
  for (const fx of effects) {
    const module = effectModule(fx.type);
    if (!module) {
      warnOnce(`effect:${fx.type}`, `unknown effect "${fx.type}" ignored`);
      continue;
    }
    const params = resolveParams(module.params, fx.params);
    const name = `effect "${fx.type}"`;
    if (module.filter) {
      let filter = '';
      runModule(name, surface.ctx, pool, () => {
        filter = module.filter(params, frame, time);
        if (filter && filter !== 'none') reach += module.reach ? module.reach(params, frame) : 0;
      });
      if (filter && filter !== 'none') filters.push(filter);
      continue;
    }
    flush();
    runModule(name, surface.ctx, pool, () => module.apply(surface, params, time, frame, env));
  }
  flush();
}
