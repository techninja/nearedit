/**
 * The motion plan — the compact JSON a language model (or the heuristic
 * planner) writes for a piece made only of generated layers. It says WHAT
 * each scene shows: its words and a few named choices. It never carries
 * clips, times, colours or parameters; the builder decides all of those.
 * The schema checks the shape only. Names are plain strings on purpose: an
 * unknown name is not a reason to reject a plan — it is replaced by the
 * theme's choice and reported (`completePlan`).
 * Reference: docs/app-spec/DIRECTOR-MOTION.md § Motion plan.
 * Isomorphic, pure data.
 * @module utils/director/motion/planSchema
 */

/** Most scenes a plan may hold. */
export const MAX_SCENES = 40;
/** Longest title and subtitle, characters. */
export const MAX_TITLE = 120;
export const MAX_SUBTITLE = 200;
/** Longest a plan may hold one scene, seconds. */
export const MAX_SCENE_SECONDS = 60;

/** The scene fields that hold a name from a vocabulary (`vocab.js`). */
export const NAME_FIELDS = /** @type {const} */ ([
  'background',
  'particles',
  'accent',
  'look',
  'textAnimation',
  'by',
  'transition',
]);

const NAME = { type: 'string', minLength: 1, maxLength: 40 };

/**
 * `scene.kind`: what a scene is in the piece. `intro`, `chapter` and `outro`
 * are drawn by the brand kit's own elements when the piece follows the
 * brand (docs/app-spec/DIRECTOR-BRAND.md § Motion piece); a `scene` is the
 * ordinary title over a generated background.
 */
export const SCENE_KINDS = ['scene', 'intro', 'chapter', 'outro'];

/** One scene: its words, and whichever choices the plan wants to make. */
export const SCENE_SCHEMA = {
  type: 'object',
  required: ['title'],
  properties: {
    title: { type: 'string', minLength: 1, maxLength: MAX_TITLE },
    subtitle: { type: 'string', maxLength: MAX_SUBTITLE },
    ...Object.fromEntries(NAME_FIELDS.map((field) => [field, NAME])),
    kind: NAME,
    duration: { type: 'number', exclusiveMinimum: 0, maximum: MAX_SCENE_SECONDS },
  },
};

export const MOTION_PLAN_SCHEMA = {
  $id: 'https://nearedit.local/schemas/motion-plan.json',
  title: 'MotionPlan',
  type: 'object',
  required: ['scenes'],
  properties: {
    theme: NAME,
    align: NAME,
    scenes: { type: 'array', minItems: 1, maxItems: MAX_SCENES, items: SCENE_SCHEMA },
  },
};

/** A small valid plan, shown to the LLM and used in the docs. */
export const MOTION_PLAN_EXAMPLE = {
  theme: 'midnight',
  scenes: [
    {
      title: 'Made from nothing',
      subtitle: 'no footage, no images, only layers',
      background: 'spotlight',
      particles: 'dust',
      accent: 'rule',
      textAnimation: 'slide-up',
      by: 'char',
    },
    { title: 'Every number can move', background: 'gradient', transition: 'wipe' },
    { title: 'Start here', look: 'cinematic', transition: 'fade', duration: 4 },
  ],
};
