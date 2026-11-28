/**
 * Music section of the Create tab — starting points as tiles: an empty
 * song, the named beats and a few small loops. A tile's play button lets
 * it be heard first (the engine plays it right here); pressing the tile
 * adds it. "Import MIDI…" reads a `.mid` file in the browser and says what
 * it could not carry over. Asks to add with a bubbling `music-add` event
 * (`detail: { song, label?, open? }`).
 * @module components/molecules/music-create
 */

import { define, html } from 'hybrids';
import { auditionState } from '#utils/musicUi/audition.js';
import * as on from '#utils/musicUi/createEvents.js';
import { songSvg } from '#utils/musicUi/songSvg.js';
import { STARTERS, starterSong } from '#utils/musicUi/starters.js';
import { watch } from '#utils/ui/observable.js';
import '#atoms/app-icon/app-icon.js';

/** @typedef {import('#utils/musicUi/createEvents.js').MusicCreateHost} MusicCreateHost */

const GROUPS = [
  { kind: 'empty', title: 'Start from nothing' },
  { kind: 'beat', title: 'Beats' },
  { kind: 'loop', title: 'Loops' },
];

/**
 * One starting point: a play button over its picture, and the tile that adds it.
 * @param {import('#utils/musicUi/starters.js').Starter} starter
 * @param {import('#utils/musicUi/audition.js').AuditionState} audition
 */
function tile(starter, audition) {
  const song = starterSong(starter.id);
  const playing = audition.owner === `starter:${starter.id}` && audition.playing;
  const detail = `${Math.round(song.bpm)} BPM · ${song.bars} bars`;
  return html`<div class="music-create-tile" data-kind="${starter.kind}">
    <button
      type="button"
      class="music-create-add"
      data-id="${starter.id}"
      title="${`${starter.description} — click to add at the edit cursor`}"
      onclick="${on.handleAdd}"
    >
      <span class="music-create-picture" innerHTML="${songSvg(song)}"></span>
      <span class="music-create-name">${starter.label}</span>
      <small>${detail}</small>
    </button>
    <button
      type="button"
      class="icon-btn music-create-play"
      data-id="${starter.id}"
      aria-pressed="${playing ? 'true' : 'false'}"
      aria-label="${`${playing ? 'Stop' : 'Play'} ${starter.label}`}"
      title="${playing ? 'Stop' : 'Listen'}"
      onclick="${on.handlePlay}"
    >
      <app-icon name="${playing ? 'stop' : 'play'}" size="sm"></app-icon>
    </button>
  </div>`.key(starter.id);
}

/** @type {import('hybrids').Component<MusicCreateHost>} */
export default define({
  tag: 'music-create',
  audition: watch(auditionState),
  problem: '',
  warnings: { value: [] },
  imported: '',
  render: {
    value: ({ audition, problem, warnings, imported }) => html`
      <p class="music-create-about">
        A drum machine and a synth in the timeline. Listen to a starting point, click it to add it
        at the edit cursor, then double-click the clip to change every step and note.
      </p>
      ${audition.problem && html`<p class="error-message" role="alert">${audition.problem}</p>`}
      ${GROUPS.map(
        ({ kind, title }) =>
          html`<div class="field-group-title">${title}</div>
            <div class="music-create-grid" role="group" aria-label="${title}">
              ${STARTERS.filter((starter) => starter.kind === kind).map((starter) =>
                tile(starter, audition),
              )}
            </div>`,
      )}
      <div class="field-group-title">From a file</div>
      <label class="btn btn-secondary music-create-import">
        <app-icon name="import" size="sm"></app-icon> Import MIDI…
        <input
          type="file"
          class="sr-only"
          accept=".mid,.midi,audio/midi"
          onchange="${on.handleImport}"
        />
      </label>
      ${problem && html`<p class="error-message music-create-problem" role="alert">${problem}</p>`}
      ${imported &&
      html`<div class="music-create-imported" role="status">
        <strong>${imported}</strong>
        ${warnings.length
          ? html`<ul>
              ${warnings.map((warning) => html`<li>${warning}</li>`)}
            </ul>`
          : html`<span>Everything in the file was carried over.</span>`}
      </div>`}
    `,
    shadow: false,
  },
});
