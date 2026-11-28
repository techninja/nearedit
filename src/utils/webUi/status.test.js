import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { updateTrack } from '#utils/edl/index.js';
import { deleteClips } from '#utils/edl/index.js';
import { clipOf } from '#utils/edl/testkit.js';
import { updateWebRecipe } from '#utils/edl/webClip.js';
import { recipeKey } from '#utils/web/index.js';
import { addRecent, readAddress } from './address.js';
import {
  isRecording,
  webClipName,
  webClipStatus,
  webClipsToRecord,
  webState,
} from './clipStatus.js';
import { attachRecording, recordRequest, recordingOutcome } from './recordingApply.js';
import { webDoc } from './testkit.js';

const STEPS = [{ do: 'click', target: 'text=Go' }];
const resultFor = (doc, clipId, more = {}) => {
  const { recipe } = clipOf(doc, clipId).web;
  const key = recipeKey(recipe, doc.fps);
  return { file: `/p/.nearedit/web/${key}.mp4`, key, duration: 2.9, title: 'Example', ...more };
};
const changed = (doc, clipId) =>
  updateWebRecipe(doc, clipId, (recipe) => ({
    ...recipe,
    steps: [...recipe.steps, { do: 'wait' }],
  }));
const locked = (doc) => updateTrack(doc, doc.tracks[0].trackId, { locked: true });

describe('recording flow', () => {
  it('asks for the clip’s recipe at the document’s frame rate', () => {
    const { doc, clipId } = webDoc(STEPS);
    const { body, problem } = recordRequest(doc, clipId, 'p1');
    assert.equal(problem, '');
    assert.equal(body.projectId, 'p1');
    assert.equal(body.fps, 30);
    assert.equal(body.recipe, clipOf(doc, clipId).web.recipe);
  });

  it('says why a clip cannot be recorded', () => {
    const { doc, clipId } = webDoc([{ do: 'wait' }, { do: 'click' }]);
    assert.match(recordRequest(doc, clipId, 'p').problem, /^Step 2: click needs a target/);
    assert.match(recordRequest(doc, 'nope', 'p').problem, /not a web clip/);
    const fine = webDoc(STEPS);
    assert.match(recordRequest(locked(fine.doc), fine.clipId, 'p').problem, /locked track/);
    assert.equal(recordRequest(doc, clipId, 'p').body, null);
  });

  it('attaches a recording to the clip that asked for it', () => {
    const { doc, clipId } = webDoc(STEPS);
    const result = resultFor(doc, clipId);
    assert.equal(recordingOutcome(doc, clipId, result), 'attached');
    const { doc: next, clipIds } = attachRecording(doc, result);
    assert.deepEqual(clipIds, [clipId]);
    const clip = clipOf(next, clipId);
    assert.equal(clip.sourceFile, result.file);
    assert.equal(clip.web.key, result.key);
    assert.equal(clip.web.title, 'Example');
    assert.equal(clip.placeholder, false);
    // Attaching it again changes nothing: one undo step, however often it is reported.
    assert.equal(attachRecording(next, result).doc, next);
  });

  it('skips a deleted clip, a locked track and a recipe that changed meanwhile', () => {
    const { doc, clipId } = webDoc(STEPS);
    const result = resultFor(doc, clipId);
    const gone = deleteClips(doc, [clipId]);
    assert.equal(recordingOutcome(gone, clipId, result), 'gone');
    assert.equal(attachRecording(gone, result).doc, gone);
    assert.equal(recordingOutcome(locked(doc), clipId, result), 'locked');
    assert.equal(attachRecording(locked(doc), result).doc.tracks[0].clips[0].sourceFile, '');
    const later = changed(doc, clipId);
    assert.equal(recordingOutcome(later, clipId, result), 'outdated');
    assert.equal(attachRecording(later, result).doc, later);
    assert.equal(clipOf(later, clipId).web.key, '');
  });
});

describe('clip status', () => {
  it('goes from not recorded to recorded to out of date', () => {
    const { doc, clipId } = webDoc(STEPS);
    assert.equal(webState(clipOf(doc, clipId), 30), 'unrecorded');
    assert.deepEqual(webClipStatus(clipOf(doc, clipId), 30), {
      state: 'unrecorded',
      text: 'Not recorded',
      action: 'Record',
    });
    const recorded = attachRecording(doc, resultFor(doc, clipId)).doc;
    const status = webClipStatus(clipOf(recorded, clipId), 30);
    assert.deepEqual(status, {
      state: 'recorded',
      text: 'Recorded 2.9 s · 2560×1440',
      action: 'Record again',
    });
    const stale = changed(recorded, clipId);
    assert.equal(webClipStatus(clipOf(stale, clipId), 30).state, 'stale');
    assert.equal(webClipStatus(clipOf(stale, clipId), 24).state, 'stale');
    assert.equal(webState({ sourceFile: '/a.mp4' }, 30), '');
  });

  it('shows a recording under way with its progress', () => {
    const { doc, clipId } = webDoc(STEPS);
    const clip = clipOf(doc, clipId);
    const running = { status: 'running', progress: 41.6, message: '' };
    assert.equal(webClipStatus(clip, 30, running).text, 'Recording 42 %');
    assert.equal(webClipStatus(clip, 30, running).state, 'recording');
    assert.match(webClipStatus(clip, 30, { ...running, status: 'queued' }).text, /Starting/);
    assert.equal(webClipStatus(clip, 30, { ...running, status: 'error' }).state, 'unrecorded');
    assert.equal(isRecording({ status: 'done', progress: 100, message: '' }), false);
    assert.equal(isRecording(null), false);
  });

  it('names a clip by its title, else its host, and counts what a render lacks', () => {
    const { doc, clipId } = webDoc(STEPS);
    assert.equal(webClipName(clipOf(doc, clipId)), 'example.com');
    const recorded = attachRecording(doc, resultFor(doc, clipId)).doc;
    assert.equal(webClipName(clipOf(recorded, clipId)), 'Example');
    assert.deepEqual(webClipsToRecord(doc), {
      unrecorded: [clipId],
      stale: [],
      total: 1,
      text: '1 web clip is not ready: 1 not recorded yet.',
    });
    assert.equal(webClipsToRecord(recorded).text, '');
    assert.match(webClipsToRecord(changed(recorded, clipId)).text, /1 out of date/);
  });
});

describe('addresses', () => {
  it('reads what a person types', () => {
    assert.deepEqual(readAddress(' example.com/pricing '), {
      url: 'https://example.com/pricing',
      problem: '',
    });
    assert.equal(readAddress('http://example.com').url, 'http://example.com');
    assert.equal(readAddress('localhost:5173').url, 'http://localhost:5173');
    assert.equal(readAddress('127.0.0.1:8080/app').url, 'http://127.0.0.1:8080/app');
    assert.equal(readAddress('192.168.1.20').url, 'http://192.168.1.20');
    assert.match(readAddress('').problem, /Type the address/);
    assert.equal(readAddress('file:///etc/passwd').url, '');
    assert.match(readAddress('file:///etc/passwd').problem, /http/);
    assert.deepEqual(readAddress('not a site'), {
      url: '',
      problem: 'This is not a web address: it has a space',
    });
  });

  it('keeps a short list of recent addresses, newest first, each once', () => {
    assert.deepEqual(addRecent(['a', 'b'], 'b'), ['b', 'a']);
    assert.deepEqual(addRecent(['a', 'b', 'c'], 'd', 3), ['d', 'a', 'b']);
    assert.deepEqual(addRecent(['a'], ''), ['a']);
  });
});
