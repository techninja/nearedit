/**
 * Parts list molecule — a row for every part of a song: what it is, its
 * name, its volume, mute and solo. The open part shows the rest below its
 * row: name, pan, the sends to the song's reverb and delay, the length of
 * its loop, the bars it plays in as a strip that can be painted, and
 * buttons to move, copy and delete it. Solo is for listening while
 * editing only — a song has no solo — and the list says so. Reports
 * `music-part`, `music-play` and `field-change`.
 * @module components/molecules/music-part-list
 */

import { define, html } from 'hybrids';
import { partLabel } from '#utils/music/label.js';
import { number } from '#utils/musicUi/fieldParts.js';
import * as on from '#utils/musicUi/partListEvents.js';
import { partDetails } from '#utils/musicUi/partListParts.js';
import '#atoms/app-icon/app-icon.js';

/** @typedef {import('#utils/musicUi/partListEvents.js').PartListHost} PartListHost */

const SOLO_TITLE = 'Solo — for listening here only; the clip plays every part that is not muted';

/**
 * @param {PartListHost} host
 * @param {any} part
 * @param {number} index
 */
function row(host, part, index) {
  const { song, selected, solo, locked } = host;
  const open = part.id === selected;
  const soloed = solo.includes(part.id);
  const label = partLabel(part);
  const about = part.kind === 'drums' ? `${part.steps} steps` : `${part.notes.length} notes`;
  return html`<li class="music-part-list-row" data-part="${part.id}" data-open="${open}">
    <div class="music-part-list-head">
      <button
        type="button"
        class="music-part-list-pick"
        data-action="select"
        aria-current="${open ? 'true' : 'false'}"
        title="${`${label}: ${about}, a loop of ${part.bars} bar${part.bars === 1 ? '' : 's'}`}"
        onclick="${on.handleAction}"
      >
        <app-icon name="${part.kind === 'drums' ? 'beat' : 'piano'}" size="sm"></app-icon>
        <span>${label}</span>
      </button>
      ${number(`part.${part.id}.volume`, '', part.volume, 'volume', {
        slider: true,
        disabled: locked,
      })}
      <button
        type="button"
        class="music-part-list-flag"
        data-muted="${part.mute ? 'true' : 'false'}"
        aria-pressed="${part.mute ? 'true' : 'false'}"
        aria-label="${`Mute ${label}`}"
        title="Mute"
        disabled="${locked}"
        onclick="${on.handleMute}"
      >
        M
      </button>
      <button
        type="button"
        class="music-part-list-flag"
        data-action="solo"
        data-solo="${soloed}"
        aria-pressed="${soloed ? 'true' : 'false'}"
        aria-label="${`Solo ${label}`}"
        title="${SOLO_TITLE}"
        onclick="${on.handleAction}"
      >
        S
      </button>
    </div>
    ${open
      ? partDetails(song, part, {
          locked,
          first: index === 0,
          last: index === song.parts.length - 1,
        })
      : html``}
  </li>`.key(part.id);
}

/** @type {import('hybrids').Component<PartListHost>} */
export default define({
  tag: 'music-part-list',
  song: { value: /** @type {any} */ ({ parts: [], bars: 1 }) },
  selected: '',
  solo: { value: [] },
  locked: false,
  render: {
    value: (host) => {
      const { song, solo, locked } = host;
      const full = locked || song.parts.length >= 16;
      return html`
        <ul class="music-part-list-rows">
          ${song.parts.map((part, index) => row(host, part, index))}
        </ul>
        ${song.parts.length
          ? html``
          : html`<p class="music-part-list-empty">No parts yet. Add drums or a synth to begin.</p>`}
        ${solo.length
          ? html`<p class="music-part-list-note" role="status">
              Solo is for listening here only: the clip plays every part that is not muted.
            </p>`
          : html``}
        <div class="music-part-list-add">
          <button
            type="button"
            class="btn btn-secondary"
            data-action="add"
            data-kind="drums"
            disabled="${full}"
            onclick="${on.handleAction}"
          >
            <app-icon name="beat" size="sm"></app-icon> Add drums
          </button>
          <button
            type="button"
            class="btn btn-secondary"
            data-action="add"
            data-kind="synth"
            disabled="${full}"
            onclick="${on.handleAction}"
          >
            <app-icon name="piano" size="sm"></app-icon> Add synth
          </button>
        </div>
      `;
    },
    shadow: false,
  },
});
