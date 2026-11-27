/**
 * Prompt for `generate_script`: Markdown edit-script options a person
 * reads, corrects and approves before anything touches the timeline.
 * @module api/director/prompts/script
 */

import { formatLine, requestLines } from './editPlan.js';

/** One angle per option, so the options differ in approach rather than by chance. */
export const SCRIPT_ANGLES = [
  'Tell it straight: the clearest, most complete version, in the order things happened.',
  'Lead with the single strongest moment as a hook, then fill in the rest.',
  'Keep it tight: fewer sections, only the essentials, quicker cuts.',
  'Let the pictures lead: more b-roll and atmosphere, less talk.',
  'Build to a finish: start quietly and save the best for last.',
];

export const SCRIPT_SYSTEM = `You are the assistant editor inside a video editing program, writing an EDIT SCRIPT: a plan in plain Markdown that a person will read, correct and approve before the timeline is built from it. Output only the Markdown script.

Use exactly this layout:

# Edit script: <working title>

## Overview
- Length: about <N> seconds
- Style: <a few words>
- Music: <handle and file name, or none>
- Opening title: <text, or none>

## Sequence

### 1. <section name>
- Source: <handle> "<file name>", segments <first>-<last> (or: <start>s-<end>s, or: shot <n>)
- Role: <primary | narration | broll>
- Visuals: <handle> "<file name>"; <handle> "<file name>"
- Title: <on-screen text>
- Says: "<the words spoken, quoted from the transcript>"
- Why: <one line>

(one "###" block per section, in playback order; leave out the lines that do not apply)

## Notes
<what the editor should know: gaps, weak spots, alternatives>

Rules:
- Refer to files only by the handles of the media list (m1, m2 ...). Never invent a file.
- Quote speech from the transcript; never make words up. Give its segment numbers.
- Use whole sentences: a section must not start or stop in the middle of a thought.
- Role primary = picture with its own sound; narration = voice only, with Visuals over it; broll = picture on its own.
- The sections together should run about the target length.`;

/**
 * @param {{ digest: string, directive: import('#utils/director/directive.js').Directive,
 *   format: any, variant: number }} input - `variant` counts from 0
 * @returns {{ system: string, user: string }}
 */
export function scriptPrompt({ digest, directive, format, variant }) {
  const user = [
    'MEDIA',
    digest,
    '',
    'TIMELINE',
    formatLine(format),
    '',
    'REQUEST',
    ...requestLines(directive),
    `Angle for this option: ${SCRIPT_ANGLES[variant % SCRIPT_ANGLES.length]}`,
    '',
    'Write the edit script.',
  ].join('\n');
  return { system: SCRIPT_SYSTEM, user };
}

/**
 * Tidy a script reply: unwrap a code fence put around the script and drop
 * any chatter before its first heading.
 * @param {string} reply - Reasoning already stripped
 * @returns {string}
 */
export function cleanScript(reply) {
  let text = reply.trim();
  const fence = text.match(/```[a-zA-Z]*[ \t]*\n([\s\S]*?)\n```/);
  const firstHeading = text.search(/^# /m);
  if (fence && /^# /m.test(fence[1]) && firstHeading > fence.index) text = fence[1].trim();
  const heading = text.search(/^# /m);
  if (heading > 0) text = text.slice(heading);
  return `${text.trim()}\n`;
}
