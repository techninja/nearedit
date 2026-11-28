import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadDoc } from '#utils/editor/session.js';
import { setCaptionWords, setCaptions } from '#utils/edl/index.js';
import { clipOf } from '#utils/edl/testkit.js';
import { clipBadges } from '#utils/timeline/badges.js';
import { captionBadge } from './badge.js';
import { MEMO, TALK, talkDoc, wordsOf } from './testkit.js';

describe('the CC badge', () => {
  it('shows on a captioned clip and on the picture linked to it — and nowhere else', () => {
    const off = talkDoc();
    assert.equal(captionBadge(clipOf(off, 'a'), off, wordsOf()), null);
    const doc = setCaptions(off, ['v']);
    for (const id of ['a', 'v']) {
      const badge = captionBadge(clipOf(doc, id), doc, wordsOf());
      assert.deepEqual(badge, {
        id: 'captions',
        text: 'CC',
        tone: 'on',
        title: 'Captions: 8 words',
      });
    }
    assert.equal(captionBadge(clipOf(doc, 'memo'), doc, wordsOf()), null);
    assert.equal(captionBadge(clipOf(doc, 'bed'), doc, wordsOf()), null);
    assert.equal(captionBadge(null, doc, wordsOf()), null);
    assert.equal(captionBadge(clipOf(doc, 'a'), null, wordsOf()), null);
  });

  it('warns when captions are on and the file has no transcript', () => {
    const doc = setCaptions(talkDoc(), ['memo']);
    const badge = captionBadge(clipOf(doc, 'memo'), doc, wordsOf());
    assert.deepEqual([badge.text, badge.tone], ['CC', 'warn']);
    assert.match(badge.title, /no transcript/);
    // While the answer is on its way nothing is claimed either way.
    const reading = captionBadge(clipOf(doc, 'memo'), doc, wordsOf({ [MEMO]: 'loading' }));
    assert.deepEqual([reading.tone, reading.title], ['on', 'Captions are on']);
  });

  it('is busy while the transcript is being made', () => {
    const doc = setCaptions(talkDoc(), ['memo']);
    const jobs = (file) => (file === MEMO ? { active: true, progress: 30 } : null);
    const badge = captionBadge(clipOf(doc, 'memo'), doc, wordsOf(), /** @type {any} */ (jobs));
    assert.deepEqual([badge.text, badge.tone], ['CC…', 'busy']);
  });

  it('counts words written on the clip, whatever the file has', () => {
    const doc = setCaptions(setCaptionWords(talkDoc(), 'memo', [[1, 2, 'hi']]), ['memo']);
    const badge = captionBadge(clipOf(doc, 'memo'), doc, wordsOf({ [TALK]: 'none' }));
    assert.deepEqual([badge.tone, badge.title], ['on', 'Captions: 1 word']);
  });

  it('is registered with the timeline for the open document', () => {
    const doc = setCaptions(setCaptionWords(talkDoc(), 'memo', [[1, 2, 'hi']]), ['memo']);
    loadDoc(doc);
    const badges = clipBadges(clipOf(doc, 'memo'), doc.tracks[1]);
    assert.deepEqual(
      badges.map((badge) => [badge.id, badge.text, badge.tone]),
      [['captions', 'CC', 'on']],
    );
    assert.deepEqual(clipBadges(clipOf(doc, 'bed'), doc.tracks[2]), []);
  });
});
