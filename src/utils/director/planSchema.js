/**
 * The edit plan — the compact JSON an LLM (or the base-edit heuristics)
 * produces. It says WHAT to use; it never carries final timing. The server
 * validates it against this schema, resolves every `file` handle to real
 * media and assembles the timeline deterministically.
 * Reference: docs/app-spec/DIRECTOR.md § Edit plan. Isomorphic, pure data.
 * @module utils/director/planSchema
 */

import { ITEM_EXAMPLE, ITEM_SCHEMA, MAX_ITEMS } from './brand/items.js';

/**
 * - `primary`: picture with its own sound (someone talking on camera)
 * - `narration`: only the voice is used; `visuals` supply the picture
 * - `broll`: picture shown on its own, its sound turned down
 * - `music`: a music bed (same as the top-level `music`)
 */
export const ROLES = ['primary', 'narration', 'broll', 'music'];

/** Which part of a file to use. All optional: omit to let the assembler choose. */
const PART = {
  file: { type: 'string', minLength: 1 },
  start: { type: 'number', minimum: 0 },
  end: { type: 'number', minimum: 0 },
  segments: { type: 'array', minItems: 1, maxItems: 500, items: { type: 'integer', minimum: 1 } },
  scene: { type: 'integer', minimum: 1 },
  duration: { type: 'number', exclusiveMinimum: 0 },
};

/** A picture laid over a pick (cutaway). */
export const VISUAL_SCHEMA = {
  type: 'object',
  required: ['file'],
  properties: PART,
};

/** One entry of `picks`: a stretch of one file, played in list order. */
export const PICK_SCHEMA = {
  type: 'object',
  required: ['file'],
  properties: {
    ...PART,
    role: { enum: ROLES },
    title: { type: 'string' },
    note: { type: 'string' },
    visuals: { type: 'array', maxItems: 24, items: VISUAL_SCHEMA },
  },
};

export const PLAN_SCHEMA = {
  $id: 'https://nearedit.local/schemas/edit-plan.json',
  title: 'EditPlan',
  type: 'object',
  required: ['picks'],
  properties: {
    rationale: { type: 'string' },
    title: { type: 'string' },
    music: {
      type: 'object',
      required: ['file'],
      properties: {
        file: PART.file,
        start: PART.start,
        volume: { type: 'number', minimum: 0, maximum: 1 },
      },
    },
    picks: { type: 'array', minItems: 1, maxItems: 400, items: PICK_SCHEMA },
    // Brand elements the plan names, each with a pick of the plan or at a time.
    elements: { type: 'array', maxItems: MAX_ITEMS, items: ITEM_SCHEMA },
  },
};

/** A small valid plan, shown to the LLM and used in the docs. */
export const PLAN_EXAMPLE = {
  rationale: 'Open on the arrival, let the interview carry the story, end on the wide shot.',
  title: 'A Day at the Park',
  music: { file: 'm5' },
  picks: [
    { file: 'm1', role: 'primary', segments: [1, 4], note: 'introduction' },
    { file: 'm1', role: 'narration', segments: [9, 12], visuals: [{ file: 'm2' }, { file: 'm4' }] },
    { file: 'm3', role: 'broll', start: 4, end: 9, title: 'Golden hour' },
  ],
  elements: [ITEM_EXAMPLE],
};
