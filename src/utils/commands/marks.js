/**
 * Commands for regions and named markers. A region is made from the time
 * selection (or, without one, from the span of the selected clips), and —
 * as in Vegas — a new region or marker asks for its name at once, unless
 * playback is running: then M and R drop marks on the beat without
 * stopping for a name.
 * @module utils/commands/marks
 */

import { addMarker, removeMarker } from '#utils/edl/index.js';
import { addRegion, regionsOf, removeRegion } from '#utils/edl/regions.js';
import { edit, getDoc } from '#utils/editor/session.js';
import { isPlaying } from '#utils/playback/transport.js';
import { editTime } from './context.js';
import { getTimeSelection, selectedClipsSpan, setTimeSelection } from './timeSelection.js';
import { requestUi } from './viewCommands.js';

/** @returns {import('./timeSpans.js').Span|null} What a new region would cover */
const regionSpan = () => getTimeSelection() || selectedClipsSpan();

/** @returns {boolean} True when there is something to make a region from */
export const canAddRegion = () => regionSpan() !== null;

/**
 * R: add a region over the time selection and ask for its name.
 * @param {string} [label]
 * @returns {boolean} false without a time selection or selected clips
 */
export function addRegionFromSelection(label = '') {
  const span = regionSpan();
  if (!span) return false;
  const before = new Set(regionsOf(getDoc()).map((region) => region.regionId));
  if (!edit((doc) => addRegion(doc, span.start, span.end, { label }))) return false;
  const made = regionsOf(getDoc()).find((region) => !before.has(region.regionId));
  if (made && !label && !isPlaying()) requestUi('renameRegion', made.regionId);
  return true;
}

/** R: add a region and ask for its name. @returns {boolean} */
export const addRegionNow = () => addRegionFromSelection();

/**
 * @param {string} regionId
 * @returns {boolean}
 */
export const deleteRegion = (regionId) => edit((doc) => removeRegion(doc, regionId));

/**
 * Make a region the time selection (double-click its tag).
 * @param {string} regionId
 */
export function selectRegion(regionId) {
  const region = regionsOf(getDoc()).find((each) => each.regionId === regionId);
  if (region) setTimeSelection(region.start, region.end);
}

/**
 * M the Vegas way: add a marker at the cursor and ask for its name.
 * @returns {boolean}
 */
export function addNamedMarker() {
  const before = new Set((getDoc().markers || []).map((marker) => marker.markerId));
  const time = editTime();
  if (!edit((doc) => addMarker(doc, time))) return false;
  const made = getDoc().markers.find((marker) => !before.has(marker.markerId));
  if (made && !isPlaying()) requestUi('renameMarker', made.markerId);
  return true;
}

/**
 * @param {string} markerId
 * @returns {boolean}
 */
export const deleteMarkerById = (markerId) => edit((doc) => removeMarker(doc, markerId));
