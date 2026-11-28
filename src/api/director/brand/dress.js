/**
 * Brand elements in a generated fragment. The assembler lays picture and
 * sound; whatever a plan says on screen — its opening title, a pick's
 * title, and the element items it names ("lower third: Ada, CEO") — is then
 * put on with the kit's own elements, through the editor's `insertElement`:
 * an overlay goes on the Titles row, a segment takes its own time on the
 * main row, a stinger is centred on the cut it was asked for.
 * Reference: docs/app-spec/DIRECTOR-BRAND.md § Elements in a plan.
 * @module api/director/brand/dress
 */

import { blocker, coverSpan, nearestCut, putElement } from '#utils/director/brand/place.js';
import { formatSeconds } from '#utils/director/snap.js';
import { createEdl, createTrack, snapToFrame, timelineDuration } from '#utils/edl/index.js';

/**
 * @typedef {Object} Wanted - An element to put on, with its place worked out
 * @property {string} id - Element id
 * @property {string} kind - overlay | segment | transition
 * @property {string} label
 * @property {Record<string, string>} slots
 * @property {number} time - Fragment seconds
 * @property {number} [until] - Where what it goes with ends
 * @property {number|null} [duration] - Seconds asked for
 */

/** The shortest an overlay is worth showing, seconds. */
const SHORTEST = 1;
const rowId = (/** @type {{ type: string, index: number }} */ row) => `${row.type}${row.index}`;

/**
 * Put elements on a fragment.
 * @param {{ type: 'video'|'audio', index: number, name: string, clips: any[] }[]} tracks
 * @param {object[]} markers
 * @param {Wanted[]} wanted
 * @param {{ kit: import('#utils/brand/types.js').Kit, fps: number, width: number, height: number }} opts
 * @returns {{ tracks: any[], markers: object[], notes: string[], placed: number }}
 */
export function dressFragment(tracks, markers, wanted, { kit, fps, width, height }) {
  const notes = [];
  if (!wanted.length) return { tracks, markers, notes, placed: 0 };
  let doc = createEdl({
    fps,
    resolution: `${width}x${height}`,
    tracks: tracks.map((row) =>
      createTrack(row.type, { trackId: rowId(row), name: row.name, clips: row.clips }),
    ),
    markers,
  });
  const front = 'video0';
  const main = rowId([...tracks].reverse().find((row) => row.type === 'video'));
  const track = (/** @type {string} */ id) => doc.tracks.find((t) => t.trackId === id);
  let placed = 0;
  /** @type {{ time: number, length: number }[]} */
  const opened = [];
  const later = (/** @type {number} */ time) =>
    time + opened.reduce((sum, gap) => sum + (gap.time <= time + 1e-6 ? gap.length : 0), 0);

  // Segments first, the last one first: the times before it stay what they were.
  const cards = wanted.filter((item) => item.kind === 'segment').sort((a, b) => b.time - a.time);
  for (const card of cards) {
    const made = putElement(doc, kit, card.id, card.slots, {
      ...{ time: card.time, trackId: main },
      ...(card.duration && { duration: card.duration }),
    });
    if (!made) continue;
    doc = made.edl;
    opened.push({ time: card.time, length: made.clip.timelineEnd - made.clip.timelineStart });
    placed++;
  }
  const end = timelineDuration(doc);
  for (const item of wanted.filter((entry) => entry.kind === 'transition')) {
    const cut = nearestCut(doc, later(item.time), 1);
    const span = cut === null ? null : coverSpan(doc, kit, item.id, cut);
    const free = span && [front, 'video1'].find((id) => !blocker(track(id), span.start, span.end));
    if (!free) {
      notes.push(`The ${item.label.toLowerCase()} at ${formatSeconds(item.time)} had no free cut.`);
      continue;
    }
    const made = putElement(doc, kit, item.id, {}, { time: cut, trackId: free });
    if (made) doc = made.edl;
    if (made) placed++;
  }
  for (const item of wanted.filter((entry) => entry.kind === 'overlay')) {
    const design = kit.elements[item.id];
    let start = snapToFrame(later(item.time), fps);
    const until = Number.isFinite(item.until) ? later(item.until) : end;
    const busy = blocker(track(front), start, start + SHORTEST);
    if (busy) start = busy.timelineEnd;
    const asked = item.duration || Number(design?.duration) || 5;
    const length = snapToFrame(Math.min(asked, until - start), fps);
    const next = blocker(track(front), start, start + length);
    const fits = next ? next.timelineStart - start : length;
    if (fits < SHORTEST - 1e-6) {
      const what = Object.values(item.slots)[0] || item.label;
      notes.push(`“${what}” did not fit beside what is already on screen — left out.`);
      continue;
    }
    const made = putElement(doc, kit, item.id, item.slots, {
      ...{ time: start, duration: fits, trackId: front },
    });
    if (made) doc = made.edl;
    if (made) placed++;
  }
  return {
    tracks: tracks.map((row) => ({ ...row, clips: track(rowId(row)).clips })),
    markers: doc.markers || [],
    notes,
    placed,
  };
}
