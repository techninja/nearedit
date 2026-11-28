/**
 * Keyboard atom — the column of keys at the left of the piano roll, the
 * highest note on top, one key to a pitch row. The keys of the song's
 * scale carry a mark; every C says its octave. Pressing a key reports a
 * bubbling `key-press` with `{ pitch }`, for its note to be played.
 * @module components/atoms/music-keys
 */

import { define, dispatch, html } from 'hybrids';
import { rollKeys } from '#utils/musicUi/rollModel.js';

/**
 * @typedef {Object} MusicKeysHost
 * @property {string} tonic - The key of the song: `C`, `F#`
 * @property {string} scale - A name of the engine's scales
 */

/** @param {MusicKeysHost & HTMLElement} host @param {Event} event */
function handlePress(host, event) {
  const pitch = Number(/** @type {HTMLElement} */ (event.currentTarget).dataset.pitch);
  dispatch(host, 'key-press', { detail: { pitch }, bubbles: true });
}

/** @type {import('hybrids').Component<MusicKeysHost>} */
export default define({
  tag: 'music-keys',
  tonic: 'C',
  scale: 'minor',
  render: {
    value: ({ tonic, scale }) => html`
      ${rollKeys({ key: tonic, scale }).map(
        (key) =>
          html`<button
            type="button"
            tabindex="-1"
            data-pitch="${key.pitch}"
            data-black="${String(key.black)}"
            data-scale="${String(key.scale)}"
            title="${key.name}"
            aria-label="${`Play ${key.name}`}"
            onpointerdown="${handlePress}"
          >
            ${key.label}
          </button>`,
      )}
    `,
    shadow: false,
  },
});
