/**
 * Playhead atom — where the music editor's audition is, as a line across
 * a part's loop (it sits in a positioned box as wide as the loop and
 * places itself along it), or as words (`3.2`: bar and beat). It follows
 * the audio clock by itself, once a frame, and only while the editor plays.
 * @module components/atoms/music-playhead
 */

import { define, html } from 'hybrids';
import { auditionPosition, auditionState } from '#utils/musicUi/audition.js';
import { beatText, loopPlace } from '#utils/musicUi/playhead.js';

/**
 * @typedef {Object} MusicPlayheadHost
 * @property {number} bars - Length of the loop the line runs along, in bars
 * @property {number[][]} ranges - Bar ranges where the part sounds; empty = everywhere
 * @property {boolean} readout - Show bar and beat as words instead of a line
 * @property {number} beats - Beats in a bar, for the words
 * @property {number} at - Internal: the song position, in bars; −1 while nothing plays
 */

/**
 * Follow the audition once a frame while the editor plays.
 * @param {MusicPlayheadHost & HTMLElement} host
 * @returns {() => void}
 */
function follow(host) {
  let frame = 0;
  const step = () => {
    const state = auditionState.get();
    const playing = state.owner === 'editor' && state.playing;
    frame = playing ? requestAnimationFrame(step) : 0;
    const bar = playing ? (auditionPosition()?.bar ?? -1) : -1;
    // Words change once a beat; a line moves every frame.
    const next = host.readout && bar >= 0 ? Math.floor(bar * host.beats) / host.beats : bar;
    if (next !== host.at) host.at = next;
  };
  const stop = auditionState.subscribe(() => {
    if (!frame) step();
  });
  step();
  return () => {
    stop();
    cancelAnimationFrame(frame);
  };
}

/** @type {import('hybrids').Component<MusicPlayheadHost>} */
export default define({
  tag: 'music-playhead',
  bars: 1,
  ranges: { value: [] },
  readout: false,
  beats: 4,
  at: { value: -1, connect: follow },
  render: {
    value: ({ at, bars, ranges, readout, beats }) => {
      if (readout) return html`<span>${beatText(at, beats) || '–.–'}</span>`;
      const place = loopPlace(at, ranges, bars);
      return html`<i hidden="${place < 0}" style="${{ left: `${place * 100}%` }}"></i>`;
    },
    shadow: false,
  },
});
