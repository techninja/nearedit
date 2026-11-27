/**
 * Generator and effect names and parameters checked against the catalog:
 * the compositor draws nothing for a generator it does not know and skips
 * an unknown effect, which is the right thing for a preview and the wrong
 * thing to leave unsaid to someone writing a document by hand. Pure.
 * @module bin/lib/catalogCheck
 */

import { effectModule, generatorModule, EFFECTS, GENERATORS } from '#utils/compose/index.js';
import { coerceParam } from '#utils/compose/params.js';

/** @typedef {import('./repairs.js').Finding} Finding */

const show = (value) => JSON.stringify(value);

/**
 * Check a parameter bag against its schema.
 * @param {any} module - Generator or effect module, undefined when unknown
 * @param {Record<string, any>} params
 * @param {string} path
 * @param {Finding[]} out
 */
function checkParams(module, params, path, out) {
  for (const [name, value] of Object.entries(params || {})) {
    const spec = module.params[name];
    const at = `${path}.${name}`;
    if (!spec) {
      const known = Object.keys(module.params).join(', ');
      out.push({
        path: at,
        level: 'warning',
        message: `"${module.type}" has no such parameter (it has: ${known})`,
      });
    } else if (show(coerceParam(spec, value)) !== show(value)) {
      const message = `${show(value)} is not a usable ${spec.type}: ${show(coerceParam(spec, value))} is drawn`;
      out.push({ path: at, level: 'warning', message });
    }
  }
}

/**
 * Check the generator and effects of clips and tracks against the catalog.
 * @param {{ tracks: any[] }} edl - Normalised document
 * @returns {Finding[]}
 */
export function catalogFindings(edl) {
  /** @type {Finding[]} */
  const out = [];
  const unknown = (path, kind, type, list) =>
    out.push({
      path,
      level: 'error',
      message: `unknown ${kind} "${type}" — one of: ${list.map((entry) => entry.type).join(', ')}`,
    });
  const effects = (list, path) =>
    (list || []).forEach((fx, i) => {
      const module = effectModule(fx.type);
      if (!module) unknown(`${path}[${i}].type`, 'effect', fx.type, EFFECTS);
      else checkParams(module, fx.params, `${path}[${i}].params`, out);
    });
  edl.tracks.forEach((track, t) => {
    effects(track.effects, `tracks[${t}].effects`);
    track.clips.forEach((clip, c) => {
      const path = `tracks[${t}].clips[${c}]`;
      effects(clip.effects, `${path}.effects`);
      if (!clip.generator?.type) return;
      const module = generatorModule(clip.generator.type);
      if (!module) unknown(`${path}.generator.type`, 'generator', clip.generator.type, GENERATORS);
      else checkParams(module, clip.generator.params, `${path}.generator.params`, out);
    });
  });
  return out;
}
