/**
 * The score plan — the small JSON a language model (or the heuristic)
 * writes for a piece of music: a style, a few mood words, and optionally
 * the sections with their share of the length and their energy, a tempo
 * and a key. It says WHAT the music should be like. It never carries a
 * note, a time, a chord or a parameter; the generator decides all of those.
 * The schema checks the shape only: a style or a section the director does
 * not know is not a reason to reject a plan — it is replaced and reported.
 * Reference: docs/app-spec/DIRECTOR-SCORE.md § The plan. Isomorphic, pure data.
 * @module utils/director/score/planSchema
 */

/** Most sections a plan may ask for. */
export const MAX_PLAN_SECTIONS = 12;
/** Most mood words a plan may hold. */
export const MAX_MOODS = 8;

const NAME = { type: 'string', minLength: 1, maxLength: 40 };

/** One section: its kind, its share of the length, how much happens in it. */
export const SECTION_SCHEMA = {
  type: 'object',
  required: ['name'],
  properties: {
    name: NAME,
    share: { type: 'number', exclusiveMinimum: 0, maximum: 1000 },
    energy: { type: 'number', minimum: 0, maximum: 1 },
  },
};

export const SCORE_PLAN_SCHEMA = {
  $id: 'https://nearedit.local/schemas/score-plan.json',
  title: 'ScorePlan',
  type: 'object',
  required: ['style'],
  properties: {
    style: NAME,
    mood: { type: 'array', maxItems: MAX_MOODS, items: NAME },
    sections: {
      type: 'array',
      minItems: 1,
      maxItems: MAX_PLAN_SECTIONS,
      items: SECTION_SCHEMA,
    },
    bpm: { type: 'number', minimum: 40, maximum: 240 },
    key: { type: 'string', minLength: 1, maxLength: 12 },
  },
};

/** A small valid plan, shown to the LLM and used in the docs. */
export const SCORE_PLAN_EXAMPLE = {
  style: 'lofi',
  mood: ['calm', 'hopeful'],
  sections: [
    { name: 'intro', share: 1, energy: 0.3 },
    { name: 'verse', share: 3, energy: 0.5 },
    { name: 'lift', share: 2, energy: 0.9 },
    { name: 'outro', share: 1, energy: 0.4 },
  ],
};
