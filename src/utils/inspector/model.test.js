import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClip } from '../edl/factory.js';
import { assertValid, clipOf, deepFreeze, testClip, testEdl } from '../edl/testkit.js';
import { applyChange } from './apply.js';
import { inspectorModel } from './model.js';
import { documentSummary } from './summary.js';
import { fieldScope, isSingleEvent, selectedClips, targetsOf } from './targets.js';

const title = createClip({
  clipId: 't',
  timelineStart: 0,
  timelineEnd: 3,
  text: { content: 'Hello\nworld' },
});
const hole = createClip({
  clipId: 'p',
  timelineStart: 20,
  timelineEnd: 24,
  placeholder: true,
  label: 'B-roll here',
});
const edl = deepFreeze(
  testEdl(
    {
      v0: [title],
      v1: [
        testClip('v', 2, 8, { linkedClipId: 'a', label: 'Talk' }),
        testClip('pic', 10, 15, { sourceFile: '/media/photo.jpg' }),
        hole,
      ],
      a1: [testClip('a', 2, 8, { linkedClipId: 'v', sourceFile: '/media/v.mp4', label: 'Talk' })],
      a2: [
        testClip('m', 0, 12, { sourceFile: '/media/song.mp3', volume: 0.5, fadeOut: 2 }),
        testClip('m2', 10, 30, { fadeIn: 2 }),
      ],
    },
    { markers: [{ markerId: 'm1', time: 1, label: '', color: '' }] },
  ),
);
const ids = (refs) => refs.map((ref) => ref.clip.clipId);

describe('targets', () => {
  it('scopes each field to the clips it means something for', () => {
    const refs = selectedClips(edl, ['v', 'a', 't', 'pic', 'p', 'gone']);
    assert.deepEqual(ids(refs), ['v', 'a', 't', 'pic', 'p']);
    assert.deepEqual(
      refs.map((r) => r.kind),
      ['video', 'audio', 'title', 'image', 'placeholder'],
    );
    assert.deepEqual(ids(targetsOf(refs, 'label')), ['v', 'a', 't', 'pic', 'p']);
    assert.deepEqual(ids(targetsOf(refs, 'volume')), ['a']);
    assert.deepEqual(ids(targetsOf(refs, 'transform.opacity')), ['v', 't', 'pic']);
    assert.deepEqual(ids(targetsOf(refs, 'transform.cropLeft')), ['v', 'pic']);
    assert.deepEqual(ids(targetsOf(refs, 'transform.kenBurns.enabled')), ['v', 'pic']);
    assert.deepEqual(ids(targetsOf(refs, 'text.fontSize')), ['t']);
    assert.deepEqual(ids(targetsOf(refs, 'prompt')), ['p']);
    assert.equal(fieldScope('fadeIn'), 'all');
  });

  it('knows a linked pair is one event', () => {
    assert.equal(isSingleEvent(selectedClips(edl, ['v', 'a'])), true);
    assert.equal(isSingleEvent(selectedClips(edl, ['v'])), true);
    assert.equal(isSingleEvent(selectedClips(edl, ['v', 'pic'])), false);
    assert.equal(isSingleEvent([]), false);
  });
});

describe('inspectorModel', () => {
  it('describes a linked pair as one clip with picture and sound groups', () => {
    const model = inspectorModel(edl, ['v', 'a']);
    assert.deepEqual([model.heading, model.detail], ['Talk', 'video + audio · V1 + A1']);
    assert.deepEqual(model.show, {
      volume: true,
      transform: 'full',
      text: false,
      placeholder: false,
    });
    assert.deepEqual(model.fields.volume, { value: 1, mixed: false, count: 1 });
    assert.deepEqual(model.fields['transform.opacity'], { value: 1, mixed: false, count: 1 });
    assert.equal('text.content' in model.fields, false);
    assert.deepEqual(model.timing, {
      single: true,
      clipId: 'v',
      start: 2,
      end: 8,
      duration: 6,
      sourceIn: 0,
      sourceOut: 6,
      timed: true,
    });
    assert.equal(model.link.canUnlink, true);
    assert.equal(model.link.canLink, false);
    assert.deepEqual([model.fps, model.resolution], [30, '1920x1080']);
  });

  it('merges several clips and flags what differs', () => {
    const model = inspectorModel(edl, ['m', 'a', 'pic']);
    assert.equal(model.heading, '3 clips');
    assert.equal(model.detail, '2 audio, image');
    assert.deepEqual(model.fields.volume, { value: 0.5, mixed: true, count: 2 });
    assert.equal(model.fields.label.mixed, true);
    assert.equal(model.timing.single, false);
    assert.deepEqual([model.timing.start, model.timing.end], [0, 15]);
    assert.equal(model.link.canGroup, true);
  });

  it('shows text for titles, basics only for their transform, and notes for placeholders', () => {
    const t = inspectorModel(edl, ['t']);
    assert.deepEqual(t.show, { volume: false, transform: 'basic', text: true, placeholder: false });
    assert.equal(t.heading, 'Hello');
    assert.equal(t.timing.timed, false);
    const p = inspectorModel(edl, ['p']);
    assert.deepEqual(p.show, { volume: false, transform: '', text: false, placeholder: true });
    assert.equal(p.heading, 'B-roll here');
  });

  it('locks a fade that is a cross-fade, and reports an empty selection', () => {
    const fading = inspectorModel(edl, ['m']);
    assert.deepEqual(fading.fadeLocks, { in: false, out: true });
    const none = inspectorModel(edl, []);
    assert.deepEqual([none.count, none.heading, none.show.transform], [0, '', '']);
    assert.deepEqual(none.fadeLocks, { in: false, out: false });
  });
});

describe('applyChange', () => {
  it('writes a field to every clip it applies to and to no other', () => {
    const out = assertValid(
      applyChange(edl, ['v', 'a', 't'], { name: 'transform.opacity', value: 0.4 }),
    );
    assert.deepEqual(
      ['v', 't', 'a'].map((id) => clipOf(out, id).transform.opacity),
      [0.4, 0.4, 1],
    );
    assert.equal(clipOf(out, 'pic'), clipOf(edl, 'pic'), 'unselected clips keep their identity');
    const quiet = applyChange(edl, ['v', 'a'], { name: 'volume', value: 0.25 });
    assert.deepEqual([clipOf(quiet, 'a').volume, clipOf(quiet, 'v').volume], [0.25, 1]);
    const named = applyChange(edl, ['v', 'a', 'pic'], { name: 'label', value: 'Take 2' });
    assert.deepEqual(
      ['v', 'a', 'pic'].map((id) => clipOf(named, id).label),
      ['Take 2', 'Take 2', 'Take 2'],
    );
  });

  it('handles uniform scale, presets and resets', () => {
    let out = applyChange(edl, ['pic'], { name: 'transform.scale', value: 1.5 });
    assert.deepEqual(
      [clipOf(out, 'pic').transform.scaleX, clipOf(out, 'pic').transform.scaleY],
      [1.5, 1.5],
    );
    out = applyChange(out, ['pic'], { name: 'transform.cropLeft', value: 0.2 });
    out = applyChange(out, ['pic'], { name: 'kenBurns.preset', value: 'zoom-in' });
    assert.deepEqual(
      [
        clipOf(out, 'pic').transform.kenBurns.enabled,
        clipOf(out, 'pic').transform.kenBurns.endScale,
      ],
      [true, 1.2],
    );
    out = applyChange(out, ['pic'], { name: 'reset.transform' });
    assert.equal(clipOf(out, 'pic').transform.scaleX, 1);
    assert.equal(clipOf(out, 'pic').transform.cropLeft, 0.2, 'crop has its own reset');
    out = applyChange(out, ['pic'], { name: 'reset.crop' });
    out = applyChange(out, ['pic'], { name: 'reset.kenBurns' });
    assert.deepEqual(clipOf(out, 'pic').transform, clipOf(edl, 'pic').transform);
    assert.equal(applyChange(edl, ['pic'], { name: 'kenBurns.preset', value: 'nope' }), edl);
  });

  it('edits titles but never empties one, and resets style without touching the words', () => {
    let out = applyChange(edl, ['t'], { name: 'text.content', value: 'New title' });
    out = applyChange(out, ['t'], { name: 'text.fontSize', value: 120 });
    out = applyChange(out, ['t'], { name: 'text.align', value: 'left' });
    assert.deepEqual(
      [clipOf(out, 't').text.content, clipOf(out, 't').text.fontSize, clipOf(out, 't').text.align],
      ['New title', 120, 'left'],
    );
    assert.equal(applyChange(out, ['t'], { name: 'text.content', value: '  ' }), out);
    const reset = applyChange(out, ['t'], { name: 'reset.text' });
    assert.deepEqual(
      [clipOf(reset, 't').text.content, clipOf(reset, 't').text.fontSize],
      ['New title', 72],
    );
    assert.equal(
      applyChange(edl, ['t'], { name: 'text.align', value: 'diagonal' }),
      edl,
      'bad enum is ignored',
    );
  });

  it('moves, trims and slips through the timing fields, partner included', () => {
    const durations = { '/media/v.mp4': 20 };
    const moved = assertValid(applyChange(edl, ['v', 'a'], { name: 'timing.start', value: 4 }));
    assert.deepEqual([clipOf(moved, 'v').timelineStart, clipOf(moved, 'a').timelineStart], [4, 4]);
    const longer = assertValid(
      applyChange(
        edl,
        ['v', 'a'],
        { name: 'timing.duration', value: 7.5 },
        { sourceDurations: durations },
      ),
    );
    assert.deepEqual(
      [clipOf(longer, 'v').timelineEnd, clipOf(longer, 'a').timelineEnd],
      [9.5, 9.5],
    );
    const ended = applyChange(edl, ['v', 'a'], { name: 'timing.end', value: 5 });
    assert.equal(clipOf(ended, 'a').sourceOut, 3);
    const slipped = assertValid(
      applyChange(
        edl,
        ['v', 'a'],
        { name: 'timing.sourceIn', value: 1.5 },
        { sourceDurations: durations },
      ),
    );
    assert.deepEqual(
      [
        clipOf(slipped, 'v').sourceIn,
        clipOf(slipped, 'a').sourceOut,
        clipOf(slipped, 'v').timelineStart,
      ],
      [1.5, 7.5, 2],
    );
    assert.equal(applyChange(edl, ['v'], { name: 'timing.start', value: NaN }), edl);
  });

  it('sets fades on free edges and leaves cross-fades alone', () => {
    const out = assertValid(applyChange(edl, ['v', 'a'], { name: 'fadeIn', value: 0.5 }));
    assert.deepEqual([clipOf(out, 'v').fadeIn, clipOf(out, 'a').fadeIn], [0.5, 0.5]);
    assert.equal(applyChange(edl, ['m'], { name: 'fadeOut', value: 0.2 }), edl);
  });

  it('links, unlinks, groups and ungroups', () => {
    const unlinked = assertValid(applyChange(edl, ['v', 'a'], { name: 'action.unlink' }));
    assert.deepEqual(
      [clipOf(unlinked, 'v').linkedClipId, clipOf(unlinked, 'a').linkedClipId],
      ['', ''],
    );
    const relinked = assertValid(applyChange(unlinked, ['v', 'a'], { name: 'action.link' }));
    assert.equal(clipOf(relinked, 'v').linkedClipId, 'a');
    const grouped = applyChange(edl, ['pic', 'm'], { name: 'action.group' });
    assert.ok(
      clipOf(grouped, 'pic').groupId &&
        clipOf(grouped, 'pic').groupId === clipOf(grouped, 'm').groupId,
    );
    assert.equal(inspectorModel(grouped, ['pic', 'm']).link.canGroup, false);
    const apart = applyChange(grouped, ['pic'], { name: 'action.ungroup' });
    assert.equal(clipOf(apart, 'm').groupId, '');
    assert.equal(applyChange(edl, [], { name: 'label', value: 'x' }), edl);
  });
});

describe('documentSummary', () => {
  it('counts tracks, clips by kind and markers', () => {
    const summary = documentSummary(edl);
    assert.deepEqual([summary.resolution, summary.fps, summary.duration], ['1920×1080', 30, 30]);
    assert.deepEqual(
      [summary.videoTracks, summary.audioTracks, summary.clips, summary.markers],
      [2, 2, 7, 1],
    );
    assert.deepEqual(summary.kinds, {
      video: 1,
      audio: 3,
      image: 1,
      title: 1,
      generator: 0,
      placeholder: 1,
    });
    assert.deepEqual(summary.tracks[0], {
      trackId: 'v0',
      name: 'V0',
      type: 'video',
      clips: 1,
      muted: false,
      solo: false,
      locked: false,
    });
    assert.equal(documentSummary(null).clips, 0);
  });
});
