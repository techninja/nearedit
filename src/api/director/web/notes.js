/**
 * What a site demo tells about itself: the page that was recorded and how
 * its size was chosen, how names were matched, what the recorder passed
 * over, the look, and how to go on from here. Every sentence is something
 * the director assumed, chose or could not do.
 * Reference: docs/app-spec/DIRECTOR-WEB.md § The result.
 * @module api/director/web/notes
 */

import { hostOf } from '#utils/web/index.js';

/**
 * @param {Object} facts
 * @param {{ stops: object[], by: string }} facts.plan
 * @param {import('./resolve.js').Resolved} facts.found
 * @param {{ notes: string[] }} facts.paced
 * @param {import('../../web/cache.js').Recording} facts.recording
 * @param {{ why: string, scale: number, cursor: { style: string } }} facts.view
 * @param {{ theme: { label: string, description: string }, why: string }} facts.look
 * @param {import('./stage.js').Stage} facts.stage
 * @param {import('./build.js').BuiltDemo} facts.built
 * @param {import('./card.js').Card} facts.card
 * @param {import('./survey.js').Survey} facts.survey
 * @param {Record<string, any>} facts.params
 * @returns {string[]}
 */
export function demoNotes(facts) {
  const { found, paced, recording, view, look, stage, built, card, params } = facts;
  const { track } = recording;
  const notes = [];
  const named = recording.title ? `“${recording.title}”` : hostOf(track.url);
  notes.push(
    `Recorded ${named} as ${view.why}, at ${view.scale}× so it stays sharp when zoomed` +
      `${view.cursor.style === 'dot' ? '; the pointer is a touch dot' : ''}.`,
    ...found.notes,
    ...paced.notes,
    ...track.warnings.map((warning) => `The recorder says: ${warning}`),
  );
  if (recording.cached)
    notes.push('This exact demo had been recorded before: the recording in the project was used.');
  const themed = `the ${look.theme.label} theme${look.why ? ` (${look.why})` : ''}`;
  if (stage.look === 'window') {
    notes.push(
      `Window look: the page sits ${Math.round((1 - stage.window.width / stage.frame.width) * 50)}% ` +
        `in from the sides, with rounded corners and a shadow, on ${themed}.`,
    );
  } else {
    const cut = track.viewport.width / track.viewport.height;
    const frame = stage.frame.width / stage.frame.height;
    notes.push(
      `Full-frame look${card.frames ? `; the title card uses ${themed}` : ''}.` +
        (Math.abs(cut / frame - 1) > 0.02
          ? ' The page and the frame have different shapes, so the page is cut at its edges — the window look shows all of it.'
          : ''),
    );
  }
  const { zooms, captions, top } = built.counts;
  if (zooms)
    notes.push(
      `${zooms} zoom${zooms === 1 ? '' : 's'}${stage.look === 'window' ? ' inside the window' : ''}: ` +
        `${params.zoom ? 'on what is clicked and typed into, and on' : 'only on'} “zoom in on …” steps.`,
    );
  else if (params.zoom && track.steps.length) notes.push('Nothing was small enough to zoom in on.');
  if (captions && top)
    notes.push(
      `${top} of the ${captions} caption${captions === 1 ? '' : 's'} ${top === 1 ? 'is' : 'are'} at the top, ` +
        'because the action is at the bottom of the picture.',
    );
  notes.push(
    'The page is a web clip: open it to change a step and record it again. The zooms are ' +
      'ordinary keyframes on it, the captions ordinary titles, the background a generator.',
  );
  return notes;
}
