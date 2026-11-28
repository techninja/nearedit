/**
 * `nearedit validate` — load a document the way a render would, and say
 * everything that is wrong with it or was repaired on the way in.
 * @module bin/lib/validateCommand
 */

import { timelineDuration } from '#utils/edl/query.js';
import { UsageError, parseArgs } from './args.js';
import { checkDocument } from './check.js';
import { byLevel, describe } from './document.js';

const OPTIONS = {
  json: { type: /** @type {'flag'} */ ('flag') },
  media: { type: /** @type {'list'} */ ('list') },
};

/**
 * What the document holds, for the last line and the JSON output.
 * @param {import('./check.js').Checked} checked
 * @returns {{ fps: number, resolution: string, duration: number, tracks: number,
 *   clips: number, media: number, segments: object[] }}
 */
function summary({ edl, media, segments }) {
  const clips = edl.tracks.reduce((sum, track) => sum + track.clips.length, 0);
  return {
    ...{ fps: edl.fps, resolution: edl.resolution, duration: timelineDuration(edl) },
    ...{ tracks: edl.tracks.length, clips, media: media.length },
    // Which renderer each stretch takes — what `render` will do.
    segments: segments.map(({ start, end, engine, reasons }) => ({ start, end, engine, reasons })),
  };
}

/**
 * @param {string[]} argv
 * @param {{ out: (line: string) => void, err: (line: string) => void }} io
 * @returns {Promise<number>} Exit code: 0 valid, 1 invalid
 */
export async function validateCommand(argv, io) {
  const { values, rest } = parseArgs(argv, OPTIONS, 'validate');
  if (rest.length !== 1)
    throw new UsageError('validate takes one document: an EDL JSON file.', 'validate');
  const loaded = await checkDocument(rest[0], { media: values.media });
  // A web clip that is not recorded yet, or a music clip that is not rendered yet, is a
  // placeholder here; `render` makes it first, so a timeline holding nothing else is not
  // the empty one it looks like.
  const waiting = loaded.unrecorded.length > 0 || loaded.unrendered.length > 0;
  const findings = loaded.findings.filter(
    (finding) => !(waiting && /nothing to render/.test(finding.message)),
  );
  const checked = { ...loaded, findings, valid: !byLevel(findings).errors.length };
  const { errors, warnings } = byLevel(checked.findings);
  const facts = summary(checked);
  if (values.json) {
    const plain = ({ path, message }) => ({ path, message });
    const report = { file: checked.file, valid: checked.valid, ...facts };
    io.out(
      JSON.stringify(
        { ...report, errors: errors.map(plain), warnings: warnings.map(plain) },
        null,
        2,
      ),
    );
    return checked.valid ? 0 : 1;
  }
  for (const line of describe([...errors, ...warnings])) io.out(line);
  const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const found = [
    errors.length && count(errors.length, 'error'),
    warnings.length && count(warnings.length, 'warning'),
  ];
  const notes = found.filter(Boolean).join(', ');
  const seconds = Number(facts.duration.toFixed(3));
  const what = `${facts.resolution} at ${facts.fps} fps, ${seconds} s, ${count(facts.clips, 'clip')}`;
  io.out(
    `${checked.file}: ${checked.valid ? 'valid' : 'invalid'} — ${what}${notes ? ` (${notes})` : ''}`,
  );
  return checked.valid ? 0 : 1;
}
