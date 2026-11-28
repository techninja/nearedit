/**
 * Sharing a length between the pauses of a demo, in whole frames.
 * Isomorphic and pure.
 * @module utils/director/web/holds
 */

/**
 * Share frames between pauses: each gets its natural length scaled by one
 * factor, none less than its minimum, and together exactly `total` — or
 * every minimum, when even those do not fit.
 * @param {number[]} natural - Frames each pause would like
 * @param {number[]} least - Frames each must keep
 * @param {number} total
 * @returns {number[]}
 */
export function fitHolds(natural, least, total) {
  const floor = least.reduce((a, b) => a + b, 0);
  if (total <= floor) return [...least];
  const sum = natural.reduce((a, b) => a + b, 0) || 1;
  const exact = natural.map((frames, i) => Math.max(least[i], (frames * total) / sum));
  const over = exact.reduce((a, b) => a + b, 0) - total;
  const slack = exact.reduce((a, value, i) => a + (value - least[i]), 0);
  // Minimums took more than their share: the others give it back in proportion.
  const fair = exact.map(
    (value, i) => value - (over > 0 ? (over * (value - least[i])) / slack : 0),
  );
  const frames = fair.map(Math.floor);
  let spare = total - frames.reduce((a, b) => a + b, 0);
  const order = fair.map((value, i) => ({ i, part: value - frames[i] }));
  order.sort((a, b) => b.part - a.part || a.i - b.i);
  for (let k = 0; spare > 0; k++, spare--) frames[order[k % order.length].i]++;
  return frames;
}
