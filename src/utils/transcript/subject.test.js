import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isElementClip } from '#utils/brand/clip.js';
import { createClip } from '#utils/edl/factory.js';
import { clipOf, testEdl } from '#utils/edl/testkit.js';
import { explainMissing } from './missing.js';
import { resolveSubject } from './subject.js';
import { TALK, talkEdl } from './testkit.js';

/** A lower third as the document holds it: a design and what was typed for it. */
const element = { id: 'lower-third', slots: { name: 'Ada' }, design: { layers: [] } };

/** @returns {import('#utils/edl/types.js').Edl} Clips without speech, one of each kind */
function silentEdl() {
  const at = (/** @type {number} */ n) => ({ timelineStart: n * 3, timelineEnd: n * 3 + 3 });
  return testEdl({
    v1: [
      createClip({ clipId: 'title', ...at(0), text: { content: 'Hi' } }),
      createClip({ clipId: 'brand', ...at(1), element }),
      createClip({ clipId: 'still', ...at(2), sourceFile: '/media/photo.jpg' }),
      createClip({ clipId: 'empty', ...at(3) }),
    ],
  });
}

describe('a selected clip without speech', () => {
  const edl = silentEdl();
  const note = (/** @type {string} */ clipId) => resolveSubject({ edl, selection: [clipId] }).note;

  it('is reported as what it is — a brand element is not a title', () => {
    assert.equal(isElementClip(clipOf(edl, 'brand')), true, 'the fixture holds an element clip');
    assert.deepEqual(['title', 'brand', 'still', 'empty'].map(note), [
      'title',
      'element',
      'image',
      'placeholder',
    ]);
    assert.deepEqual(resolveSubject({ edl, selection: ['brand'] }), {
      file: '',
      clipId: '',
      from: 'selection',
      note: 'element',
    });
  });

  it('gets a sentence of its own in the panel', () => {
    const say = (/** @type {string} */ clipId) =>
      explainMissing(resolveSubject({ edl, selection: [clipId] }), null, null, null).detail;
    assert.match(say('brand'), /^A brand element is drawn by the brand kit/);
    assert.match(say('title'), /^Titles are text already/);
    assert.notEqual(say('brand'), say('title'));
    assert.equal(new Set(['title', 'brand', 'still', 'empty'].map(say)).size, 4);
  });

  it('gives way to speech selected with it, and to the clip under the cursor only when nothing is selected', () => {
    const talk = talkEdl();
    const both = { ...talk, tracks: [...talk.tracks, ...silentEdl().tracks] };
    assert.equal(resolveSubject({ edl: both, selection: ['brand', 'a'] }).file, TALK);
    assert.equal(resolveSubject({ edl: both, selection: ['brand'], cursor: 4 }).note, 'element');
    assert.equal(resolveSubject({ edl, cursor: 4 }).note, '', 'under the cursor: no explanation');
  });
});
