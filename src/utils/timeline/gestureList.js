/**
 * The pointer gestures of the timeline as a list for people to read (the
 * shortcuts dialog shows it under the keyboard commands, which no keymap
 * describes). Pure.
 * @module utils/timeline/gestureList
 */

/** @type {[string, string][]} What it does, how it is done */
const CLIPS = [
  ['Move a clip (onto another to cross-fade)', 'Drag'],
  ['Copy a clip', 'Ctrl + drag'],
  ['Trim', 'Drag an edge'],
  ['Slip-trim: the media moves with the edge', 'Alt + drag an edge'],
  ['Roll the cut between two clips', 'Ctrl + Alt + drag an edge'],
  ['Slip the source under a clip', 'Alt + drag'],
  ['Slide a clip between its neighbours', 'Ctrl + Alt + drag'],
  ['Fade in / out', 'Drag a top corner'],
  ['Choose a fade curve', 'Right-click the fade'],
  ['Go to a keyframe / retime it', 'Click / drag its diamond on the clip'],
  ['Add a generator, a text style or an effect', 'Drag it from the Create tab'],
  ['Select several', 'Ctrl / Shift + click, or drag a box'],
];

/** @type {[string, string][]} */
const RULER = [
  ['Move the playhead', 'Click or drag the ruler'],
  ['Time selection (the loop region)', 'Shift + drag the ruler'],
  ['Select a clip’s span', 'Double-click the clip'],
  ['Select between two markers', 'Double-click the ruler'],
  ['Move or resize a region', 'Drag its tag, or an end'],
  ['Select a region', 'Double-click its tag'],
  ['Rename a marker', 'Double-click it'],
];

/** @type {Record<'scroll'|'vegas', [string, string][]>} */
const WHEEL = {
  scroll: [
    ['Scroll (Shift: sideways)', 'Wheel'],
    ['Zoom about the pointer', 'Ctrl + wheel, or pinch'],
  ],
  vegas: [
    ['Zoom about the pointer', 'Wheel, or pinch'],
    ['Scroll time / tracks', 'Shift + wheel / Ctrl + wheel'],
    ['Move the cursor', 'Ctrl + Shift + wheel'],
  ],
};

/** @type {[string, string][]} */
const REST = [
  ['Pan', 'Space + drag, or middle button'],
  ['Ignore snapping for one drag', 'Hold Shift'],
  ['Context menu', 'Right-click, or long-press'],
];

/**
 * @param {'scroll'|'vegas'} [wheelMode='scroll'] - What the wheel is set to do
 * @returns {[string, string][]} Rows of [what it does, how it is done]
 */
export function pointerGestures(wheelMode = 'scroll') {
  return [...CLIPS, ...RULER, ...(WHEEL[wheelMode] || WHEEL.scroll), ...REST];
}
