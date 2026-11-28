/**
 * Inspector group "Captions" — for selected clips that play video or
 * sound: the switch, and one honest line about the words — how many the
 * clip shows, that a transcript is being made and how far it is, or that
 * there is none yet, with a button that makes one (captions then appear by
 * themselves) or the reason this server cannot. "Edit words" opens the
 * transcript panel on the clip's file; "Style" unfolds the timeline's
 * caption style in place.
 * @module components/molecules/captions-inspector
 */

import { define, html } from 'hybrids';
import * as on from '#utils/captionsUi/clipEvents.js';
import { captionLine } from '#utils/captionsUi/clipState.js';
import '#utils/captionsUi/commands.js';
import { styleView } from '#utils/captionsUi/styleView.js';
import { loadProvider, transcribeState } from '#utils/captionsUi/transcribe.js';
import { wordBook, wordsSignal } from '#utils/captionsUi/words.js';
import { getMediaItem } from '#utils/media/library.js';
import { watch } from '#utils/ui/observable.js';
import '#atoms/app-icon/app-icon.js';
import '#molecules/captions-style/captions-style.js';

/** @typedef {import('#utils/captionsUi/clipEvents.js').CaptionsInspectorHost} CaptionsInspectorHost */

/**
 * The line about one voice's words, with its button and its explanation.
 * @param {import('#utils/captionsUi/clipState.js').CaptionLine} line
 * @param {boolean} locked
 * @returns {import('hybrids').UpdateFunctionWithMethods<CaptionsInspectorHost>}
 */
function stateRows(line, locked) {
  return html`
    <div class="field-row captions-inspector-state">
      <span class="field-label">Words</span>
      <span class="captions-inspector-line" data-kind="${line.kind}" data-tone="${line.tone}">
        <span role="status">${line.text}</span>
        ${line.action
          ? html`<button
              type="button"
              class="btn ${line.action === 'cancel' ? 'btn-ghost' : 'btn-secondary'}"
              data-action="${line.action}"
              disabled="${locked && line.action !== 'cancel'}"
              onclick="${on.handleAction}"
            >
              ${line.actionLabel}
            </button>`
          : html``}
      </span>
    </div>
    ${line.kind === 'transcribing'
      ? html`<div class="progress captions-inspector-progress">
          <div class="progress-bar" style="${{ width: `${line.progress}%` }}"></div>
        </div>`
      : html``}
    ${line.detail && line.kind !== 'transcribing'
      ? html`<details class="captions-inspector-why">
          <summary>Why?</summary>
          <p>${line.detail}</p>
        </details>`
      : html``}
  `;
}

/** @type {import('hybrids').Component<CaptionsInspectorHost>} */
export default define({
  tag: 'captions-inspector',
  model: { value: /** @type {any} */ ({}), connect: () => void loadProvider() },
  words: watch(wordsSignal),
  jobs: watch(transcribeState),
  view: watch(styleView),
  render: {
    value: (host) => {
      const { model, jobs, view } = host;
      const subject = host.words >= 0 && on.subjectOf(host);
      if (!subject || !subject.voices.length) return html``;
      const [{ info, carrier }] = subject.voices;
      const single = subject.voices.length === 1;
      const all = subject.on === subject.voices.length;
      const line = captionLine({
        info,
        carrier,
        words: wordBook.get(info.file),
        job: jobs.byFile[info.file] || null,
        provider: jobs.provider,
        item: getMediaItem(info.file) || null,
      });
      return html`
        <div class="field-group-title">Captions</div>
        <label class="field-row captions-inspector-switch">
          <span class="field-label">Words on screen</span>
          <span class="switch">
            <input
              type="checkbox"
              aria-label="Captions"
              checked="${all}"
              indeterminate="${subject.on > 0 && !all}"
              disabled="${model.locked}"
              onchange="${on.handleSwitch}"
            />
            ${single
              ? info.on
                ? 'On'
                : 'Off'
              : `On for ${subject.on} of ${subject.voices.length} selected`}
          </span>
        </label>
        ${single ? stateRows(line, model.locked) : html``}
        <div class="captions-inspector-actions">
          ${single && info.file
            ? html`<button
                type="button"
                class="btn btn-secondary captions-inspector-words"
                title="Open the transcript of this file: a corrected word changes its caption"
                onclick="${on.handleWords}"
              >
                <app-icon name="edit" size="sm"></app-icon> Edit words
              </button>`
            : html``}
          <button
            type="button"
            class="btn btn-secondary captions-inspector-fold"
            aria-expanded="${view.open ? 'true' : 'false'}"
            title="The style every caption of this timeline is drawn with"
            onclick="${on.handleFold}"
          >
            <app-icon name="${view.open ? 'chevron-up' : 'chevron-down'}" size="sm"></app-icon>
            Style
          </button>
        </div>
        ${view.open ? html`<captions-style plain></captions-style>` : html``}
      `;
    },
    shadow: false,
  },
});
