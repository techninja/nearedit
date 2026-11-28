/**
 * Prompts that ask the LLM for an edit plan. The model is told to choose
 * WHAT to use and nothing about exact timing; nothing here assumes
 * anything about the content of a particular project.
 * @module api/director/prompts/editPlan
 */

import { PLAN_EXAMPLE } from '#utils/director/planSchema.js';
import { PACING } from '../assemble/options.js';
import { brandBlock } from './brand.js';

export const PLAN_SYSTEM = `You are the assistant editor inside a video editing program. You decide WHAT goes into an edit: which files, roughly which part of each, in what order, and what any titles say. The program does all exact timing afterwards (it cuts on word, shot and beat boundaries), so rough times are fine.

Reply with ONE JSON object and nothing else: no commentary, no code fences.

Example of the shape (the handles are only an example):
${JSON.stringify(PLAN_EXAMPLE, null, 1)}

Rules:
- "file" is always a handle from the media list (m1, m2 ...). Use only files that are listed there.
- "picks" play one after another in the order given; together they set the length of the edit.
- role "primary": the file's picture with its own sound, for example someone talking on camera.
- role "narration": only the voice is used. Add "visuals": videos or stills to show meanwhile.
- role "broll": picture shown on its own, with its sound turned down.
- Say which part of a file with ONE of: "segments": [first, last] (the transcript numbers s1, s2 ...), rough "start" and "end" in seconds, or "scene": n (a shot number). Leave them out and the program chooses the best part. A still image can take "duration".
- Speech has to make sense on its own: begin and end a pick on whole sentences.
- "music" is optional: one file marked [music], played quietly under everything.
- "title" (an opening title) and a pick's "title" (shown over that pick) are optional and short.
- "note" is optional: a few words naming the section.
- "elements" is optional: graphics of the brand kit, listed under BRAND. Each is {"element": name, "slots": {...}} with "pick": n — the number of the pick it goes with, counting from 1 — or "at": seconds into the edit. An overlay shows over that pick, a card stands before it, a stinger covers the cut into it. Use only the names listed.
- "rationale": one or two sentences on why you built it this way.`;

/**
 * The lines describing the timeline format.
 * @param {{ name: string, width: number, height: number, aspectRatio: string, fps: number }} format
 * @returns {string}
 */
export function formatLine(format) {
  const shape = format.width >= format.height ? 'landscape' : 'portrait';
  const ratio = format.aspectRatio ? `${format.aspectRatio}, ` : '';
  return `${format.name || 'Timeline'}: ${format.width}x${format.height} (${ratio}${shape}), ${format.fps} fps.`;
}

/**
 * The request block shared by the plan and script prompts.
 * @param {import('#utils/director/directive.js').Directive} directive
 * @returns {string[]}
 */
export function requestLines(directive) {
  const { params, prompt } = directive;
  const lines = [];
  if (params.duration) lines.push(`Target length: about ${Math.round(params.duration)} seconds.`);
  if (params.style && params.style !== 'auto') lines.push(`Style: ${params.style}.`);
  const pace = PACING[params.pacing];
  if (pace) lines.push(`Pacing: ${params.pacing} (picture shots of about ${pace.shot} seconds).`);
  lines.push(
    prompt ? `What the editor asked for: ${prompt}` : 'The editor gave no further direction.',
  );
  return lines;
}

/**
 * Prompt for `generate_edit`.
 * @param {{ digest: string, directive: import('#utils/director/directive.js').Directive,
 *   format: any, kit?: import('#utils/brand/types.js').Kit }} input - `kit`:
 *   the brand kit whose elements the plan may name
 * @returns {{ system: string, user: string }}
 */
export function editPlanPrompt({ digest, directive, format, kit }) {
  const user = [
    'MEDIA',
    digest,
    '',
    'TIMELINE',
    formatLine(format),
    '',
    ...(kit ? [...brandBlock(kit), ''] : []),
    'REQUEST',
    ...requestLines(directive),
    '',
    'Reply with the JSON edit plan.',
  ].join('\n');
  return { system: PLAN_SYSTEM, user };
}

/**
 * Prompt for `execute_script`: turn an approved script into a plan.
 * @param {{ digest: string, script: string, format: any,
 *   kit?: import('#utils/brand/types.js').Kit }} input
 * @returns {{ system: string, user: string }}
 */
export function scriptPlanPrompt({ digest, script, format, kit }) {
  const user = [
    'MEDIA',
    digest,
    '',
    'TIMELINE',
    formatLine(format),
    '',
    ...(kit ? [...brandBlock(kit), ''] : []),
    'APPROVED SCRIPT',
    script,
    '',
    'Convert the approved script into the JSON edit plan. Follow it exactly: the same ' +
      'sources, parts, order, visuals, music and titles. Do not add, drop or reorder ' +
      'sections. Where the script gives segment numbers, use "segments"; where it gives ' +
      'seconds, use "start" and "end". Where it names a speaker, a chapter, an opening or ' +
      'a closing, use the brand element for it in "elements".',
  ].join('\n');
  return { system: PLAN_SYSTEM, user };
}

/**
 * Prompt for the optional LLM ranking of `insert_broll`.
 * @param {{ digest: string, prompt: string, count: number, seconds: number }} input
 * @returns {{ system: string, user: string }}
 */
export function brollPrompt({ digest, prompt, count, seconds }) {
  const user = [
    'MEDIA',
    digest,
    '',
    'REQUEST',
    `Choose ${count} piece${count === 1 ? '' : 's'} of b-roll, each about ${seconds} seconds, ` +
      `best matching: ${prompt || 'anything that works as a cutaway'}`,
    'Every pick has role "broll" and names a video or still. No music, no titles.',
    '',
    'Reply with the JSON edit plan.',
  ].join('\n');
  return { system: PLAN_SYSTEM, user };
}
