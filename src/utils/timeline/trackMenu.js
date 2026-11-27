/**
 * The "track options" menu of a track header: solo and lock (the header
 * hides those buttons on a narrow screen), reorder within its type, add
 * tracks, remove the track.
 * @module utils/timeline/trackMenu
 */

import { addAudioTrack, addVideoTrack, removeTrackById } from '#utils/commands/insert.js';
import { moveTrack, toggleTrackLock, toggleTrackSolo } from '#utils/edl/index.js';
import { edit } from '#utils/editor/session.js';

/**
 * @param {{ tracks: { trackId: string, type: string, locked: boolean, solo: boolean }[] }} doc -
 *   The document as rendered (TimelineState)
 * @param {string} trackId
 * @returns {import('./menuModel.js').MenuItem[]}
 */
export function trackMenu(doc, trackId) {
  const track = doc.tracks.find((candidate) => candidate.trackId === trackId);
  if (!track) return [];
  const lane = doc.tracks.filter((candidate) => candidate.type === track.type);
  const row = lane.indexOf(track);
  const move = (to) => () => edit((current) => moveTrack(current, trackId, to));
  return [
    {
      label: 'Solo',
      checked: track.solo,
      run: () => edit((current) => toggleTrackSolo(current, trackId)),
    },
    {
      label: 'Lock',
      checked: track.locked,
      run: () => edit((current) => toggleTrackLock(current, trackId)),
    },
    { separator: true },
    { label: 'Move up', disabled: row <= 0, run: move(row - 1) },
    { label: 'Move down', disabled: row >= lane.length - 1, run: move(row + 1) },
    { separator: true },
    { label: 'Add video track', run: addVideoTrack },
    { label: 'Add audio track', run: addAudioTrack },
    { separator: true },
    {
      label: 'Delete track',
      disabled: track.locked || lane.length < 2,
      run: () => removeTrackById(trackId),
    },
  ];
}
