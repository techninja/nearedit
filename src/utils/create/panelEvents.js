/**
 * Behaviour of the Create tab (`<create-panel>`): sections, search, the
 * tiles (click adds at the edit cursor, hover or focus plays the
 * thumbnail, drag carries the item to the timeline), the effect list, and
 * what the Web, Music and Brand sections ask for.
 * @module utils/create/panelEvents
 */

import { GENERATORS } from '#utils/compose/catalog.js';
import TimelineState from '#store/TimelineState.js';
import { store } from 'hybrids';
import { generatorItems } from './catalogView.js';
import { CREATE_DRAG_TYPE, beginDrag } from './dragTypes.js';
import { addGeneratorItem, addTextItem, applyEffectItem } from './panelActions.js';
import { TEXT_PRESETS } from './textPresets.js';
import { generatorThumb, textThumb } from './thumbDoc.js';
import { addElementItem } from '#utils/brandUi/addElement.js';
import { addMusicClip } from '#utils/musicUi/addClip.js';
import { addWebClip } from '#utils/webUi/addClip.js';

/**
 * @typedef {Object} CreatePanelHost
 * @property {'generators'|'text'|'effects'|'web'|'music'|'brand'} section
 * @property {string} query - Search in the generators section
 * @property {string} hovered - Key of the tile whose thumbnail plays
 * @property {string} status - What the last action did
 * @property {string[]} selection - Selected clip ids
 * @property {import('#store/TimelineState.js').TimelineStateShape} timeline
 */

/** @typedef {CreatePanelHost & HTMLElement} Host */

/** @returns {import('./catalogView.js').CatalogItem[]} Every generator tile, presets included */
export const allGenerators = () => generatorItems(GENERATORS);

/** @type {Map<string, import('./thumbDoc.js').ThumbSpec>} */
const thumbs = new Map();

/**
 * The thumbnail of a tile, built once per output format.
 * @param {'generator'|'text'} kind
 * @param {string} key - Tile key
 * @returns {import('./thumbDoc.js').ThumbSpec}
 */
export function thumbOf(kind, key) {
  const { resolution, fps } = store.get(TimelineState);
  const id = `${kind}:${key}|${resolution}|${fps}`;
  if (!thumbs.has(id)) {
    const item = kind === 'generator' && allGenerators().find((entry) => entry.key === key);
    const like = { resolution, fps };
    thumbs.set(id, item ? generatorThumb(item, like) : textThumb(key, like));
  }
  return thumbs.get(id);
}

/** @param {Host} host @param {Event} event */
export function handleSection(host, event) {
  const { section } = /** @type {HTMLElement} */ (event.currentTarget).dataset;
  host.section = /** @type {CreatePanelHost['section']} */ (section);
  host.status = '';
}

/** @param {Host} host @param {Event} event */
export function handleSearch(host, event) {
  host.query = /** @type {HTMLInputElement} */ (event.target).value;
}

/** Keys typed in the search box stay there; Escape clears it. @param {Host} host @param {KeyboardEvent} event */
export function handleSearchKeys(host, event) {
  event.stopPropagation();
  if (event.key === 'Escape') host.query = '';
}

/**
 * What a tile stands for, as a drag payload.
 * @param {HTMLElement} tile
 * @returns {import('./dragTypes.js').CreatePayload|null}
 */
function payloadOf(tile) {
  const { kind, key } = tile.dataset;
  if (kind === 'text') {
    const preset = TEXT_PRESETS.find((entry) => entry.id === key);
    return preset ? { kind: 'text', preset: preset.id, label: preset.label } : null;
  }
  const item = allGenerators().find((entry) => entry.key === key);
  return item ? { kind: 'generator', ...item } : null;
}

/** A tile was pressed: add it at the edit cursor. @param {Host} host @param {Event} event */
export function handleAdd(host, event) {
  const payload = payloadOf(/** @type {HTMLElement} */ (event.currentTarget));
  if (!payload) return;
  host.status =
    payload.kind === 'text'
      ? addTextItem(payload.preset)
      : addGeneratorItem(/** @type {any} */ (payload));
}

/** @param {Host} host @param {Event} event */
export function handleHover(host, event) {
  host.hovered = /** @type {HTMLElement} */ (event.currentTarget).dataset.key;
}

/** @param {Host} host */
export function handleLeave(host) {
  host.hovered = '';
}

/** @param {Host} _host @param {DragEvent} event */
export function handleDragStart(_host, event) {
  const payload = payloadOf(/** @type {HTMLElement} */ (event.currentTarget));
  if (payload) beginDrag(event, CREATE_DRAG_TYPE, payload);
}

/** An effect was chosen in the list: apply it to the selected clips. @param {Host} host @param {CustomEvent} event */
export function handleEffectPick(host, event) {
  event.stopPropagation();
  host.status = applyEffectItem(event.detail);
}

/** The Web section asks for a web clip: add it and open its editor. @param {Host} host @param {CustomEvent} event */
export function handleWebAdd(host, event) {
  event.stopPropagation();
  host.status = addWebClip(event.detail.address, event.detail.sizeId).message;
}

/** The Music section asks for a music clip: add it (an empty song opens in its editor). @param {Host} host @param {CustomEvent} event */
export function handleMusicAdd(host, event) {
  event.stopPropagation();
  const { song, label, open } = event.detail;
  host.status = addMusicClip(song, { label, open }).message;
}

/** The Brand section asks for an element of the kit: add it where its kind belongs. @param {Host} host @param {CustomEvent} event */
export function handleBrandAdd(host, event) {
  event.stopPropagation();
  host.status = addElementItem(event.detail.element).message;
}
