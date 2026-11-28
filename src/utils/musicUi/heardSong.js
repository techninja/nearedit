/**
 * The song as the music editor plays it: the clip's own song — so that
 * what is heard is exactly what the server renders — unless parts are
 * soloed, in which case only those sound. Solo exists while editing only;
 * a song has no solo. The same song and solo give the same object, so it
 * is rendered once. Pure.
 * @module utils/musicUi/heardSong
 */

/** @type {WeakMap<object, Map<string, any>>} By song, then by what is soloed */
const heard = new WeakMap();

/**
 * @param {any} song - As the clip holds it
 * @param {string[]} solo - Ids of the parts to hear alone
 * @returns {any} The song itself when none of its parts is soloed
 */
export function heardSong(song, solo) {
  const ids = solo.filter((id) => song.parts.some((part) => part.id === id)).sort();
  if (!ids.length) return song;
  const made = heard.get(song) || new Map();
  heard.set(song, made);
  const key = ids.join(' ');
  if (!made.has(key)) {
    const parts = song.parts.map((part) => ({ ...part, mute: !ids.includes(part.id) }));
    made.set(key, { ...song, parts });
  }
  return made.get(key);
}
