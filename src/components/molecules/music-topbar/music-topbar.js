/**
 * Top bar of the music editor — play and stop with where the music is,
 * the bars the audition repeats, then the song as a whole: tempo, swing,
 * its length in bars and the beats to a bar, key and scale, and the mix
 * bus (volume, the reverb's size and decay, the delay's time and
 * feedback, the tail that rings out after the last bar). Reports
 * `music-transport` and `field-change`.
 * @module components/molecules/music-topbar
 */

import { define, html } from 'hybrids';
import { KEY_CHOICES, SCALE_CHOICES } from '#utils/musicUi/choices.js';
import { number, select } from '#utils/musicUi/fieldParts.js';
import * as on from '#utils/musicUi/topbarEvents.js';
import '#atoms/app-icon/app-icon.js';
import '#atoms/music-playhead/music-playhead.js';

/** @typedef {import('#utils/musicUi/topbarEvents.js').MusicTopbarHost} MusicTopbarHost */

/**
 * One end of the loop, counted from one.
 * @param {'from'|'to'} end
 * @param {number} value
 * @param {number} bars
 */
const loopEnd = (end, value, bars) =>
  html`<input
    class="field-input field-num"
    type="number"
    data-end="${end}"
    min="1"
    max="${bars}"
    aria-label="${end === 'from' ? 'Loop from bar' : 'Loop to bar'}"
    value="${value}"
    onchange="${on.handleLoop}"
  />`;

/** @type {import('hybrids').Component<MusicTopbarHost>} */
export default define({
  tag: 'music-topbar',
  song: { value: /** @type {any} */ ({ bars: 1, beatsPerBar: 4, master: {} }) },
  loop: { value: [0, 1] },
  audition: { value: /** @type {any} */ ({ owner: '', playing: false }) },
  locked: false,
  render: {
    value: ({ song, loop, audition, locked }) => {
      const playing = audition.owner === 'editor' && audition.playing;
      const off = { disabled: locked, compact: true };
      const { master = {} } = song;
      const whole = loop[0] === 0 && loop[1] === song.bars;
      return html`
        <div class="music-topbar-row">
          <button
            type="button"
            class="btn btn-primary music-topbar-play"
            aria-pressed="${playing ? 'true' : 'false'}"
            title="Play or stop (Space)"
            onclick="${on.handlePlay}"
          >
            <app-icon name="${playing ? 'stop' : 'play'}" size="sm"></app-icon>
            ${playing ? 'Stop' : 'Play'}
          </button>
          <music-playhead readout beats="${song.beatsPerBar}" title="Bar and beat"></music-playhead>
          <span class="music-topbar-loop" title="The bars that repeat while you listen">
            <app-icon name="loop" size="sm"></app-icon>
            ${loopEnd('from', loop[0] + 1, song.bars)}<span>–</span>${loopEnd(
              'to',
              loop[1],
              song.bars,
            )}
            <button
              type="button"
              class="btn btn-ghost"
              disabled="${whole}"
              title="Repeat the whole song"
              onclick="${on.handleWhole}"
            >
              All
            </button>
          </span>
          ${number('bpm', 'Tempo', song.bpm, 'bpm', off)}
          ${number('swing', 'Swing', song.swing, 'swing', off)}
          ${number('bars', 'Bars', song.bars, 'bars', off)}
          ${number('beatsPerBar', 'Beats', song.beatsPerBar, 'beatsPerBar', off)}
          <span class="music-topbar-key">
            ${select('key', 'Key', KEY_CHOICES, song.key, locked)}
            ${select('scale', 'Scale', SCALE_CHOICES, song.scale, locked)}
          </span>
        </div>
        <div class="music-topbar-row music-topbar-mix">
          ${number('master.volume', 'Volume', master.volume, 'volume', { ...off, slider: true })}
          ${number('master.reverb.size', 'Reverb size', master.reverb?.size, 'share', off)}
          ${number('master.reverb.decay', 'decay', master.reverb?.decay, 'share', off)}
          ${number('master.delay.beats', 'Delay', master.delay?.beats, 'delayBeats', off)}
          ${number('master.delay.feedback', 'feedback', master.delay?.feedback, 'feedback', off)}
          ${number('tail', 'Tail', song.tail, 'tail', off)}
        </div>
        ${audition.problem && html`<p class="error-message" role="alert">${audition.problem}</p>`}
      `;
    },
    shadow: false,
  },
});
