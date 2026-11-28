/**
 * The reference documents of the compositor tests, as a flat list of cases.
 * Together they exercise every generator, text at rest and in motion, both
 * effects, every blend mode, placement, the layer pipeline, and every
 * element of every built-in brand kit.
 * @module tests/compose/cases
 */

import { effectDocs } from './effects.js';
import { elementCases } from './elements.js';
import { generatorDocs } from './generators.js';
import { motionDocs } from './motion.js';
import { particleCases } from './particles.js';
import { pipelineDocs } from './pipeline.js';
import { emojiDoc, textDocs } from './text.js';

/**
 * @typedef {Object} Case
 * @property {string} name
 * @property {any} edl
 * @property {number} time - Timeline seconds to draw
 * @property {boolean} text - The case draws glyphs
 * @property {Record<string, string>} footage - clipId → picture standing in
 *   for that clip's footage frame
 * @property {{ width: number, height: number }} [size] - The canvas to draw
 *   it on when the document is not 16:9; 640 × 360 by default
 */

/** The time the cases without motion are drawn at. */
const TIME = 1.5;

/**
 * @param {{ card: string, logo: string, font: string }} files - Fixture
 *   pictures, and a font file that stands for a brand's own
 * @returns {Case[]}
 */
export function referenceCases(files) {
  const footage = { a: files.card };
  const still = (/** @type {Record<string, any>} */ docs, /** @type {boolean} */ text) =>
    Object.entries(docs).map(([name, edl]) => ({ name, edl, time: TIME, text, footage }));
  const moving = Object.entries(motionDocs()).map(([name, [edl, time]]) => ({
    name,
    edl,
    time,
    text: true,
    footage,
  }));
  return [
    ...still(generatorDocs(), false),
    ...still(pipelineDocs(files), false),
    ...still(effectDocs(files), false),
    ...still(textDocs(), true),
    ...moving,
    ...particleCases(files),
    ...elementCases(files),
  ];
}

/** Names of the reference cases, for declaring tests before fixtures exist. */
export const CASE_NAMES = referenceCases({ card: '', logo: '', font: '' }).map((c) => c.name);

/**
 * @returns {Case} The colour-emoji case (see `emojiDoc`)
 */
export const emojiCase = () => ({
  name: 'text-emoji',
  edl: emojiDoc(),
  time: TIME,
  text: true,
  footage: {},
});
