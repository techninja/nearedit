/**
 * The logo wipe: the E, grown until its three clips are the whole frame.
 * The clips shoot in from the left, one after another, and cover the
 * picture; then the playhead that holds them comes through and carries
 * them off to the right, uncovering what is under it. Put a cut where the
 * frame is covered (`WIPE.cut`) and nobody sees it.
 *
 * The two scenes under the wipe are only there to show that: delete the
 * tracks "Scenes" and "Scene names" and lay the rest over a cut of yours.
 * @module examples/logo-sting/wipe
 */

import { CLIP, CLIPS, INK, STEM } from './logo.js';
import { keys, layer, rectangle, space } from './sheet.js';

/** One frame at 30 a second. */
const F = 1 / 30;

/** The wipe in frames: its length, when the frame is covered, where the cut goes. */
export const WIPE = { frames: 36, covered: [14, 18], cut: 16 };
export const WIPE_SECONDS = WIPE.frames * F;

/**
 * The wipe for one frame size.
 * @param {{ width: number, height: number }} frame
 * @returns {Record<string, any>} A NearEdit document
 */
export function buildWipe({ width, height }) {
  const s = space(1, width / 2, height / 2); // plain pixels from the top left
  const D = WIPE_SECONDS;
  const band = height / 3;
  const radius = Math.round((band * CLIP.radius) / CLIP.height);
  const stem = Math.round((Math.min(width, height) * STEM) / 66);
  // While the frame is covered the playhead waits just outside it, left.
  // The clips begin under it — at its left edge, so that it hides their
  // round left ends when it comes through — and reach past the right edge.
  const waiting = -stem - 20;
  const gone = width + 20;
  const length = width - waiting + radius + 20;
  const [covered, leave] = WIPE.covered;
  const travel = gone - waiting;
  /**
   * Keys that carry something off with the playhead, from where it rests.
   * @param {number} rest
   * @returns {[number, number, string?][]}
   */
  const carried = (rest) => [
    [leave * F, rest, 'ease-in-out'],
    [(WIPE.frames - 1) * F, rest + travel],
  ];

  const post = rectangle(s, { x: waiting, y: -20, w: stem, h: height + 40, fill: INK.red });
  const playhead = layer('Playhead', D, {
    generator: post,
    keyframes: { 'generator.params.offsetX': keys(carried(post.params.offsetX)) },
  });

  const clips = CLIPS.map((clip, i) => {
    // A pixel of overlap between neighbours, so no line of the picture shows through.
    const box = { x: waiting, y: i * band - 1, w: length, h: band + 2, radius, fill: clip.fill };
    const generator = rectangle(s, box);
    const rest = generator.params.offsetX;
    const start = i * 2 * F;
    const ride = keys([
      [start, rest - length - 20, 'ease-out'],
      [(covered - 4 + i * 2) * F, rest, 'hold'],
      ...carried(rest),
    ]);
    return layer(`Clip ${clip.name}`, D, {
      generator,
      keyframes: { 'generator.params.offsetX': ride },
    });
  });

  return {
    version: 3,
    fps: 30,
    resolution: `${width}x${height}`,
    tracks: [playhead, ...clips, ...scenes(width, height)],
  };
}

/**
 * Two scenes with a hard cut between them, and their names: something for
 * the wipe to hide.
 * @param {number} width
 * @param {number} height
 * @returns {Record<string, any>[]} Two tracks
 */
function scenes(width, height) {
  const cut = WIPE.cut * F;
  const looks = [
    { name: 'Scene A', span: [0, cut], colors: ['#7c2d12', '#f97316'] },
    { name: 'Scene B', span: [cut, WIPE_SECONDS], colors: ['#0c4a6e', '#22d3ee'] },
  ];
  const fontSize = Math.round(Math.min(width, height) * 0.16);
  return [
    {
      type: 'video',
      name: 'Scene names',
      clips: looks.map(({ name, span }) => ({
        ...{ label: name, timelineStart: span[0], timelineEnd: span[1] },
        text: { content: name, fontFamily: 'Inter', weight: 900, fontSize, color: INK.white },
      })),
    },
    {
      type: 'video',
      name: 'Scenes',
      clips: looks.map(({ name, span, colors }) => ({
        ...{ label: name, timelineStart: span[0], timelineEnd: span[1] },
        generator: {
          type: 'gradient',
          params: { angle: 135, color1: colors[0], color2: colors[1] },
        },
      })),
    },
  ];
}
