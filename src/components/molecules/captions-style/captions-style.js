/**
 * Captions of the timeline — where they stand ("On for 2 of 3 clips · 181
 * words"), "Caption all speech", "Save subtitles", the files that still
 * need a transcript, and the one style every caption is drawn with: the
 * presets as tiles that move (still when the system asks for less motion;
 * arrow keys walk them), "Back to preset" when something differs, and the
 * fields of `CAPTION_STYLE` as controls, in the sections the table names.
 * The preview follows every change as it is made; a drag is one undo step.
 * With `plain` only the style shows (under a clip's own Captions group).
 * @module components/molecules/captions-style
 */

import { define, html } from 'hybrids';
import { liveDoc } from '#utils/editor/liveDoc.js';
import { changedPaths, presetOf, styleSections } from '#utils/captionsUi/styleControls.js';
import { handleBackToPreset, listenForStyle } from '#utils/captionsUi/styleEvents.js';
import { presetTiles, sectionFields } from '#utils/captionsUi/styleParts.js';
import { styleView } from '#utils/captionsUi/styleView.js';
import { captionSummary } from '#utils/captionsUi/summary.js';
import { onMotionPreference, prefersStill } from '#utils/captionsUi/tileClock.js';
import { timelineRows } from '#utils/captionsUi/timelineParts.js';
import { loadProvider, transcribeState } from '#utils/captionsUi/transcribe.js';
import { wordBook, wordsSignal } from '#utils/captionsUi/words.js';
import { watch } from '#utils/ui/observable.js';
import '#atoms/app-icon/app-icon.js';
import '#atoms/caption-tile/caption-tile.js';
import '#atoms/field-color/field-color.js';
import '#atoms/field-number/field-number.js';

/**
 * @typedef {Object} CaptionsStyleHost
 * @property {boolean} plain - Only the style: no timeline state or actions
 * @property {any} doc - The open document
 * @property {number} words - Grows when a transcript arrives or changes
 * @property {import('#utils/captionsUi/transcribe.js').TranscribeState} jobs
 * @property {import('#utils/captionsUi/styleView.js').StyleView} view
 * @property {boolean} still - The system asks for less motion: tiles rest
 */

/** @typedef {CaptionsStyleHost & HTMLElement} Host */

/**
 * Follow the motion preference; learn whether this server can transcribe.
 * @param {Host} host
 * @param {string} _key
 * @param {() => void} invalidate
 * @returns {() => void}
 */
function connectStill(host, _key, invalidate) {
  if (!host.plain) loadProvider();
  return onMotionPreference(invalidate);
}

/**
 * Someone asked to see the style: bring it into view.
 * @param {Host} host
 * @param {import('#utils/captionsUi/styleView.js').StyleView} view
 * @param {import('#utils/captionsUi/styleView.js').StyleView} [last]
 */
function reveal(host, view, last) {
  if (!last || view.asked === last.asked) return;
  requestAnimationFrame(() => {
    const target = host.querySelector('.captions-style-heading') || host;
    target.scrollIntoView({ block: 'nearest' });
    /** @type {HTMLElement|null} */ (host.querySelector('.captions-style-tile'))?.focus();
  });
}

/** @type {import('hybrids').Component<CaptionsStyleHost>} */
export default define({
  tag: 'captions-style',
  plain: false,
  doc: liveDoc(),
  words: watch(wordsSignal),
  jobs: watch(transcribeState),
  view: { ...watch(styleView), observe: reveal },
  still: { value: () => prefersStill(), connect: connectStill },
  render: {
    value: ({ plain, doc, words, jobs, still }) => {
      const stored = doc.captions?.style;
      const fonts = doc.fonts || [];
      const preset = presetOf(stored);
      const changed = changedPaths(stored).length;
      const summary = !plain && words >= 0 ? captionSummary(doc, wordBook.get) : null;
      return html`
        ${summary
          ? html`<div class="field-group-title">Captions</div>
              ${timelineRows(summary, jobs)}`
          : html``}
        <div class="field-group-title captions-style-heading">
          <span title="One style for every caption of this timeline">Caption style</span>
          ${changed
            ? html`<button
                type="button"
                class="icon-btn captions-style-back"
                title="${`Drop the ${changed} changed ${changed === 1 ? 'field' : 'fields'}: ${preset.label} as it comes`}"
                onclick="${handleBackToPreset}"
              >
                <app-icon name="undo" size="sm"></app-icon> Back to preset
              </button>`
            : html``}
        </div>
        ${presetTiles(stored, fonts, !still)}
        <p class="captions-style-about">${preset.label} — ${preset.description}.</p>
        ${sectionFields(styleSections(stored), fonts)}
      `;
    },
    shadow: false,
    connect: listenForStyle,
  },
});
