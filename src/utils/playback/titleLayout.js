/**
 * Title layout constants. Title layout and drawing now live in the shared
 * compositor (`#utils/compose/text/`); this module only keeps the two
 * constants at the path the FFmpeg title renderer imports them from.
 * @module utils/playback/titleLayout
 */

export { TITLE_BOX_PADDING, TITLE_LINE_HEIGHT } from '#utils/compose/text/style.js';
