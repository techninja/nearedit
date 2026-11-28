import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canUndo, getDoc, loadDoc } from '#utils/editor/session.js';
import { setCaptions, splitClips, updateTrack } from '#utils/edl/index.js';
import { clipOf } from '#utils/edl/testkit.js';
import { chainCaptions, toggleCaptions } from './panelCaptions.js';
import { TALK, TALK_SIDECAR, talkEdl } from './testkit.js';
import { transcriptText } from './panelView.js';
import { sourceChain } from './usage.js';

const chainOf = (doc, file = TALK) => sourceChain(doc, file, { focusClipId: 'v' });

describe('captions from the transcript panel', () => {
  it('knows whether the clips that play the file show captions', () => {
    const doc = talkEdl();
    assert.deepEqual(chainCaptions(doc, chainOf(doc)), { ids: ['a'], state: 'off' });
    const on = setCaptions(doc, ['a']);
    assert.deepEqual(chainCaptions(on, chainOf(on)), { ids: ['a'], state: 'on' });
  });

  it('has nothing to switch for a file off the timeline or on a locked track', () => {
    const doc = talkEdl();
    assert.equal(chainCaptions(doc, chainOf(doc, '/media/elsewhere.mp4')).state, '');
    const locked = updateTrack(doc, 'v1', { locked: true });
    assert.equal(chainCaptions(locked, chainOf(locked)).state, '');
  });

  it('is off while any piece of a cut-up clip is', () => {
    const cut = splitClips(talkEdl(), 6, { clipIds: ['v', 'a'] });
    const chain = chainOf(cut);
    assert.equal(chain.segments.length, 2);
    const first = chain.segments[0].clipId;
    const part = setCaptions(cut, [first]);
    assert.equal(chainCaptions(part, chainOf(part)).state, 'off');
    assert.equal(chainCaptions(part, chainOf(part)).ids.length, 2);
  });

  it('switches them with the toolbar’s button, one undo step, and says so', () => {
    loadDoc(talkEdl());
    const host = /** @type {any} */ ({
      file: TALK,
      focusClip: 'v',
      track: '',
      sidecar: TALK_SIDECAR,
    });
    host.anchor = host.head = -1;
    host.query = '';
    assert.ok(transcriptText(TALK_SIDECAR).units.length > 0);
    toggleCaptions(host);
    assert.equal(clipOf(getDoc(), 'a').captions.on, true);
    assert.equal(host.message, 'Captions on for this clip');
    assert.equal(canUndo(), true);
    toggleCaptions(host);
    assert.equal(clipOf(getDoc(), 'a').captions, undefined);
    assert.equal(host.message, 'Captions off for this clip');
  });
});
