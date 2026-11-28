/**
 * `nearedit captions` — the captions of a document as a subtitle file: the
 * file a render saves beside its video when asked for `subtitles`.
 * @module bin/lib/captionsCommand
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import {
  SUBTITLE_FORMATS,
  SUBTITLE_SHAPES,
  subtitleCues,
  subtitleName,
  subtitleText,
} from '../../src/api/render/subtitles.js';
import { loadWords } from '../../src/api/render/words.js';
import { UsageError, parseArgs } from './args.js';
import { wordFindings } from './captionsCheck.js';
import { DocumentError, byLevel, describe, loadDocument } from './document.js';

const OPTIONS = {
  format: { type: /** @type {'string'} */ ('string'), choices: SUBTITLE_FORMATS },
  output: { short: 'o', type: /** @type {'string'} */ ('string') },
  as: { type: /** @type {'string'} */ ('string'), choices: SUBTITLE_SHAPES },
  media: { type: /** @type {'list'} */ ('list') },
};

/**
 * @param {string[]} argv
 * @param {{ out: (line: string) => void, err: (line: string) => void }} io
 * @returns {Promise<number>} Exit code
 */
export async function captionsCommand(argv, io) {
  const { values, rest } = parseArgs(argv, OPTIONS, 'captions');
  if (rest.length !== 1)
    throw new UsageError('captions takes one document: an EDL JSON file.', 'captions');
  // The format: as asked, else what the output's name says, else SubRip.
  const named = extname(values.output || '')
    .slice(1)
    .toLowerCase();
  const format = values.format || (SUBTITLE_FORMATS.includes(named) ? named : 'srt');
  const loaded = loadDocument(rest[0], { media: values.media });
  // Missing footage does not stop a subtitle file; a captioned clip without words is said.
  const { words } = loadWords(loaded.edl);
  const findings = [...loaded.findings, ...wordFindings(loaded.edl, words)];
  const about = findings.filter((one) => /captions/.test(one.path));
  for (const line of describe([...byLevel(about).errors, ...byLevel(about).warnings])) io.err(line);
  const cues = subtitleCues(loaded.edl, words, { as: values.as });
  if (!cues.length)
    throw new DocumentError(
      `${loaded.file} has no captions to write: no clip that is heard has captions switched on and words to show`,
    );
  const target = values.output || subtitleName(loaded.file, format);
  const output = resolve(extname(target) ? target : `${target}.${format}`);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, subtitleText(cues, format));
  io.out(output);
  return 0;
}
