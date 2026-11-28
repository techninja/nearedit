/**
 * What is on screen at an instant: the group, and the word being said.
 * Called for every frame, so it is a binary search over the groups and
 * allocates one small object.
 * Isomorphic and pure. Contract: docs/app-spec/CAPTIONS.md § Groups and timing.
 * @module utils/captions/at
 */

/**
 * Times are compared with this much give, seconds: a frame time worked out
 * as `sourceIn + (time - timelineStart)` may fall a hair short of the word
 * it is meant to land on.
 */
export const TIME_GIVE = 1e-6;

/**
 * The group on screen at a time and the word being said. A group is on
 * screen from its first word's start up to, but not at, its `until`. The
 * word being said is the last one that has started: it stays marked
 * through a short pause and through the hold after the last word, so the
 * mark never blinks off and on.
 * @param {import('./types.js').CaptionGroup[]} groups - From `captionGroups`
 * @param {number} time - Seconds, in the time base of the words
 * @returns {(import('./types.js').CaptionState & { group:
 *   import('./types.js').CaptionGroup }) | null} null when nothing is shown
 */
export function captionAt(groups, time) {
  if (!Array.isArray(groups) || !groups.length || !Number.isFinite(time)) return null;
  const t = time + TIME_GIVE;
  let low = 0;
  let high = groups.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (groups[mid]?.start <= t) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  const group = groups[found];
  if (!group || !(t < group.until) || !Array.isArray(group.words) || !group.words.length) {
    return null;
  }
  let word = group.words.length - 1;
  while (word > 0 && !(group.words[word]?.start <= t)) word--;
  const { start, end } = group.words[word] || { start: group.start, end: group.end };
  const wordAge = Math.max(0, time - start);
  return {
    group,
    word,
    age: Math.max(0, time - group.start),
    wordAge,
    wordProgress: end > start ? Math.min(1, wordAge / (end - start)) : 1,
  };
}
