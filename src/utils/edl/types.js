/**
 * Shared JSDoc types for the EDL library. No runtime code.
 * Field semantics: docs/app-spec/EDL.md.
 * @module utils/edl/types
 */

/**
 * @typedef {Object} Clip
 * @property {string} clipId
 * @property {string} sourceFile - Absolute path; empty for titles and placeholders
 * @property {number} sourceIn
 * @property {number} sourceOut
 * @property {number} timelineStart
 * @property {number} timelineEnd
 * @property {number} fadeIn
 * @property {number} fadeOut
 * @property {number} volume
 * @property {string} linkedClipId
 * @property {string} groupId
 * @property {boolean} placeholder
 * @property {string} label
 * @property {string} prompt
 * @property {string} intent
 * @property {string} color
 * @property {Record<string, any>} text
 * @property {Record<string, any>} transform
 */

/**
 * @typedef {Object} Track
 * @property {string} trackId
 * @property {'video'|'audio'} type
 * @property {string} name
 * @property {boolean} muted
 * @property {boolean} solo
 * @property {boolean} locked
 * @property {number} volume
 * @property {Clip[]} clips - Sorted by timelineStart, ties by timelineEnd
 */

/**
 * @typedef {Object} Marker
 * @property {string} markerId
 * @property {number} time
 * @property {string} label
 * @property {string} color
 */

/**
 * @typedef {Object} Edl
 * @property {number} version
 * @property {number} fps
 * @property {string} resolution
 * @property {Track[]} tracks - Video tracks first, then audio
 * @property {Marker[]} markers - Sorted by time
 */

/**
 * Known source durations in seconds, keyed by `sourceFile`.
 * @typedef {Record<string, number> | Map<string, number>} SourceDurations
 */

/**
 * A clip together with the track that holds it.
 * @typedef {{ clip: Clip, track: Track }} ClipRef
 */

/**
 * Flags shared by every operation that can make clips collide.
 * @typedef {Object} OverlapOptions
 * @property {boolean} [autoCrossfade=true] - Partial overlaps become cross-fades;
 *   when false the incoming clip overwrites what is under it
 * @property {boolean} [linked=true] - Linked partners follow the edit
 */

export {};
