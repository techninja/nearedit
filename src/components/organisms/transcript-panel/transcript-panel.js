/**
 * Transcript panel — editing by text. Shows the word-level transcript of
 * the selected clip (or the clip under the cursor, or a file pinned from
 * the library) as flowing text that mirrors the edit: words cut or trimmed
 * away are struck out, the word under the playhead is highlighted. Click a
 * word to go there; select a range to cut it, keep only it, add it to the
 * timeline or mark it; remove silences; find, copy, export; correct a word;
 * switch the words on as captions.
 * @module components/organisms/transcript-panel
 */

import { define, html } from 'hybrids';
import { transcribeState } from '#utils/captionsUi/transcribe.js';
import { getDoc } from '#utils/editor/session.js';
import { containTyping } from '#utils/inspector/fieldEvents.js';
import { getLibrary, getMediaItem } from '#utils/media/library.js';
import { explainMissing } from '#utils/transcript/missing.js';
import { chainCaptions } from '#utils/transcript/panelCaptions.js';
import * as on from '#utils/transcript/panelCommands.js';
import { panelContext } from '#utils/transcript/panelContext.js';
import * as jobs from '#utils/transcript/panelJobs.js';
import * as pointer from '#utils/transcript/panelPointer.js';
import { connectPanel } from '#utils/transcript/panelSync.js';
import { planSilenceRemoval } from '#utils/transcript/silences.js';
import { footer, handleTextKeys, hide, paragraphs } from '#utils/transcript/panelParts.js';
import { watch } from '#utils/ui/observable.js';
import '#molecules/transcript-actions/transcript-actions.js';
import '#molecules/transcript-empty/transcript-empty.js';
import '#molecules/transcript-paragraph/transcript-paragraph.js';
import '#molecules/transcript-silence/transcript-silence.js';
import '#molecules/transcript-toolbar/transcript-toolbar.js';

/** @typedef {import('#utils/transcript/panelContext.js').TranscriptPanelHost} TranscriptPanelHost */

/** @type {import('hybrids').Component<TranscriptPanelHost>} */
export default define({
  tag: 'transcript-panel',
  file: '',
  focusClip: '',
  track: '',
  note: '',
  pinnedPath: '',
  sidecar: { value: {} },
  loading: false,
  revision: { value: 0, connect: connectPanel },
  anchor: -1,
  head: -1,
  current: -1,
  editing: -1,
  extend: false,
  query: '',
  match: -1,
  silence: false,
  threshold: 0.8,
  padding: 0.1,
  jobs: watch(transcribeState),
  status: { value: {} },
  message: '',
  render: {
    value: (host) => {
      const ctx = host.revision >= 0 && panelContext(host);
      const { units, range, chain, editable } = ctx;
      const item = getMediaItem(host.file);
      const files = getLibrary().filter((entry) => entry.analysis?.transcript);
      const ready = units.length > 0;
      const job = host.jobs.byFile[host.file] || { error: '' };
      const span = range ? units[range.last].end - units[range.first].start : 0;
      const source = ready ? { words: units } : { silences: host.sidecar.silences || [] };
      const settings = { threshold: host.threshold, padding: host.padding, fps: getDoc().fps };
      const total = chain.segments.reduce((sum, s) => sum + (s.timelineEnd - s.timelineStart), 0);
      return html`
        <div
          class="transcript-panel panel"
          onkeydown="${containTyping}"
          ontranscript-pin="${on.handlePin}"
          ontranscript-search="${on.handleSearch}"
          ontranscript-step="${on.handleStep}"
          ontranscript-tool="${on.handleTool}"
          ontranscript-action="${on.handleAction}"
          ontranscript-silence-change="${on.handleSilenceChange}"
          ontranscript-silence-apply="${on.handleSilenceApply}"
          ontranscript-transcribe="${jobs.handleTranscribe}"
          ontranscript-cancel="${jobs.handleCancelTranscribe}"
          ontranscript-correct="${jobs.handleCorrect}"
          ontranscript-correct-cancel="${hide('editing')}"
        >
          <transcript-toolbar
            file="${host.file}"
            pinned="${!!host.pinnedPath}"
            files="${files}"
            ready="${ready}"
            query="${host.query}"
            hitCount="${ctx.matches.length}"
            hitIndex="${host.match}"
            silence="${host.silence}"
            captions="${chainCaptions(getDoc(), chain).state}"
          ></transcript-toolbar>
          ${host.silence &&
          html`<transcript-silence
            threshold="${host.threshold}"
            padding="${host.padding}"
            plan="${planSilenceRemoval(chain, source, settings)}"
            total="${total}"
            editable="${editable}"
          ></transcript-silence>`}
          ${ready &&
          html`<transcript-actions
            count="${range ? range.last - range.first + 1 : 0}"
            seconds="${span}"
            editable="${editable}"
            placed="${!!range && ctx.states[range.first] > 0}"
            extend="${host.extend}"
            unit="${ctx.level === 'segment' ? 'phrase' : 'word'}"
          ></transcript-actions>`}
          ${ready
            ? html`<div
                class="transcript-panel-body"
                tabindex="0"
                role="group"
                aria-label="Transcript"
                onclick="${pointer.handleTextClick}"
                ondblclick="${pointer.handleTextDoubleClick}"
                onpointerdown="${pointer.handleTextPointerDown}"
                onpointermove="${pointer.handleTextPointerMove}"
                onkeydown="${handleTextKeys}"
              >
                ${paragraphs(host, ctx)}
              </div>`
            : html`<transcript-empty
                reason="${explainMissing(
                  host,
                  item,
                  host.loading ? null : host.sidecar,
                  host.status,
                )}"
                job="${job}"
                error="${host.message || job.error || ''}"
                loading="${host.loading}"
              ></transcript-empty>`}
          ${footer(host, ctx)}
        </div>
      `;
    },
    shadow: false,
  },
});
