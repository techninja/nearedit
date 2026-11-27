/**
 * Form-field builders and the fields several director actions share.
 * A field is plain JSON, so `GET /api/director/actions` can serve it and a
 * generic form can render it. Isomorphic, pure data.
 * @module utils/director/fields
 */

/**
 * @typedef {Object} ActionField
 * @property {string} key - Name inside `directive.params`
 * @property {'range'|'select'|'toggle'|'text'|'file'} type
 * @property {string} label
 * @property {string} help
 * @property {number|string|boolean} default
 * @property {number} [min]
 * @property {number} [max]
 * @property {number} [step]
 * @property {string} [unit] - Display unit of a range ('s', 'ms', '')
 * @property {{ value: string, label: string }[]} [options] - Choices of a select
 * @property {boolean} [allowCustom] - A select that also accepts free text
 * @property {string} [placeholder]
 * @property {string} [accept] - Media type a `file` field picks ('text')
 */

/**
 * @param {string} key
 * @param {string} label
 * @param {[number, number, number]} bounds - min, max, step
 * @param {number} def
 * @param {string} [unit]
 * @param {string} [help]
 * @returns {ActionField}
 */
export function range(key, label, [min, max, step], def, unit = '', help = '') {
  return { key, type: 'range', label, help, default: def, min, max, step, unit };
}

/**
 * @param {string} key
 * @param {string} label
 * @param {(string | [string, string])[]} options - Value, or [value, label]
 * @param {string} def
 * @param {string} [help]
 * @returns {ActionField}
 */
export function select(key, label, options, def, help = '') {
  const list = options.map((o) =>
    Array.isArray(o) ? { value: o[0], label: o[1] } : { value: o, label: o },
  );
  return { key, type: 'select', label, help, default: def, options: list };
}

/**
 * @param {string} key
 * @param {string} label
 * @param {boolean} def
 * @param {string} [help]
 * @returns {ActionField}
 */
export function toggle(key, label, def, help = '') {
  return { key, type: 'toggle', label, help, default: def };
}

/**
 * @param {string} key
 * @param {string} label
 * @param {string} [placeholder]
 * @param {string} [help]
 * @returns {ActionField}
 */
export function text(key, label, placeholder = '', help = '') {
  return { key, type: 'text', label, help, default: '', placeholder };
}

export const DURATION = range('duration', 'Target length', [2, 1800, 1], 60, 's');

export const PACING = select(
  'pacing',
  'Pacing',
  [
    ['slow', 'Slow — long, lingering shots'],
    ['medium', 'Medium'],
    ['fast', 'Fast — quick cuts'],
  ],
  'medium',
);

export const SILENCE_THRESHOLD = range(
  'threshold',
  'Pause longer than',
  [0.2, 3, 0.05],
  0.8,
  's',
  'Pauses longer than this are cut out.',
);

export const TIGHTEN = toggle(
  'tighten',
  'Remove pauses in speech',
  true,
  'Dead air inside speech is cut out, using word timestamps or detected silences.',
);

export const PADDING = range(
  'padding',
  'Breathing room',
  [0, 0.5, 0.01],
  0.1,
  's',
  'Kept before and after each spoken run so cuts do not sound clipped.',
);

export const BEAT_SYNC = toggle(
  'beatSync',
  'Cut on the beat',
  true,
  'Picture cuts land on the beats of the music bed when it has been analysed.',
);

export const NATURAL_SOUND = select(
  'naturalSound',
  'B-roll sound',
  [
    ['low', 'Low — under the main sound'],
    ['full', 'Full level'],
    ['off', 'Off — picture only'],
  ],
  'low',
);

export const AUTO_BROLL = toggle(
  'autoBroll',
  'Cover speech with b-roll',
  true,
  'Voice without picture is covered with matching footage and stills; jump cuts get cutaways.',
);
