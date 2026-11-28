import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { attachCutout, setCutout } from '#utils/edl/index.js';
import { clipOf } from '#utils/edl/testkit.js';
import { loadDoc } from '#utils/editor/session.js';
import { inspectorModel } from '#utils/inspector/model.js';
import { clipBadges } from '#utils/timeline/badges.js';
import { cutoutBadge, registerCutoutBadge } from './badge.js';
import { clipsWaiting, isSubject, statusOf } from './clipStatus.js';
import { exportNoteModel } from './exportNote.js';
import { cutoutView } from './inspectorView.js';
import { applyPlacement } from './placementEdit.js';
import { UNKNOWN, cutoutJobs, describeJobs, noteFile, resetCutoutJobs } from './state.js';
import { SELFIE, cutoutDoc, madeFor } from './testkit.js';

const NEED = { path: SELFIE, start: 3, end: 10, fps: 30 };
const job = (/** @type {Record<string, any>} */ over) => ({
  ...{ status: 'running', progress: 40, frame: 84, frames: 210, message: '', start: 3, end: 10 },
  ...over,
});
const jobsWith = (/** @type {Record<string, any>} */ byPath) => ({ byPath, availability: UNKNOWN });
const on = setCutout(cutoutDoc(), ['me'], true);
const ready = attachCutout(on, madeFor(NEED));
/** `me` trimmed past what was made for it. */
const stale = {
  ...ready,
  tracks: ready.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) =>
      clip.clipId === 'me' ? { ...clip, sourceOut: 14, timelineEnd: 10 } : clip,
    ),
  })),
};
const track = on.tracks[0];
const me = (/** @type {any} */ doc) => clipOf(doc, 'me');

afterEach(() => resetCutoutJobs());

describe('where a clip’s cutout stands', () => {
  it('follows the document and the job of the clip’s file', () => {
    assert.equal(statusOf(me(cutoutDoc()), 30, null).stage, 'off');
    assert.deepEqual(statusOf(me(ready), 30, null), {
      ...{ stale: false, progress: 0, action: '', stage: 'ready', text: 'The person is cut out' },
    });
    const making = statusOf(me(on), 30, job({}));
    assert.deepEqual(
      [making.stage, making.text, making.progress, making.action],
      ['making', 'Making the cutout — frame 84 of 210', 40, 'cancel'],
    );
    assert.equal(statusOf(me(on), 30, job({ status: 'queued' })).text, 'Waiting for its turn…');
    assert.equal(statusOf(me(on), 30, undefined).text, 'Starting…', 'before the first request');
    const failed = statusOf(me(on), 30, job({ status: 'error', message: 'No frames came back' }));
    assert.deepEqual(
      [failed.stage, failed.text, failed.action],
      ['failed', 'No frames came back', 'retry'],
    );
    const cancelled = statusOf(me(on), 30, job({ status: 'cancelled' }));
    assert.deepEqual([cancelled.stage, cancelled.action], ['cancelled', 'retry']);
    assert.equal(statusOf(me(on), 30, job({ status: 'unavailable' })).stage, 'unavailable');
  });

  it('says so when a trim outgrew the cutout', () => {
    const remaking = statusOf(me(stale), 30, job({ frame: 10, frames: 360 }));
    assert.deepEqual(
      [remaking.stage, remaking.stale, remaking.text],
      ['making', true, 'Making the rest — frame 10 of 360'],
    );
    assert.equal(statusOf(me(ready), 24, null).stale, true, 'made at another frame rate');
  });

  it('offers the cutout for footage only', () => {
    const doc = cutoutDoc();
    const kinds = ['me', 'broll', 'photo', 'sound'].map((id) => {
      const found = doc.tracks.find((each) => each.clips.some((clip) => clip.clipId === id));
      return isSubject(clipOf(doc, id), found);
    });
    assert.deepEqual(kinds, [true, true, false, false]);
    const web = {
      ...clipOf(doc, 'me'),
      web: { recipe: { url: 'https://example.com/', steps: [] } },
    };
    assert.equal(isSubject(web, track), false, 'a web recording has no person in it');
  });
});

describe('the timeline badge', () => {
  it('shows on, busy with a percentage, and what went wrong', () => {
    assert.equal(cutoutBadge(me(cutoutDoc()), track, 30, null), null);
    assert.deepEqual(cutoutBadge(me(ready), track, 30, null), {
      ...{ id: 'cutout', text: 'Cutout', tone: 'on', title: 'The person is cut out of this clip' },
    });
    const busy = cutoutBadge(me(on), track, 30, job({}));
    assert.deepEqual([busy.text, busy.tone], ['Cutout 40%', 'busy']);
    assert.equal(busy.title, 'Making the cutout — frame 84 of 210');
    assert.equal(cutoutBadge(me(on), track, 30, job({ status: 'queued' })).text, 'Cutout…');
    assert.equal(
      cutoutBadge(me(stale), track, 30, job({})).title,
      'Out of date. Making the rest — frame 84 of 210',
    );
    const failed = cutoutBadge(me(on), track, 30, job({ status: 'error', message: 'Out of disk' }));
    assert.deepEqual([failed.text, failed.tone], ['Cutout !', 'warn']);
    assert.match(failed.title, /Out of disk/);
    const none = cutoutBadge(
      me(on),
      track,
      30,
      job({ status: 'unavailable', message: 'No model' }),
    );
    assert.deepEqual([none.tone, none.title], ['warn', 'No cutout: No model']);
  });

  it('registers with the timeline and follows the jobs', () => {
    loadDoc(on);
    assert.deepEqual(clipBadges(me(on), track), [], 'nothing before it is registered');
    const remove = registerCutoutBadge();
    assert.equal(clipBadges(me(on), track)[0].text, 'Cutout…');
    noteFile(SELFIE, /** @type {any} */ (job({ progress: 71 })));
    assert.equal(clipBadges(me(on), track)[0].text, 'Cutout 71%');
    assert.deepEqual(clipBadges(clipOf(on, 'broll'), on.tracks[1]), []);
    remove();
    assert.deepEqual(clipBadges(me(on), track), []);
  });
});

describe('what the export dialog says', () => {
  it('names the clips that would render with their background, and what is going on', () => {
    assert.equal(exportNoteModel(ready, jobsWith({})).total, 0);
    assert.deepEqual(clipsWaiting(on), [{ clipId: 'me', path: SELFIE, name: 'selfie.mp4' }]);
    const making = exportNoteModel(on, jobsWith({ [SELFIE]: job({}) }));
    assert.equal(making.title, '1 clip is waiting for its cutout: selfie.mp4.');
    assert.equal(making.making, 'Making it now — frame 84 of 210…');
    assert.equal(making.canMake, false);
    const failed = exportNoteModel(
      on,
      jobsWith({ [SELFIE]: job({ status: 'error', message: 'Boom' }) }),
    );
    assert.deepEqual([failed.making, failed.problem, failed.canMake], ['', 'Boom', true]);
    assert.equal(failed.action, 'Make it first');
    const two = setCutout(on, ['other'], true);
    const none = { status: 'unavailable', message: 'No model at /m.onnx' };
    const both = exportNoteModel(two, jobsWith({ [SELFIE]: job(none) }));
    assert.equal(both.title, '2 clips are waiting for their cutout: selfie.mp4, guest.mp4.');
    assert.equal(both.problem, 'This server cannot make cutouts: No model at /m.onnx');
    assert.equal(both.making, 'Making it now…', 'the other file is about to start');
    assert.equal(both.action, 'Check again', 'the server may have got its model meanwhile');
  });
});

describe('what the inspector shows', () => {
  const view = (/** @type {any} */ doc, /** @type {string[]} */ ids, byPath = {}) =>
    cutoutView(inspectorModel(doc, ids, 0), jobsWith(byPath));

  it('is there for footage only, and merges a selection', () => {
    assert.equal(view(on, ['photo']), null);
    assert.equal(view(on, ['sound']), null);
    const one = view(on, ['me'], { [SELFIE]: job({}) });
    assert.deepEqual([one.on, one.mixed, one.mode, one.placement], [true, false, 'remove', 'fill']);
    assert.deepEqual(
      one.controls.map((control) => [control.path, control.value, control.spec.unit]),
      [
        ['cutout.feather', 0.4, '%'],
        ['cutout.shrink', 0.1, '%'],
      ],
    );
    assert.deepEqual(
      one.files.map((file) => [file.name, file.status.stage]),
      [['selfie.mp4', 'making']],
    );
    const mixed = view(on, ['me', 'me2', 'photo']);
    assert.deepEqual([mixed.clipIds, mixed.on, mixed.mixed], [['me', 'me2'], false, true]);
    assert.equal(view(cutoutDoc(), ['me']).files.length, 0, 'off: no status');
  });

  it('shows the blur amount in blur mode, and the placement and looks of the clips', () => {
    const blurred = setCutout(ready, ['me'], { mode: 'blur', blur: 6 });
    const shown = view(applyPlacement(blurred, ['me'], 'circle-left'), ['me']);
    assert.deepEqual([shown.mode, shown.placement], ['blur', 'circle-left']);
    assert.deepEqual(shown.controls.at(-1).path, 'cutout.blur');
    assert.equal(shown.controls.at(-1).value, 6);
    assert.deepEqual(
      shown.looks.map((look) => [look.id, look.pressed]),
      [
        ['shadow', false],
        ['outline', false],
      ],
    );
    assert.equal(shown.files[0].status.stage, 'ready');
  });

  it('lets the clip that is furthest from ready speak for a file', () => {
    const both = setCutout(ready, ['me2'], true);
    const rows = view(both, ['me', 'me2'], {
      [SELFIE]: job({ status: 'unavailable', message: 'No model' }),
    });
    assert.deepEqual(
      rows.files.map((file) => [file.status.stage, file.reason]),
      [['unavailable', 'No model']],
    );
  });
});

describe('what a screen reader hears', () => {
  it('changes when a cutout starts or fails, not with every frame', () => {
    assert.equal(describeJobs(cutoutJobs.get()), '');
    const first = describeJobs(jobsWith({ [SELFIE]: job({ frame: 1 }) }));
    assert.equal(first, 'Cutting out the person in selfie.mp4');
    assert.equal(describeJobs(jobsWith({ [SELFIE]: job({ frame: 99 }) })), first);
    assert.equal(
      describeJobs(jobsWith({ [SELFIE]: job({ status: 'error' }) })),
      'The cutout of selfie.mp4 failed',
    );
  });
});
