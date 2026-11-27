/**
 * The footage of a canvas segment: one decoder per clip, started shortly
 * before the clip appears and stopped when it has gone, each delivering
 * exactly one frame per output frame. The frame a clip shows is left with
 * the host, where the compositor's `frameOf` finds it.
 * @module api/render/canvas/footage
 */

import { openDecoder } from './pipes.js';

/** Frames ahead of a clip's first that its decoder is started, to hide the seek. */
const HEAD_START = 12;

/**
 * @param {import('./plan.js').Footage[]} items - The segment's footage clips
 * @param {import('./host.js').CanvasHost} host
 * @param {(message: string) => void} [warn]
 * @returns {{ advance: (frame: number) => Promise<void>, close: () => void }}
 *   `advance` puts the frame every active clip shows at a timeline frame in
 *   place; call it for every frame of the segment, in order
 */
export function createFootage(items, host, warn = () => {}) {
  /** @type {Map<string, { decoder: ReturnType<typeof openDecoder>, source: any, dry: boolean }>} */
  const open = new Map();

  const stop = (clipId) => {
    const entry = open.get(clipId);
    if (!entry) return;
    entry.decoder.close();
    host.release(entry.source);
    host.frames.delete(clipId);
    open.delete(clipId);
  };

  return {
    async advance(frame) {
      for (const item of items) {
        const { clipId } = item;
        if (frame >= item.first + item.count) {
          stop(clipId);
          continue;
        }
        if (frame < item.first - HEAD_START) continue;
        if (!open.has(clipId)) {
          const source = host.frameSource(item.width, item.height);
          open.set(clipId, { decoder: openDecoder(item), source, dry: false });
        }
        if (frame < item.first) continue;
        const entry = open.get(clipId);
        const pixels = entry.dry ? null : await entry.decoder.next();
        if (pixels) {
          host.frames.set(clipId, entry.source.put(pixels));
        } else if (!entry.dry) {
          // The last frame, if there was one, stays on screen.
          entry.dry = true;
          warn(`clip "${clipId}": ${item.file} has no picture at this position`);
        }
      }
    },
    close() {
      for (const clipId of [...open.keys()]) stop(clipId);
    },
  };
}
