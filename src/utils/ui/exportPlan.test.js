import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClip, createEdl } from '#utils/edl/factory.js';
import { setCaptions } from '#utils/edl/index.js';
import { defaultFilename, filenameProblem, loopRange } from './exportPlan.js';
import { rangeChoices, renderRequest, summaryText } from './exportPlan.js';

function docOf(seconds) {
  const doc = createEdl();
  if (seconds) {
    doc.tracks[0].clips.push(
      createClip({ clipId: 'c', sourceFile: '/m/a.mp4', sourceOut: seconds, timelineEnd: seconds }),
    );
  }
  return doc;
}

describe('loopRange', () => {
  it('returns the loop region inside the timeline', () => {
    assert.deepEqual(loopRange({ loopStart: 2, loopEnd: 5 }, 10), { start: 2, end: 5 });
    assert.deepEqual(loopRange({ loopStart: 8, loopEnd: 15 }, 10), { start: 8, end: 10 });
  });

  it('is null without a usable region', () => {
    assert.equal(loopRange({ loopStart: 0, loopEnd: 0 }, 10), null);
    assert.equal(loopRange({ loopStart: 3, loopEnd: 3.01 }, 10), null);
    assert.equal(loopRange({ loopStart: 12, loopEnd: 15 }, 10), null, 'past the end');
    assert.equal(loopRange({}, 10), null);
  });
});

describe('rangeChoices', () => {
  it('offers the whole timeline and the loop range', () => {
    const [all, loop] = rangeChoices(docOf(90), { loopStart: 10, loopEnd: 20 });
    assert.deepEqual([all.id, all.available, all.end, all.hint], ['all', true, 90, '1:30']);
    assert.deepEqual([loop.id, loop.available, loop.start, loop.end], ['loop', true, 10, 20]);
    assert.equal(loop.hint, '0:10 – 0:20');
  });

  it('explains how to get a loop range when there is none', () => {
    const [, loop] = rangeChoices(docOf(90), { loopStart: 0, loopEnd: 0 });
    assert.equal(loop.available, false);
    assert.match(loop.hint, /loop region/);
  });

  it('marks an empty timeline as not renderable', () => {
    const [all] = rangeChoices(docOf(0), {});
    assert.equal(all.available, false);
    assert.equal(all.hint, 'The timeline is empty');
  });
});

describe('file names', () => {
  it('proposes the adaptation name without characters the server would replace', () => {
    assert.equal(defaultFilename('Main Edit'), 'Main Edit');
    assert.equal(defaultFilename('16/9 cut: "final"?'), '16 9 cut final');
    assert.equal(defaultFilename('Été — 9:16'), 'Été 9 16');
    assert.equal(defaultFilename(''), 'render');
  });

  it('rejects path separators and very long names', () => {
    assert.equal(filenameProblem('my video'), '');
    assert.ok(filenameProblem('a/b'));
    assert.ok(filenameProblem('a\\b'));
    assert.ok(filenameProblem('x'.repeat(121)));
  });
});

describe('renderRequest', () => {
  const doc = docOf(30);
  const [all, loop] = rangeChoices(doc, { loopStart: 5, loopEnd: 12 });
  const base = { projectId: 'p', adaptationId: 'a', doc, preset: 'draft' };

  it('posts the document on screen with the preset', () => {
    const body = renderRequest({ ...base, range: all, filename: '' });
    assert.deepEqual(Object.keys(body), ['projectId', 'adaptationId', 'edl', 'preset']);
    assert.equal(body.edl, doc);
    assert.equal(body.preset, 'draft');
  });

  it('adds the range only for a loop render', () => {
    assert.deepEqual(renderRequest({ ...base, range: loop, filename: '' }).range, {
      start: 5,
      end: 12,
    });
  });

  it('sends a trimmed file name without the extension', () => {
    assert.equal(
      renderRequest({ ...base, range: all, filename: ' teaser.MP4 ' }).filename,
      'teaser',
    );
    assert.equal('filename' in renderRequest({ ...base, range: all, filename: '  ' }), false);
  });

  it('asks for the chosen subtitle file when the timeline has captions to save', () => {
    const captioned = setCaptions(doc, ['c']);
    const ask = (/** @type {any} */ edl, /** @type {any} */ subtitles) =>
      renderRequest({ ...base, doc: edl, range: all, filename: '', subtitles });
    assert.equal(ask(captioned, 'srt').subtitles, 'srt');
    assert.equal(ask(captioned, 'vtt').subtitles, 'vtt');
    assert.equal(ask(captioned, 'vtt').edl, captioned);
    assert.equal('subtitles' in ask(captioned, ''), false, 'none chosen');
    assert.equal('subtitles' in ask(captioned, 'docx'), false, 'not a subtitle file');
    assert.equal('subtitles' in ask(doc, 'srt'), false, 'a remembered choice, nothing captioned');
    assert.equal(
      'subtitles' in renderRequest({ ...base, doc: captioned, range: all, filename: '' }),
      false,
    );
  });
});

describe('summaryText', () => {
  it('joins the facts it has', () => {
    assert.equal(
      summaryText({ width: 960, height: 540, fps: 30, duration: 83 }),
      '960 × 540 · 30 fps · 1:23',
    );
    assert.equal(
      summaryText({ width: 1920, height: 1080, fps: 29.97, duration: 5 }),
      '1920 × 1080 · 29.97 fps · 0:05',
    );
    assert.equal(summaryText({ duration: 12 }), '0:12');
    assert.equal(summaryText(null), '');
  });
});
