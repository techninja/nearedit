/**
 * Shared JSDoc types of the captions library. No runtime code.
 * Contract: docs/app-spec/CAPTIONS.md.
 * @module utils/captions/types
 */

/**
 * A word as a clip or a caption track carries it: when it starts and ends,
 * in seconds, and what is said.
 * @typedef {[start: number, end: number, text: string]} Word
 */

/**
 * A clip's `captions` block.
 * @typedef {Object} CaptionsBlock
 * @property {boolean} on
 * @property {Word[]} [words] - The clip's own words, in source seconds;
 *   absent = the transcript of its file
 */

/**
 * A complete caption style. Lengths are units: hundredths of the frame's
 * shorter side. Fields, ranges and defaults: `CAPTION_STYLE`.
 * @typedef {Object} CaptionStyle
 * @property {string} preset
 * @property {{ family: string, weight: number }} font
 * @property {number} size - Font size
 * @property {'as-is'|'upper'|'lower'} case
 * @property {'keep'|'strip'} punctuation
 * @property {string} color
 * @property {{ color: string, width: number }} stroke - Outline; width 0 = none
 * @property {{ color: string, opacity: number, blur: number, x: number, y: number }} shadow
 * @property {{ on: boolean, color: string, opacity: number, padding: number, radius: number }} plate
 * @property {{ mode: 'color'|'box'|'scale'|'underline'|'none', color: string, scale: number }} highlight
 * @property {'show'|'dim'|'hide'} unspoken
 * @property {{ words: number, chars: number, lines: number, pause: number }} group
 * @property {number} hold - Seconds a group stays after its last word
 * @property {{ anchor: 'top'|'middle'|'bottom', offset: number }} position
 * @property {boolean} avoid - A group moves clear of a brand overlay that is in its way
 * @property {{ in: 'none'|'fade'|'pop'|'slide', word: 'none'|'pop'|'glide'|'fill', seconds: number }} motion
 */

/**
 * One word of a group, as it is shown.
 * @typedef {Object} GroupWord
 * @property {string} text - With the style's capitals and punctuation
 * @property {number} start
 * @property {number} end
 * @property {boolean} glue - Follows the word before without a space
 */

/**
 * Words that are on screen together.
 * @typedef {Object} CaptionGroup
 * @property {number} index - Its place among the groups
 * @property {number} start - Start of its first word: when it appears
 * @property {number} end - End of its last word
 * @property {number} until - When it leaves: `hold` after `end`, or when the next group starts
 * @property {GroupWord[]} words
 * @property {number[]} lines - How many words each line holds
 * @property {string} text - The lines, joined by `\n`
 */

/**
 * What is on screen at an instant.
 * @typedef {Object} CaptionState
 * @property {CaptionGroup} [group]
 * @property {number} word - Index in the group of the word being said (the
 *   last one that has started; it stays marked through pauses and the hold)
 * @property {number} age - Seconds since the group appeared
 * @property {number} wordAge - Seconds since the word being said started
 * @property {number} wordProgress - 0..1 through that word's own length
 * @property {number} [lane] - 0 for the first voice; a second voice at the
 *   same moment is laid out one lane further from the anchored edge
 * @property {number} [lift] - Units the group sits lower by (negative:
 *   higher) to be clear of something in its way; the same for the whole group
 */

/**
 * The canvas being drawn, as the compositor describes it. Only `width` and
 * `height` are required.
 * @typedef {Object} CaptionFrame
 * @property {number} width - Canvas pixels
 * @property {number} height
 * @property {number} [scale] - Canvas pixels per output pixel
 * @property {number} [outWidth] - Output pixels
 * @property {number} [outHeight]
 * @property {any[]} [fonts] - The document's own fonts
 */

/** @typedef {{ x: number, y: number, width: number, height: number }} Rect - Canvas pixels */

/**
 * One word of a laid-out caption. Its place never changes while its group
 * is on screen; everything else follows the instant.
 * @typedef {Object} LaidWord
 * @property {string} text
 * @property {number} x - Left edge
 * @property {number} y - Baseline
 * @property {number} cy - Middle of its line: what it scales about
 * @property {number} width
 * @property {number} line
 * @property {'said'|'saying'|'unsaid'} state
 * @property {string} color - Fill colour at this instant
 * @property {number} alpha - 0 = not drawn
 * @property {number} scale - About the middle of the word
 * @property {number} dy - Offset downward
 * @property {number} sweep - 0..1: only this much of the word, from its
 *   leading edge, has arrived; the rest is drawn as `rest` describes
 * @property {{ color: string, alpha: number } | null} rest - The part the
 *   sweep has not reached; null = nothing drawn there
 */

/**
 * A caption ready to draw: `drawCaption` needs nothing else but the style.
 * @typedef {Object} LaidCaption
 * @property {string} font - Canvas `font` value at the laid-out size
 * @property {number} size - Font size, canvas pixels (smaller than the
 *   style's when a line had to shrink to fit)
 * @property {number} unit - Canvas pixels per unit
 * @property {boolean} rtl - Lines run right to left
 * @property {LaidWord[]} words - In reading order
 * @property {Rect} box - The lines' box
 * @property {Rect | null} plate - The box behind the group
 * @property {(Rect & { radius: number, kind: 'box'|'underline' }) | null} mark -
 *   The pill or underline at this instant
 * @property {string} onMark - Colour of letters where a pill covers them
 * @property {{ alpha: number, scale: number, dy: number }} motion - The
 *   whole caption's arrival, about the middle of `box`
 */

/**
 * One subtitle cue, in timeline seconds.
 * @typedef {{ start: number, end: number, text: string }} Cue
 */

export {};
