/**
 * The prompt that asks the LLM for a motion plan. Every list of names in
 * it is read from the vocabularies at the moment of asking, so the model
 * is offered exactly what the builder can draw. The model is told to
 * choose WHAT each scene shows and nothing about timing, size or colour.
 * @module api/director/prompts/motion
 */

import { MOTION_PLAN_EXAMPLE } from '#utils/director/motion/planSchema.js';
import { THEMES } from '#utils/director/motion/themes.js';
import { AUTO } from '#utils/director/motion/themes.js';
import {
  ACCENTS,
  ANIMATIONS,
  BACKGROUNDS,
  NONE,
  TRANSITIONS,
} from '#utils/director/motion/vocab.js';
import { PARTICLE_PRESETS, UNITS } from '#utils/director/motion/vocab.js';
import { EFFECT_PRESETS } from '#utils/compose/index.js';
import { naturalSeconds } from '../motion/timing.js';
import { formatLine } from './editPlan.js';

/**
 * "name (what it is)" entries on one line.
 * @param {{ name: string, about?: string }[]} items
 * @returns {string}
 */
const described = (items) =>
  items.map(({ name, about }) => (about ? `${name} (${about})` : name)).join('; ');

/**
 * The system prompt, with the vocabularies as they are now.
 * @returns {string}
 */
export function motionSystemPrompt() {
  const themes = THEMES.map((theme) => ({ name: theme.id, about: theme.description }));
  const particles = PARTICLE_PRESETS.map((p) => ({ name: p.id, about: p.description }));
  const looks = EFFECT_PRESETS.map((p) => ({ name: p.name, about: p.description }));
  return `You are the motion designer inside a video editing program. You plan a short piece made only of generated layers: backgrounds, particles, shapes and animated titles. There is no footage. You decide WHAT each scene shows: its words and a few named choices. The program does all timing, sizes, positions, colours and animation afterwards.

Reply with ONE JSON object and nothing else: no commentary, no code fences.

Example of the shape:
${JSON.stringify(MOTION_PLAN_EXAMPLE, null, 1)}

Rules:
- "scenes" play one after another. Every scene needs a "title": a few words, at most about eight. "subtitle" is optional: one short line.
- Every other field is optional. Leave a field out and the theme decides; a plan with only titles is a good plan.
- Use only these names.
  theme: ${described(themes)}
  background: ${BACKGROUNDS.join(', ')}
  particles: ${NONE}; ${described(particles)}
  accent: ${ACCENTS.join(', ')} (rule = a line under the title, frame = an outline inside the picture's edges, ring = a growing circle, burst = a turning star)
  look: ${NONE}; ${described(looks)}
  textAnimation: ${ANIMATIONS.join(', ')}
  by: ${UNITS.join(', ')} (the piece of text the animation moves one by one)
  transition: ${TRANSITIONS.join(', ')} (how the scene arrives)
- "duration" is optional: the seconds a scene stays. Leave it out and reading time decides.
- Never write times, colours, sizes, positions, fonts or keyframes.`;
}

/**
 * The prompt for `motion_piece`.
 * @param {{ directive: import('#utils/director/directive.js').Directive, format: any,
 *   target?: number }} input - `target`: length in seconds, 0 for none
 * @returns {{ system: string, user: string }}
 */
export function motionPrompt({ directive, format, target = 0 }) {
  const { params, prompt } = directive;
  const lines = ['FORMAT', formatLine(format), '', 'REQUEST'];
  if (target > 0) {
    const each = naturalSeconds({ title: 'four words of text' }, params.pacing);
    const count = Math.max(1, Math.round(target / each));
    lines.push(
      `Target length: about ${Math.round(target)} seconds, so about ${count} scene${count === 1 ? '' : 's'}.`,
    );
  }
  lines.push(`Pacing: ${params.pacing}.`);
  lines.push(
    params.theme && params.theme !== AUTO
      ? `Theme: ${params.theme} (the editor chose it; use it).`
      : 'Theme: choose the one that suits the request.',
  );
  if (params.particles && params.particles !== AUTO) {
    lines.push(`Particles: ${params.particles} in every scene (the editor chose it).`);
  }
  lines.push(`What the editor asked for: ${prompt}`, '', 'Reply with the JSON motion plan.');
  return { system: motionSystemPrompt(), user: lines.join('\n') };
}
