/**
 * Everything the transcript panel derives from a sidecar and the document:
 * units, paragraphs, the chain of clips that play the file and each word's
 * state. Results are remembered while their inputs stay the same, so the
 * panel can hand unchanged arrays to its paragraphs and only the ones
 * that really changed re-render. Pure apart from that memory.
 * @module utils/transcript/panelView
 */

import { groupParagraphs } from './paragraphs.js';
import { transcriptUnits, unitEdges } from './units.js';
import { sourceChain, unitStates } from './usage.js';

/**
 * @typedef {Object} TranscriptText
 * @property {import('./units.js').Unit[]} units
 * @property {import('./units.js').UnitLevel} level
 * @property {number[]} edges - `unitEdges(units)`
 * @property {import('./paragraphs.js').Paragraph[]} paragraphs
 */

/** @type {WeakMap<object, TranscriptText>} */
const texts = new WeakMap();
const NO_TEXT = Object.freeze({ units: [], level: 'none', edges: [], paragraphs: [] });

/**
 * Units, edges and paragraphs of a sidecar (computed once per sidecar).
 * @param {Record<string, any>|null} sidecar
 * @returns {TranscriptText}
 */
export function transcriptText(sidecar) {
  if (!sidecar || typeof sidecar !== 'object') return /** @type {any} */ (NO_TEXT);
  if (!texts.has(sidecar)) {
    const { units, level } = transcriptUnits(sidecar);
    const pause = level === 'segment' ? 1.5 : 0.75;
    const maxUnits = level === 'segment' ? 6 : 60;
    texts.set(sidecar, {
      units,
      level,
      edges: unitEdges(units),
      paragraphs: groupParagraphs(units, { pause, maxUnits }),
    });
  }
  return texts.get(sidecar);
}

/** @type {{ key: string, units: any, states: number[] }} */
let lastStates = { key: '', units: null, states: [] };

/**
 * The chain of clips playing a file and the state of every unit in it.
 * The `states` array keeps its identity until a clip of the chain changes.
 * @param {import('#utils/edl/types.js').Edl} edl
 * @param {string} file
 * @param {import('./units.js').Unit[]} units
 * @param {{ focusClipId?: string, trackId?: string }} [prefer]
 * @returns {{ chain: import('./usage.js').Chain, states: number[] }}
 */
export function transcriptUsage(edl, file, units, prefer = {}) {
  const chain = sourceChain(edl, file, prefer);
  const focus = chain.segments.length > 1 ? prefer.focusClipId || '' : '';
  const key = [
    file,
    focus,
    ...chain.segments.map((s) => `${s.clipId}:${s.sourceIn}:${s.sourceOut}`),
  ].join('|');
  if (lastStates.key !== key || lastStates.units !== units) {
    lastStates = { key, units, states: unitStates(units, chain.segments, focus) };
  }
  return { chain, states: lastStates.states };
}

/**
 * The inclusive unit range a selection covers.
 * @param {number} anchor - Where the selection started, -1 for none
 * @param {number} head - Where it ends
 * @param {number} [count=Infinity] - Number of units; a selection that
 *   points past the end (the transcript changed under it) is no selection
 * @returns {{ first: number, last: number }|null}
 */
export function selectedRange(anchor, head, count = Infinity) {
  if (anchor < 0 || head < 0 || Math.max(anchor, head) >= count) return null;
  return { first: Math.min(anchor, head), last: Math.max(anchor, head) };
}
