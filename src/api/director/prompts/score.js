/**
 * The prompt that asks the LLM for a score plan. The styles, the moods and
 * the kinds of section in it are read from their tables at the moment of
 * asking, so the model is offered exactly what the generator can write.
 * The model is told to choose WHAT the music is like — never a note, a
 * chord or a time.
 * @module api/director/prompts/score
 */

import { BRAND } from '#utils/director/brand/theme.js';
import { SECTION_NAMES } from '#utils/director/score/arc.js';
import { timelineDigest } from '#utils/director/score/digest.js';
import { MOODS } from '#utils/director/score/mood.js';
import { SCORE_PLAN_EXAMPLE } from '#utils/director/score/planSchema.js';
import { AUTO, STYLES } from '#utils/director/score/styles.js';
import { formatLine } from './editPlan.js';

/** What each kind of section is, for the model. */
const SECTIONS = {
  intro: 'a quiet opening',
  verse: 'the main body',
  lift: 'the high point, where everything plays',
  break: 'a quiet stretch in the middle',
  outro: 'the wind-down',
};

/**
 * The system prompt, with the vocabularies as they are now.
 * @returns {string}
 */
export function scoreSystemPrompt() {
  const styles = STYLES.map((style) => `${style.id} (${style.description})`).join('; ');
  const sections = SECTION_NAMES.map((name) => `${name} (${SECTIONS[name]})`).join(', ');
  return `You are the composer inside a video editing program. You plan the music for a timeline: its style, its mood, and how its energy rises and falls. You decide WHAT the music is like. The program writes every note, fits the tempo to the length of the picture and makes the music quieter while someone speaks.

Reply with ONE JSON object and nothing else: no commentary, no code fences.

Example of the shape:
${JSON.stringify(SCORE_PLAN_EXAMPLE, null, 1)}

Rules:
- "style" is required. Use only these names.
  ${styles}
- "mood" is optional: a few of these words. They move how much plays and how bright it sounds.
  ${Object.keys(MOODS).join(', ')}
- "sections" is optional: the parts of the piece, in order. Each has a "name": ${sections}; a "share": how much of the length it takes, compared with the others; and an "energy" from 0 (almost nothing plays) to 1 (everything plays). Begin a new section where the timeline turns: at its markers and titles. Leave "sections" out and the program lays them out on the turning points itself.
- "bpm" and "key" only when the editor asks for a tempo or a key. Otherwise leave them out.
- Music under speech should leave the voice room: prefer a calmer style and lower energies where people speak.
- Never write notes, chords, bars, times, instruments or settings.`;
}

/**
 * The prompt for `score`.
 * @param {{ directive: import('#utils/director/directive.js').Directive, format: any,
 *   seen: Parameters<typeof timelineDigest>[0], sound?: string }} input - `seen`:
 *   what was read from the timeline; `sound`: a line about the brand's
 *   musical style, when the request leaves the style to the brand
 * @returns {{ system: string, user: string }}
 */
export function scorePrompt({ directive, format, seen, sound = '' }) {
  const { params, prompt } = directive;
  const lines = ['TIMELINE', formatLine(format), timelineDigest(seen), '', 'REQUEST'];
  const fixed = params.style && params.style !== AUTO && params.style !== BRAND;
  lines.push(
    fixed
      ? `Style: ${params.style} (the editor chose it; use it).`
      : sound || 'Style: choose the one that suits the timeline and the request.',
    `Energy: the editor set ${params.energy} on a scale from 0 (a quiet bed) to 1 ` +
      '(everything the style has); your sections move around that.',
  );
  if (params.bpm > 0) lines.push(`Tempo: ${params.bpm} BPM (the editor chose it).`);
  if (params.key && params.key !== AUTO && params.key !== BRAND) {
    lines.push(`Key: ${params.key} (the editor chose it).`);
  }
  lines.push(
    prompt
      ? `What the editor asked for: ${prompt}`
      : 'The editor gave no further direction: choose what suits the timeline.',
    '',
    'Reply with the JSON score plan.',
  );
  return { system: scoreSystemPrompt(), user: lines.join('\n') };
}
