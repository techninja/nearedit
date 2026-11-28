/**
 * Shared JSDoc types for the EDL library. No runtime code.
 * Field semantics: docs/app-spec/EDL.md.
 * @module utils/edl/types
 */

/**
 * One effect of a clip's or a track's stack.
 * @typedef {Object} Effect
 * @property {string} effectId - Unique within its stack
 * @property {string} type - Name in the effect catalog
 * @property {boolean} enabled
 * @property {Record<string, any>} params - Free-form, JSON-safe
 */

/**
 * One keyframe: `t` in clip-local source time, `v` a number or hex colour,
 * `ease` shaping the segment that leaves the key.
 * @typedef {{ t: number, v: number|string, ease: string }} Keyframe
 */

/**
 * @typedef {Object} Clip
 * @property {string} clipId
 * @property {string} sourceFile - Absolute path; empty for generators, titles and placeholders
 * @property {number} sourceIn - May be negative unless the clip plays video or audio
 * @property {number} sourceOut - Always `sourceIn` + the clip's duration
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
 * @property {string} blendMode
 * @property {string} fadeInCurve
 * @property {string} fadeOutCurve
 * @property {{ type: string, seed: number, params: Record<string, any> }} generator
 * @property {Effect[]} effects
 * @property {Record<string, Keyframe[]>} keyframes - By property path
 * @property {Record<string, any>} text
 * @property {Record<string, any>} transform
 * @property {import('#utils/web/types.js').WebBlock} [web] - Only on a web
 *   clip: its recipe, the key of its recording, the page's title
 * @property {import('#utils/music/types.js').MusicBlock} [music] - Only on
 *   a music clip: its song and the key of its rendering
 * @property {import('#utils/brand/types.js').ElementBlock} [element] - Only
 *   on an element clip: the brand element it is an instance of, its slots
 *   and its design
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
 * @property {number} opacity
 * @property {string} blendMode
 * @property {Effect[]} effects
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
 * A named stretch of the timeline (regions.js).
 * @typedef {Object} Region
 * @property {string} regionId
 * @property {number} start
 * @property {number} end - At least one frame after `start`
 * @property {string} label
 * @property {string} color
 */

/**
 * @typedef {Object} Edl
 * @property {number} version
 * @property {number} fps
 * @property {string} resolution
 * @property {string} background - Colour behind everything, `#rrggbb`
 * @property {Track[]} tracks - Video tracks first, then audio
 * @property {Marker[]} markers - Sorted by time
 * @property {Region[]} [regions] - Sorted by start, then end
 * @property {import('#utils/brand/fontTable.js').FontFace[]} [fonts] - Font
 *   files the document needs that are not bundled; absent when it needs none
 */

/**
 * Known source durations in seconds, keyed by `sourceFile`.
 * @typedef {Record<string, number> | Map<string, number>} SourceDurations
 */

/**
 * What an effect operation works on: a clip's stack or a track's.
 * @typedef {{ clipId: string } | { trackId: string }} EffectTarget
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
