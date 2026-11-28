import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { store } from 'hybrids';
import AppState from '#store/AppState.js';
import ViewState from '#store/ViewState.js';
import { effectTargets } from '#utils/create/panelActions.js';
import { thumbCrop } from '#utils/create/thumbDoc.js';
import { clipKind } from '#utils/edl/clipKind.js';
import { elementClips } from '#utils/edl/index.js';
import { clipOf } from '#utils/edl/testkit.js';
import * as session from '#utils/editor/session.js';
import { getSelection } from '#utils/editor/view.js';
import { inspectorModel } from '#utils/inspector/model.js';
import { describeSelection } from '#utils/inspector/selectionInfo.js';
import { documentSummary } from '#utils/inspector/summary.js';
import { fieldScope, isVisual, selectedClips, targetsOf } from '#utils/inspector/targets.js';
import { videoCues } from '#utils/playback/schedule.js';
import { resolveSubject } from '#utils/transcript/subject.js';
import { addElementItem } from './addElement.js';
import { elementBounds, framing } from './elementBounds.js';
import { elementGroups, sampleSlots, slotSpecs, starterSlots } from './elementList.js';
import { elementSubject, kitLabel } from './elementSubject.js';
import { elementThumb, restMoment } from './elementThumb.js';
import { kitState, standIn } from './kitState.js';
import { changeSlot } from './slotEdits.js';
import { requestSlotFocus, takeSlotFocus } from './slotFocus.js';
import { elementDoc, kitOf } from './testkit.js';

const clean = kitOf('clean');
const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));
// The inspector's gesture listens for presses outside the field being edited.
globalThis.window ||= /** @type {any} */ ({ addEventListener() {}, removeEventListener() {} });
const WIDE = { width: 1920, height: 1080 };
const TALL = { width: 1080, height: 1920 };

beforeEach(async () => {
  kitState.set(standIn('p1', 'fallback'));
  await store.set(ViewState, { selection: [], cursorPosition: 0, autoCrossfade: true });
});

describe('a kit’s elements for the Create tab', () => {
  it('are grouped by what they do, with their blanks', () => {
    const groups = elementGroups(clean);
    assert.deepEqual(
      groups.map((group) => `${group.label}:${group.items.map((item) => item.id)}`),
      [
        'Overlays:lower-third,title,caption,quote,bug',
        'Segments:chapter,intro,outro',
        'Transitions:stinger',
      ],
    );
    const [name, role] = slotSpecs(clean, 'lower-third');
    assert.deepEqual(
      [name.label, name.optional, role.optional, role.sample],
      ['Name', false, true, 'Mathematician'],
    );
    assert.deepEqual(sampleSlots([name, role]), { name: 'Ada Lovelace', role: 'Mathematician' });
    assert.deepEqual(
      starterSlots([name, role]),
      { name: 'Name' },
      'what must be filled says what belongs there',
    );
    assert.deepEqual(
      slotSpecs(null, 'gone', ['by_line']).map((slot) => slot.label),
      ['By line'],
    );
    assert.deepEqual(elementGroups(null), []);
  });

  it('get a thumbnail: the element over a sample picture, framed on what it shows', () => {
    const spec = elementThumb(clean, 'lower-third', { resolution: '1920x1080', fps: 30 });
    assert.equal(elementThumb(clean, 'lower-third', { resolution: '1920x1080', fps: 30 }), spec);
    const [{ clip }] = elementClips(spec.doc);
    assert.deepEqual(clip.element.slots, { name: 'Ada Lovelace', role: 'Mathematician' });
    assert.equal(
      spec.doc.tracks.filter((t) => t.clips.some((c) => c.generator?.type)).length,
      2,
      'the sample picture',
    );
    assert.deepEqual([spec.duration, spec.still], [5, 3]);
    const crop = thumbCrop(spec.doc);
    assert.ok(
      crop.width < 1920 && crop.y > 400 && Math.abs(crop.width / crop.height - 16 / 9) < 0.01,
    );
    assert.equal(
      thumbCrop(elementThumb(clean, 'intro', { resolution: '1920x1080' }).doc).width,
      1920,
    );
    const stinger = elementThumb(clean, 'stinger', {});
    assert.equal(stinger.still, restMoment(elementClips(stinger.doc)[0].clip.element.design, 1.2));
    const band = thumbCrop(
      elementThumb(clean, 'lower-third', { resolution: '1080x1920' }, { aspect: 16 / 9 }).doc,
    );
    assert.ok(
      Math.abs(band.width / band.height - 16 / 9) < 0.01 && band.y > 900,
      'a wide band of a vertical frame',
    );
  });

  it('know where an element’s picture is in its frame', () => {
    const { doc, clipIds } = elementDoc([
      ['lower-third', { name: 'Ada' }, 1],
      ['title', { title: 'Hello' }, 2],
      ['intro', { title: 'In' }, 3],
    ]);
    const block = (i) => clipOf(doc, clipIds[i]).element;
    const low = elementBounds(block(0), WIDE);
    assert.ok(low.x < 100 && low.y > 800 && low.width < 500, JSON.stringify(low));
    const tall = elementBounds(block(0), TALL);
    assert.ok(tall.y > 1400 && tall.x + tall.width <= 1080);
    const title = elementBounds(block(1), WIDE);
    assert.ok(title.width < 1900 && title.x > 300, 'a scrim over the frame is not counted');
    assert.deepEqual(elementBounds(block(2), WIDE), { x: 0, y: 0, width: 1920, height: 1080 });
    assert.deepEqual(elementBounds({ design: { kind: 'overlay', layers: 7 } }, WIDE), {
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });
    assert.deepEqual(framing(elementBounds(block(2), WIDE), WIDE), {
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });
    const part = framing(low, WIDE);
    assert.ok(part.width >= 1920 / 2.2 - 1 && part.x === 0 && part.y + part.height <= 1080);
  });
});

describe('adding and filling an element', () => {
  it('adds at the cursor as one undo step, selected, and asks for the first blank', async () => {
    session.loadDoc(elementDoc([]).doc);
    await store.set(ViewState, { cursorPosition: 2 });
    const { clipId, message } = addElementItem('lower-third');
    const clip = clipOf(session.getDoc(), clipId);
    assert.deepEqual(
      [clip.timelineStart, clip.element.slots, clip.label],
      [2, { name: 'Name' }, 'Name'],
    );
    await tick();
    assert.deepEqual(getSelection(), [clipId]);
    assert.match(message, /^Added Lower third on .* at 00:00:02:00 — type its Name$/);
    assert.equal(store.get(AppState).dockTab, 'inspector');
    await store.set(AppState, { dockTab: 'create' });
    assert.equal(takeSlotFocus('other'), false);
    requestSlotFocus(clipId, 0);
    assert.equal(takeSlotFocus(clipId, 5000), false, 'too late');
    requestSlotFocus(clipId);
    assert.equal(takeSlotFocus(clipId), true);
    assert.equal(takeSlotFocus(clipId), false, 'once');
    assert.equal(session.undo() && !session.undo(), true);
    assert.equal(addElementItem('nope').clipId, '');
  });

  it('a segment opens the timeline; an element without text keeps the Create tab', async () => {
    session.loadDoc(elementDoc([]).doc);
    await store.set(AppState, { dockTab: 'create' });
    await store.set(ViewState, { cursorPosition: 4 });
    const { clipId } = addElementItem('intro');
    assert.equal(clipKind(clipOf(session.getDoc(), clipId)), 'element');
    assert.equal(clipOf(session.getDoc(), 'park').timelineStart, 12, 'rippled by the intro’s 4 s');
    await store.set(AppState, { dockTab: 'create' });
    assert.match(addElementItem('bug', { time: 0 }).message, /^Added Logo bug on/);
    await tick();
    assert.equal(store.get(AppState).dockTab, 'create');
  });

  it('typing in a blank is live and one undo step per visit, for every clip that shares it', () => {
    const { doc, clipIds } = elementDoc([
      ['lower-third', { name: 'A' }, 1],
      ['lower-third', { name: 'B' }, 9],
    ]);
    session.loadDoc(doc);
    changeSlot(clipIds, 'role', 'S', 'live');
    changeSlot(clipIds, 'role', 'Speaker', 'live');
    assert.equal(clipOf(session.getDoc(), clipIds[1]).element.slots.role, 'Speaker');
    assert.equal(changeSlot(clipIds, 'role', 'Speaker', 'commit'), true);
    assert.equal(session.undo() && !session.undo(), true);
    changeSlot([clipIds[0]], 'name', 'Zed', 'live');
    changeSlot([clipIds[0]], 'name', '', 'cancel');
    assert.equal(clipOf(session.getDoc(), clipIds[0]).element.slots.name, 'A');
  });
});

describe('element clips are first-class', () => {
  const { doc, clipIds } = elementDoc([
    ['lower-third', { name: 'Ada', role: 'CEO' }, 1],
    ['title', { title: 'Hello' }, 9],
  ]);

  it('in the inspector: named, counted, drawn in the frame', () => {
    const refs = selectedClips(doc, clipIds);
    assert.deepEqual(
      refs.map((ref) => ref.kind),
      ['element', 'element'],
    );
    assert.equal(refs.every(isVisual), true);
    assert.deepEqual(describeSelection(refs), { heading: '2 clips', detail: '2 brand elements' });
    assert.equal(describeSelection([refs[0]]).detail.startsWith('brand element · '), true);
    assert.equal(describeSelection([refs[0]]).heading, 'Ada');
    assert.equal(targetsOf(refs, 'transform.x').length, 2);
    assert.equal(fieldScope('transform.opacity'), 'visual');
    assert.equal(inspectorModel(doc, [clipIds[0]], 2).show.transform, 'basic');
    assert.equal(documentSummary(doc).kinds.element, 2);
    assert.equal(documentSummary(elementDoc([]).doc).kinds.element, undefined);
  });

  it('for the Brand element group: shared blanks, mixed values, which element of which kit', () => {
    const refs = selectedClips(doc, clipIds);
    const one = elementSubject([refs[0]], clean, new Map([[clipIds[0], 'outdated']]));
    assert.deepEqual([one.what, one.from, one.outdated], ['Lower third', 'Clean', [clipIds[0]]]);
    assert.deepEqual(
      one.fields.map((f) => `${f.name}=${f.value}${f.optional ? '?' : ''}`),
      ['name=Ada', 'role=CEO?'],
    );
    const both = elementSubject(refs, clean, new Map());
    assert.deepEqual(
      [both.what, both.fields.length],
      ['2 brand elements', 0],
      'they share no blank',
    );
    const pair = elementDoc([
      ['lower-third', { name: 'A', role: 'X' }, 1],
      ['lower-third', { name: 'B', role: 'X' }, 9],
    ]);
    const shared = elementSubject(selectedClips(pair.doc, pair.clipIds), clean, new Map());
    assert.deepEqual(
      shared.fields.map((f) => [f.name, f.value, f.mixed]),
      [
        ['name', '', true],
        ['role', 'X', false],
      ],
    );
    assert.equal(elementSubject(selectedClips(doc, ['talk']), clean, new Map()), null);
    assert.deepEqual(
      [kitLabel('bold', clean), kitLabel('acme', clean), kitLabel('', clean)],
      ['Bold', 'acme', 'a kit without a name'],
    );
  });

  it('elsewhere: effects, the transcript panel, playback cues', () => {
    session.loadDoc(doc);
    assert.deepEqual(effectTargets([clipIds[0]]), [{ clipId: clipIds[0], label: 'Ada' }]);
    assert.equal(resolveSubject({ edl: doc, selection: [clipIds[0]] }).note, 'element');
    assert.equal(
      videoCues(doc.tracks, 2).some((cue) => cue.kind === 'element'),
      true,
    );
  });
});
