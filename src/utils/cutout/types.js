/**
 * Shapes of the person cutout: the block a clip carries, the description of
 * a cutout file, and the stretch of a media file a timeline needs. Types
 * only — nothing runs here. Contract: docs/app-spec/CUTOUT.md.
 * @module utils/cutout/types
 */

/**
 * The `cutout` field of a video clip.
 * @typedef {Object} CutoutBlock
 * @property {boolean} on - Draw the clip through its matte
 * @property {'remove'|'blur'} mode - Remove the background, or blur it
 * @property {number} feather - Softness of the edge, units
 * @property {number} shrink - Pull the edge in (positive) or let it out, units
 * @property {number} blur - For `mode: blur`: how soft the background is, units
 * @property {CutoutMade} [made] - The cutout file that was made for the clip
 */

/**
 * What a clip remembers of the cutout made for it (`cutout.made`): the
 * result of a finished `cutout` job.
 * @typedef {Object} CutoutMade
 * @property {string} file - The cutout file, absolute: `<project>/.nearedit/cutout/<key>.mp4`
 * @property {string} key
 * @property {string} source - The media file it was cut out of, absolute
 * @property {number} start - Seconds into the source of its first frame
 * @property {number} end - Seconds into the source it ends on
 * @property {number} fps - The rate it was made at
 * @property {number} width - Of the picture: the video is twice as wide
 * @property {number} height
 * @property {number} frames
 */

/**
 * What a media file is, for a key: a changed file is another file.
 * @typedef {Object} CutoutSource
 * @property {string} path - Absolute
 * @property {number} size - Bytes
 * @property {number} mtime - Milliseconds, whole (as the media list gives it)
 */

/**
 * `<project>/.nearedit/cutout/<key>.json`: what the MP4 beside it holds.
 * @typedef {Object} CutoutMeta
 * @property {number} version - Of this description: 1
 * @property {string} key
 * @property {CutoutSource} source
 * @property {number} start - Seconds into the source of the first frame
 * @property {number} end - Seconds into the source the cutout ends on: `start + frames / fps`
 * @property {number} fps
 * @property {number} width - Of the picture: the video is twice as wide, the
 *   picture on the left and its matte on the right
 * @property {number} height
 * @property {number} frames
 * @property {string} model - What made the matte, with its settings
 */

/**
 * The stretch of one media file a timeline's cutout clips use.
 * @typedef {Object} CutoutRange
 * @property {string} path - The media file
 * @property {number} start - Seconds, on the frame grid
 * @property {number} end - Seconds, on the frame grid
 * @property {number} fps
 * @property {number} frames
 * @property {string[]} clips - Ids of the clips it is for
 */

export {};
