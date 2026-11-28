/**
 * Web clips, the pure half — everything about a scripted recording of a web
 * page that needs no browser: the recipe and its step kinds, target syntax,
 * the score (when each step happens), the recipe key, the motion maths the
 * recorder and the editor share, and zoom keyframes made from a recording's
 * track. Isomorphic: runs in the browser and in Node, with no DOM and no
 * Node-only API. Contract: docs/app-spec/WEBCLIP.md.
 *
 * Shapes (`Recipe`, `Step`, `Score`, `Track`, `Target`…) are the JSDoc
 * types of `./types.js`: `import('#utils/web/types.js').Recipe`.
 * @module utils/web
 */

/**
 * @typedef {import('./types.js').Recipe} Recipe
 * @typedef {import('./types.js').Step} Step
 * @typedef {import('./types.js').Score} Score
 * @typedef {import('./types.js').ScoreStep} ScoreStep
 * @typedef {import('./types.js').Track} Track
 * @typedef {import('./types.js').TrackStep} TrackStep
 * @typedef {import('./types.js').Target} Target
 * @typedef {import('./types.js').ParsedTarget} ParsedTarget
 * @typedef {import('./types.js').StepKind} StepKind
 * @typedef {import('./types.js').StepParam} StepParam
 * @typedef {import('./types.js').WebBlock} WebBlock
 */

// The recipe: step kinds as data, bounds, defaults, normalising, checking
export { EASINGS } from '#utils/edl/easing.js';
export { MODIFIERS, STEP_COMMON, STEP_KINDS, TYPE_APPROACH, stepKind } from './stepKinds.js';
export {
  COLOR_SCHEMES,
  CURSOR_STYLES,
  DEFAULT_EASE,
  ON_MISSING,
  RECIPE_LIMITS,
  defaultRecipe,
} from './limits.js';
export { normalizeRecipe, normalizeStep } from './normalize.js';
export { validateRecipe } from './validate.js';
export { stepLabel } from './stepLabel.js';

// Targets
export { TARGET_FORMS, cleanTarget, describeTarget, formatTarget, parseTarget } from './target.js';

// The score
export {
  compileScore,
  scoreFps,
  stepAt,
  stepDuration,
  stepHold,
  typeApproach,
  typedCharacters,
} from './score.js';

// The key of a recording
export {
  KEY_LENGTH,
  KEY_PATTERN,
  RECORDER_VERSION,
  canonicalJson,
  canonicalRecipe,
  recipeKey,
} from './key.js';
export { sha256 } from './sha256.js';

// Motion, per frame
export {
  GLIDE_ARC,
  GLIDE_ARC_MAX,
  PRESS_SECONDS,
  glide,
  scrollAt,
  scrollGoal,
  typedLength,
  typedText,
} from './motion.js';

// A clip's `web` block
export { clipScore, isStale, isWebClip, stepMarks, webDuration } from './clip.js';
export { MAX_TITLE, checkWeb, cleanWeb, fitWindow, refitWindow } from './field.js';
export { hostOf } from './coerce.js';

// Zoom keyframes from a recording's track
export { ZOOM_PATHS, zoomKeyframes } from './zoom.js';
export { placeRect, zoomState, zoomView } from './zoomMath.js';
