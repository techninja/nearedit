/**
 * The timeline as a language model is shown it when it plans a score: how
 * long it is, how fast it is cut, where it turns and where people speak —
 * in words and clock times, never clips or files.
 * Reference: docs/app-spec/DIRECTOR-SCORE.md § With a model. Isomorphic and pure.
 * @module utils/director/score/digest
 */

/** Most turning points and stretches of speech that are listed. */
const MOST = 24;

/**
 * @param {number} seconds
 * @returns {string} `0:07`, `2:15`
 */
export function clock(seconds) {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** What a turning point is called, by its kind. */
const KINDS = {
  marker: 'marker',
  region: 'region',
  title: 'title',
  scene: 'a generated scene',
  shot: 'a new shot',
};

/**
 * @param {import('./sections.js').TurningPoint} point
 * @returns {string} `marker “Reveal”`, `a new shot`
 */
export function pointName(point) {
  const kind = KINDS[point.kind] || 'a turning point';
  return point.label ? `${kind} “${point.label}”` : kind;
}

/**
 * @template T
 * @param {T[]} list
 * @param {(item: T) => string} write
 * @returns {string[]} At most `MOST` of them, and how many more there are
 */
function listed(list, write) {
  const lines = list.slice(0, MOST).map(write);
  if (list.length > MOST) lines.push(`… and ${list.length - MOST} more`);
  return lines;
}

/**
 * @param {Object} seen
 * @param {number} seen.seconds - Length of the span
 * @param {string} seen.what - The span in words
 * @param {number} seen.cutsPerMinute
 * @param {import('./sections.js').TurningPoint[]} seen.points
 * @param {{ spans: import('./duck.js').Span[], spoken: number }} seen.speech
 * @returns {string}
 */
export function timelineDigest({ seconds, what, cutsPerMinute, points, speech }) {
  const cuts = Math.round(cutsPerMinute);
  const lines = [
    `Length to score: ${Math.round(seconds * 10) / 10} seconds (${what}).`,
    `Pace: ${cuts} cut${cuts === 1 ? '' : 's'} a minute.`,
  ];
  if (points.length) {
    lines.push(
      'Turning points:',
      ...listed(points, (point) => `  ${clock(point.time)} ${pointName(point)}`),
    );
  } else lines.push('Turning points: none (no markers, titles or long shots).');
  if (speech.spans.length) {
    const spans = listed(speech.spans, (span) => `${clock(span.start)}–${clock(span.end)}`);
    lines.push(`Speech: ${spans.join(', ')} (${Math.round(speech.spoken * 100)}% of the length).`);
  } else lines.push('Speech: none.');
  return lines.join('\n');
}
