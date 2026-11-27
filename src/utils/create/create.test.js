import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EFFECTS, GENERATORS } from '#utils/compose/catalog.js';
import { requirements } from '#utils/compose/requirements.js';
import { clipKind } from '#utils/edl/factory.js';
import { assertValid, clipOf, deepFreeze, layout, testClip, testEdl } from '#utils/edl/testkit.js';
import { categoryIcon, categoryLabel } from './categories.js';
import { effectItems, generatorItems, groupByCategory, searchItems } from './catalogView.js';
import { addGenerator, backTrack, layerFor } from './placement.js';
import { normalizePresets, presetsOf } from './presets.js';
import { addTextPreset } from './addText.js';
import { TEXT_PRESETS } from './textPresets.js';
import { generatorThumb, textThumb, thumbSize } from './thumbDoc.js';

describe('catalog view', () => {
  const FAKE = [
    { type: 'rings', label: 'Rings', category: 'background', description: 'Concentric rings' },
    {
      type: 'sparks',
      label: 'Sparks',
      category: 'particles',
      presets: [
        { label: 'Fire', params: { color: '#f00' }, seed: 4, description: 'Flames' },
        { id: 'snow', name: 'Snow', params: { gravity: 40 } },
        { params: { nameless: true } },
      ],
    },
    { type: 'weird', label: '', category: 'holograms' },
  ];

  it('lists every generator of the real catalog, and whatever is added to it', () => {
    const items = generatorItems(GENERATORS);
    for (const { type } of GENERATORS)
      assert.ok(
        items.some((item) => item.key === type),
        type,
      );
    const fake = generatorItems(FAKE);
    assert.deepEqual(
      fake.map((item) => item.key),
      ['rings', 'sparks', 'sparks:0', 'sparks:snow', 'weird'],
    );
    assert.deepEqual(fake[2], {
      type: 'sparks',
      category: 'particles',
      description: 'Flames',
      key: 'sparks:0',
      label: 'Fire',
      params: { color: '#f00' },
      seed: 4,
      preset: 'Fire',
    });
    assert.equal(fake[4].label, 'Weird');
    assert.equal(effectItems(EFFECTS).length, EFFECTS.length);
  });

  it('groups by category in catalog order and names unknown categories', () => {
    const groups = groupByCategory(generatorItems(FAKE));
    assert.deepEqual(
      groups.map((group) => [group.label, group.items.length]),
      [
        ['Backgrounds', 1],
        ['Particles', 3],
        ['Holograms', 1],
      ],
    );
    assert.equal(categoryLabel('key'), 'Keying');
    assert.equal(categoryIcon('holograms'), 'sparkle');
    assert.equal(categoryIcon('blur'), 'blur');
  });

  it('searches labels, types, categories and descriptions, every word', () => {
    const items = generatorItems(FAKE);
    const keys = (query) => searchItems(items, query).map((item) => item.key);
    assert.deepEqual(
      keys(''),
      items.map((item) => item.key),
    );
    assert.deepEqual(keys('FIRE'), ['sparks:0']);
    assert.deepEqual(keys('particles'), ['sparks', 'sparks:0', 'sparks:snow']);
    assert.deepEqual(keys('concentric back'), ['rings']);
    assert.deepEqual(keys('nothing here'), []);
  });
});

describe('generator presets', () => {
  it('reads the presets of a catalog entry, whatever they call their name', () => {
    assert.deepEqual(normalizePresets([{ name: 'Snow', params: { a: 1 }, blendMode: 'add' }, {}]), [
      { id: '0', label: 'Snow', description: '', params: { a: 1 }, blendMode: 'add' },
    ]);
    assert.deepEqual(presetsOf({}), []);
    assert.deepEqual(presetsOf(null), []);
  });

  it('adds every preset of the real catalog as a valid clip, blend mode included', () => {
    const items = generatorItems(GENERATORS).filter((entry) => entry.preset);
    assert.ok(items.length > 0, 'the catalog has presets');
    for (const item of items) {
      const { edl, clipId } = addGenerator(testEdl(), item, { time: 0 });
      assert.ok(clipId, item.key);
      assert.equal(
        clipOf(assertValid(edl), clipId).blendMode,
        item.blendMode || 'normal',
        item.key,
      );
    }
  });
});

describe('placing a generator', () => {
  const doc = () => deepFreeze(testEdl({ v0: [], v1: [testClip('talk', 0, 10)] }, { fps: 30 }));

  it('puts backgrounds and patterns at the back, everything else in front', () => {
    assert.deepEqual(
      ['background', 'pattern', 'shape', 'particles', 'text', 'new-kind'].map(layerFor),
      ['back', 'back', 'front', 'front', 'front', 'front'],
    );
  });

  it('uses the back-most track when it is free there', () => {
    const { edl, clipId, trackId } = addGenerator(
      doc(),
      { type: 'solid', category: 'background' },
      { time: 12 },
    );
    assertValid(edl);
    assert.equal(trackId, 'v1');
    assert.equal(clipKind(clipOf(edl, clipId), edl.tracks[1]), 'generator');
    assert.deepEqual(layout(edl).v1, ['talk 0-10', `${clipId} 12-17`]);
    assert.equal(clipOf(edl, clipId).label, 'solid');
  });

  it('makes a track behind the picture when the back-most one is taken or locked', () => {
    const { edl, clipId, trackId } = addGenerator(
      doc(),
      { type: 'gradient', category: 'background' },
      { time: 3 },
    );
    assertValid(edl);
    assert.deepEqual(
      edl.tracks.map((t) => t.type),
      ['video', 'video', 'video', 'audio'],
    );
    assert.equal(edl.tracks[2].trackId, trackId);
    assert.deepEqual(layout(edl)[trackId], [`${clipId} 3-8`]);
    assert.deepEqual(layout(edl).v1, ['talk 0-10'], 'the footage is untouched');
    const locked = {
      ...doc(),
      tracks: doc().tracks.map((t) => ({ ...t, locked: t.trackId === 'v1' })),
    };
    assert.notEqual(backTrack(locked, 20, 25).trackId, 'v1');
    assert.equal(backTrack(doc(), 10, 15).trackId, 'v1', 'touching the end is free');
  });

  it('puts shapes in front: the top track when free, else a new one on top', () => {
    const item = {
      type: 'shape',
      category: 'shape',
      label: 'Star',
      params: { shape: 'star' },
      seed: 5,
    };
    const first = addGenerator(doc(), item, { time: 2, duration: 4 });
    assert.equal(first.trackId, 'v0');
    assert.deepEqual(clipOf(first.edl, first.clipId).generator, {
      type: 'shape',
      seed: 5,
      params: { shape: 'star' },
    });
    assert.equal(clipOf(first.edl, first.clipId).label, 'Star');
    const second = addGenerator(first.edl, item, { time: 3 });
    assert.equal(second.edl.tracks[0].trackId, second.trackId, 'a new top track');
    assert.equal(second.edl.tracks.length, 4);
    const onTrack = addGenerator(
      doc(),
      { type: 'solid', category: 'background' },
      { time: 1, trackId: 'v0' },
    );
    assert.equal(onTrack.trackId, 'v0', 'a named track wins over the rule');
  });

  it('adds nothing for something that is not a generator', () => {
    const base = doc();
    assert.deepEqual(addGenerator(base, { type: '' }), { edl: base, clipId: '', trackId: '' });
  });
});

describe('text presets and thumbnails', () => {
  it('offers the five styles and adds each as a valid, bundled-font title', () => {
    assert.deepEqual(
      TEXT_PRESETS.map((preset) => preset.id),
      ['title', 'lower-third', 'caption', 'big-number', 'credits'],
    );
    for (const preset of TEXT_PRESETS) {
      for (const resolution of ['1920x1080', '1080x1920']) {
        const { edl, clipId } = addTextPreset(testEdl({}, { resolution }), preset.id, { time: 2 });
        const clip = clipOf(assertValid(edl), clipId);
        assert.equal(clipKind(clip, edl.tracks[0]), 'title', preset.id);
        assert.equal(clip.timelineEnd - clip.timelineStart, preset.duration);
        assert.notEqual(clip.text.animateIn.type, 'none', `${preset.id} arrives`);
        assert.ok(requirements(edl).fonts.length > 0);
      }
    }
    const lower = addTextPreset(testEdl(), 'lower-third');
    assert.ok(clipOf(lower.edl, lower.clipId).transform.y > 200, 'sits low in the frame');
    const base = testEdl();
    assert.deepEqual(addTextPreset(base, 'nope'), { edl: base, clipId: '' });
  });

  it('builds one-clip documents for thumbnails at the open resolution', () => {
    const thumb = generatorThumb(
      { type: 'gradient', params: { angle: 10 } },
      { resolution: '1080x1920', fps: 25 },
    );
    assert.equal(thumb.doc.resolution, '1080x1920');
    assert.equal(thumb.doc.fps, 25);
    const [clip] = thumb.doc.tracks[0].clips;
    assert.deepEqual(clip.generator, { type: 'gradient', seed: 7, params: { angle: 10 } });
    assert.ok(thumb.still > 0 && thumb.still < thumb.duration);
    const text = textThumb('credits');
    assert.equal(text.duration, 8);
    assert.equal(text.doc.tracks[0].clips.length, 1);
    assertValid(text.doc);
    assert.deepEqual(thumbSize('1920x1080'), { width: 256, height: 144 });
    assert.deepEqual(thumbSize('1080x1920'), { width: 81, height: 144 });
    assert.deepEqual(thumbSize('1080x1080', 100, 100), { width: 100, height: 100 });
  });
});
