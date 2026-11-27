/**
 * The rules that turn the stretches between clip boundaries into segments:
 * keep plain footage and compositor work apart, never make a segment
 * shorter than the minimum, respect the layer budget, and cut long canvas
 * segments into chunks. Pure.
 * @module api/render/segmentRules
 */

/**
 * @typedef {{ start: number, end: number, needs: string[] }} Piece - A stretch
 *   of frames and why it needs the compositor (empty: the filter graph can draw it)
 * @typedef {import('./segments.js').Segment} Segment
 */

const length = (piece) => piece.end - piece.start;
const drawn = (piece) => piece.needs.length > 0;
const union = (a, b) => [...new Set([...a, ...b])];

/**
 * Join consecutive pieces into segments. Two pieces end up in one segment
 * when they use the same renderer and together stay within the layer budget
 * — or when one of them is too short to stand alone. A short compositor
 * stretch borrows just the frames it lacks from the plain footage next to
 * it rather than pulling the whole neighbour onto the slow path.
 * @param {Piece[]} pieces - In order, covering the range
 * @param {{ minFrames: number, fits: (from: number, to: number) => boolean }} rules -
 *   `fits`: whether a span of frames stays within the layer budget
 * @returns {Segment[]}
 */
export function grouped(pieces, { minFrames, fits }) {
  const queue = pieces.map((piece) => ({ ...piece }));
  /** @type {Piece[]} */
  const segments = [];
  /** @type {Piece|null} */
  let current = null;
  for (let i = 0; i < queue.length; i++) {
    const piece = queue[i];
    if (!current) {
      current = piece;
      continue;
    }
    const lacking = minFrames - length(current);
    if (lacking > 0) {
      if (drawn(current) && !drawn(piece) && length(piece) - lacking >= minFrames) {
        current.end += lacking;
        queue[i--] = { ...piece, start: piece.start + lacking };
      } else {
        current = {
          start: current.start,
          end: piece.end,
          needs: union(current.needs, piece.needs),
        };
      }
    } else if (drawn(current) === drawn(piece) && fits(current.start, piece.end)) {
      current = { start: current.start, end: piece.end, needs: union(current.needs, piece.needs) };
    } else {
      segments.push(current);
      current = piece;
    }
  }
  if (current) segments.push(current);
  settleTail(segments, minFrames);
  return rejoined(segments, fits).map(({ start, end, needs }) => ({
    ...{ start, end },
    engine: needs.length ? 'canvas' : 'ffmpeg',
    reasons: needs,
  }));
}

/**
 * Absorbing a short stretch can leave two segments of one renderer side by
 * side: join them again where the layer budget allows.
 * @param {Piece[]} segments
 * @param {(from: number, to: number) => boolean} fits
 * @returns {Piece[]}
 */
function rejoined(segments, fits) {
  /** @type {Piece[]} */
  const out = [];
  for (const segment of segments) {
    const before = out[out.length - 1];
    if (before && drawn(before) === drawn(segment) && fits(before.start, segment.end)) {
      before.end = segment.end;
      before.needs = union(before.needs, segment.needs);
    } else {
      out.push({ ...segment });
    }
  }
  return out;
}

/**
 * A last segment that is too short borrows from the one before it, or joins it.
 * @param {Piece[]} segments - Changed in place
 * @param {number} minFrames
 */
function settleTail(segments, minFrames) {
  if (segments.length < 2) return;
  const last = segments[segments.length - 1];
  const before = segments[segments.length - 2];
  const lacking = minFrames - length(last);
  if (lacking <= 0) return;
  if (drawn(last) && !drawn(before) && length(before) - lacking >= minFrames) {
    before.end -= lacking;
    last.start -= lacking;
    return;
  }
  segments.pop();
  before.end = last.end;
  before.needs = union(before.needs, last.needs);
}

/**
 * Cut a segment into chunks of at most `chunkFrames`, so several can be
 * rendered at once. Chunks start on the keyframe grid of the segment (the
 * chunk length is a whole number of keyframe intervals), so cutting adds no
 * keyframes; a remainder too short to stand alone joins the chunk before it.
 * @param {Segment} segment
 * @param {number} chunkFrames
 * @param {number} minFrames
 * @returns {Segment[]}
 */
export function chunked(segment, chunkFrames, minFrames) {
  const parts = [];
  for (let start = segment.start; start < segment.end; start += chunkFrames)
    parts.push({ ...segment, start, end: Math.min(segment.end, start + chunkFrames) });
  const last = parts[parts.length - 1];
  if (parts.length > 1 && length(last) < minFrames) {
    parts.pop();
    parts[parts.length - 1].end = last.end;
  }
  return parts;
}
