import { test } from 'node:test';
import assert from 'node:assert/strict';
import { builtinKit, captionStyleOf, resolveKit } from '#utils/brand/index.js';
import { applyDirectorResult, createClip, createEdl, validateEdl } from '#utils/edl/index.js';
import { applyDirected, withFonts } from './applyResult.js';

const FACE = { family: 'Acme Sans', weight: 700, style: 'normal', file: '/kits/acme/Acme.ttf' };
const titled = (family) => ({
  mode: 'append',
  tracks: [
    {
      ...{ type: 'video', index: 0, name: 'Titles' },
      clips: [createClip({ timelineEnd: 3, text: { content: 'Hello', fontFamily: family } })],
    },
  ],
  markers: [],
});

test('a result without document parts merges exactly as applyDirectorResult does', () => {
  const edl = createEdl();
  const result = titled('Inter');
  const strip = (doc) => JSON.parse(JSON.stringify(doc, (key, v) => (key === 'clipId' ? '' : v)));
  assert.deepEqual(strip(applyDirected(edl, result)), strip(applyDirectorResult(edl, result)));
  assert.equal(applyDirected(edl, null), edl);
  // A result that changes nothing gives the document back itself: markers keep their ids.
  const marked = { ...edl, markers: [{ markerId: 'm_1', time: 2, label: 'Here', color: '' }] };
  const same = { mode: 'replace', tracks: [], markers: [{ time: 2, label: 'Here', color: '' }] };
  assert.equal(applyDirected(marked, same), marked);
  const other = applyDirected(marked, {
    ...same,
    markers: [{ time: 3, label: 'Here', color: '' }],
  });
  assert.notEqual(other.markers[0].markerId, 'm_1');
  assert.equal(applyDirected(edl, { ...result, document: 'nonsense' }).fonts, undefined);
});

test('font files come first, so the titles of the fragment may be set in them', () => {
  const edl = createEdl();
  const plain = applyDirectorResult(edl, titled('Acme Sans'));
  assert.notEqual(
    plain.tracks[0].clips[0].text.fontFamily,
    'Acme Sans',
    'without its file a family is not kept',
  );
  const out = applyDirected(edl, {
    ...titled('Acme Sans'),
    document: { fonts: [FACE, { bad: 1 }] },
  });
  assert.equal(out.tracks[0].clips[0].text.fontFamily, 'Acme Sans');
  assert.deepEqual(out.fonts, [FACE]);
  assert.deepEqual(validateEdl(out).problems, []);
  // A face the document already lists keeps its place; nothing changes when all is there.
  assert.equal(withFonts(out, [FACE]), out);
  assert.equal(withFonts(out, []), out);
  const moved = withFonts(out, [{ ...FACE, file: '/elsewhere/Acme.ttf' }]);
  assert.deepEqual(moved.fonts, [{ ...FACE, file: '/elsewhere/Acme.ttf' }]);
});

test('the caption style and the regions of a result are applied in the same step', () => {
  const edl = createEdl({ regions: [{ regionId: 'r1', start: 1, end: 2, label: 'A', color: '' }] });
  const style = captionStyleOf(resolveKit(builtinKit('bold')));
  const regions = [{ regionId: 'r1', start: 5, end: 6, label: 'A', color: '' }];
  const out = applyDirected(edl, {
    ...titled('Inter'),
    document: { captions: { style }, regions },
  });
  assert.deepEqual(out.captions, { style });
  assert.deepEqual(out.regions, regions);
  assert.deepEqual(validateEdl(out).problems, []);
  // A style that is already the document's changes nothing about it.
  const again = applyDirected(out, {
    mode: 'append',
    tracks: [],
    markers: [],
    document: { captions: { style } },
  });
  assert.equal(again.captions, out.captions);
  const cleared = applyDirected(out, {
    mode: 'append',
    tracks: [],
    document: { captions: { style: null } },
  });
  assert.equal(cleared.captions, undefined, 'null goes back to the default style');
});
