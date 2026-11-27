import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClip } from '#utils/edl/factory.js';
import { setKeyframe } from '#utils/edl/keyframes.js';
import { assertValid, clipOf, deepFreeze, testClip, testEdl } from '#utils/edl/testkit.js';
import {
  addKeysAt,
  animatedClips,
  clearAllKeys,
  hasKeysAt,
  removeKeysAt,
  stepKeyTime,
} from './clipKeys.js';

function doc() {
  const title = createClip({
    clipId: 't',
    timelineStart: 2,
    timelineEnd: 8,
    text: { content: 'A' },
  });
  let edl = testEdl({ v0: [title], v1: [testClip('v', 0, 10)] });
  edl = setKeyframe(edl, 't', 'transform.x', 2, 0);
  edl = setKeyframe(edl, 't', 'transform.x', 6, 400);
  edl = setKeyframe(edl, 't', 'transform.opacity', 4, 0.5);
  return deepFreeze(edl);
}
const count = (edl) => Object.values(clipOf(edl, 't').keyframes).reduce((n, k) => n + k.length, 0);

describe('keyframe commands on clips', () => {
  it('keys every animated property at a moment with the value it has there', () => {
    const edl = assertValid(addKeysAt(doc(), ['t', 'v'], 4));
    const keys = clipOf(edl, 't').keyframes;
    assert.deepEqual(
      keys['transform.x'].map((key) => [key.t + 2, key.v]),
      [
        [2, 0],
        [4, 200],
        [6, 400],
      ],
    );
    assert.equal(keys['transform.opacity'].length, 1, 'already had a key there');
    assert.deepEqual(clipOf(edl, 'v').keyframes, {}, 'nothing animated, nothing keyed');
    const base = doc();
    assert.equal(addKeysAt(base, ['t'], 20), base, 'outside the clip nothing happens');
  });

  it('removes the keys at a moment, and all of them', () => {
    assert.equal(hasKeysAt(doc(), ['t', 'v'], 4), true);
    assert.equal(hasKeysAt(doc(), ['t'], 5), false);
    assert.equal(count(removeKeysAt(doc(), ['t'], 4)), 2);
    assert.deepEqual(clipOf(clearAllKeys(doc(), ['t', 'v']), 't').keyframes, {});
    assert.deepEqual(
      animatedClips(doc(), ['v', 't', 'gone']).map((clip) => clip.clipId),
      ['t'],
    );
  });

  it('steps from key to key across the properties of the selection', () => {
    const edl = doc();
    assert.equal(stepKeyTime(edl, ['t'], 0, 1), 2);
    assert.equal(stepKeyTime(edl, ['t'], 2, 1), 4);
    assert.equal(stepKeyTime(edl, ['t'], 4, 1), 6);
    assert.equal(stepKeyTime(edl, ['t'], 6, 1), null);
    assert.equal(stepKeyTime(edl, ['t'], 5, -1), 4);
    assert.equal(stepKeyTime(edl, ['v'], 5, -1), null);
  });
});
