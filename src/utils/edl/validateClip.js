/**
 * Per-clip and per-track checks behind `validateEdl`. Isomorphic and pure.
 * @module utils/edl/validateClip
 */

import {
  defaultKenBurns,
  defaultText,
  defaultTextAnimation,
  defaultTransform,
} from './defaults.js';
import { compareClips, isTimed } from './immutable.js';
import { ANIMATION_ENUMS, ENUMS, isObject } from './sanitize.js';
import { EPS, sourceLimit } from './time.js';
import { checkEffects, checkGenerator, checkKeyframes, checkMade } from './validateExtras.js';

/** @typedef {(path: string, message: string) => void} Report */

const STRINGS = ['sourceFile', 'linkedClipId', 'groupId', 'label', 'prompt', 'intent', 'color'];
const TIMES = ['sourceIn', 'sourceOut', 'timelineStart', 'timelineEnd', 'fadeIn', 'fadeOut'];
const CHOICES = ['blendMode', 'fadeInCurve', 'fadeOutCurve'];

/**
 * @param {any} value
 * @returns {boolean} True for a linear gain in the allowed 0..2 range
 */
export function isGain(value) {
  return typeof value === 'number' && value >= 0 && value <= 2;
}

/**
 * Check that a block has every field of its default shape, with the right
 * type and, for enumerated fields, an allowed value.
 * @param {any} block
 * @param {Record<string, any>} shape
 * @param {string} path
 * @param {Report} report
 * @param {Record<string, string[]>} [enums]
 */
export function checkShape(block, shape, path, report, enums = ENUMS) {
  if (!isObject(block)) return report(path, 'must be an object');
  for (const [key, sample] of Object.entries(shape)) {
    if (isObject(sample)) continue;
    const value = block[key];
    const ok = typeof sample === 'number' ? Number.isFinite(value) : typeof value === typeof sample;
    if (!ok) report(`${path}.${key}`, `must be a ${typeof sample}`);
    else if (enums[key] && !enums[key].includes(value)) {
      report(`${path}.${key}`, `must be one of ${enums[key].join(', ')}`);
    }
  }
}

/**
 * The v3 additions of one clip: blend mode, fade curves, text animation,
 * generator, effects, keyframes and a web or music clip's own block.
 * @param {any} clip
 * @param {string} path
 * @param {Report} report
 */
function checkAdditions(clip, path, report) {
  checkShape(clip, Object.fromEntries(CHOICES.map((key) => [key, ''])), path, report);
  for (const key of isObject(clip.text) ? ['animateIn', 'animateOut'] : []) {
    const at = `${path}.text.${key}`;
    checkShape(clip.text[key], defaultTextAnimation(), at, report, ANIMATION_ENUMS);
  }
  checkGenerator(clip.generator, `${path}.generator`, report);
  checkEffects(clip.effects, `${path}.effects`, report);
  checkKeyframes(clip, path, report);
  checkMade(clip, path, report);
}

/**
 * Field types and invariants 1–3 for one clip.
 * @param {any} clip
 * @param {any} track
 * @param {string} path
 * @param {Report} report
 * @param {{ sourceDurations?: import('./types.js').SourceDurations, fps?: number }} opts
 * @returns {boolean} False when the clip is too broken for track-level checks
 */
export function checkClip(clip, track, path, report, opts) {
  if (!isObject(clip)) return (report(path, 'must be an object'), false);
  if (typeof clip.clipId !== 'string' || !clip.clipId) report(`${path}.clipId`, 'is required');
  for (const key of STRINGS) {
    if (typeof clip[key] !== 'string') report(`${path}.${key}`, 'must be a string');
  }
  if (typeof clip.placeholder !== 'boolean') report(`${path}.placeholder`, 'must be a boolean');
  if (!isGain(clip.volume)) report(`${path}.volume`, 'must be a number 0..2');
  checkShape(clip.text, defaultText(), `${path}.text`, report);
  checkShape(clip.transform, defaultTransform(), `${path}.transform`, report);
  checkShape(clip.transform?.kenBurns, defaultKenBurns(), `${path}.transform.kenBurns`, report);
  checkAdditions(clip, path, report);

  const broken = TIMES.filter((key) => !Number.isFinite(clip[key]));
  for (const key of broken) report(`${path}.${key}`, 'must be a finite number');
  if (broken.length) return false;
  const duration = clip.timelineEnd - clip.timelineStart;
  if (clip.timelineStart < -EPS) report(`${path}.timelineStart`, 'must not be negative');
  if (!(duration > EPS)) report(`${path}.timelineEnd`, 'must be after timelineStart');
  if (clip.fadeIn < 0 || clip.fadeOut < 0) report(`${path}.fadeIn`, 'fades must not be negative');
  if (duration > EPS && clip.fadeIn + clip.fadeOut > duration + EPS) {
    report(`${path}.fadeOut`, 'fadeIn + fadeOut exceeds the clip duration (invariant 3)');
  }
  if (Math.abs(clip.sourceOut - clip.sourceIn - duration) > EPS) {
    report(`${path}.sourceOut`, 'source range differs from the clip duration (invariant 1)');
  }
  // Only real media has a bounded source; every other clip may start before 0.
  if (typeof clip.sourceFile === 'string' && isTimed(clip, track)) {
    if (clip.sourceIn < -EPS) report(`${path}.sourceIn`, 'must not be negative (invariant 2)');
    const known = sourceLimit(opts, clip, opts.sourceDurations);
    const slack = 0.5 / (opts.fps > 0 ? opts.fps : 30) + EPS;
    if (known !== undefined && clip.sourceOut > known + slack) {
      report(`${path}.sourceOut`, 'exceeds the source duration (invariant 2)');
    }
  }
  return duration > EPS;
}

/**
 * Ordering and invariant 4 for the clips of one track.
 * @param {any[]} clips - Clips that passed `checkClip`
 * @param {string} path - Path of the track
 * @param {Report} report
 */
export function checkOverlaps(clips, path, report) {
  for (let i = 1; i < clips.length; i++) {
    const a = clips[i - 1];
    const b = clips[i];
    const at = `${path}.clips[${i}]`;
    if (compareClips(a, b) > 0) {
      report(at, 'clips must be sorted by timelineStart, then timelineEnd');
      continue;
    }
    const before = clips[i - 2];
    if (before && before.timelineEnd - b.timelineStart > EPS) {
      report(at, 'three clips overlap (invariant 4)');
    }
    const overlap = Math.min(a.timelineEnd, b.timelineEnd) - b.timelineStart;
    if (overlap <= EPS) continue;
    const partial = b.timelineStart - a.timelineStart > EPS && b.timelineEnd - a.timelineEnd > EPS;
    if (!partial) {
      report(at, 'clip lies inside or over the previous clip (invariant 4)');
    } else if (Math.abs(a.fadeOut - overlap) > EPS || Math.abs(b.fadeIn - overlap) > EPS) {
      report(
        at,
        'overlap is not a cross-fade: fadeOut/fadeIn must equal the overlap (invariant 4)',
      );
    }
  }
}
