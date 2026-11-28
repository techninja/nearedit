import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClip, createEdl, createTrack } from '#utils/edl/factory.js';
import { renderSegments } from './segments.js';
import { isRenderName } from './store.js';
import { subtitleCues, subtitleName, subtitleText } from './subtitles.js';
import { loadWords, spokenClips, wordsFrom } from './words.js';

/** The pure parts of captions in a render: words, routing, subtitle files. */

const TALK = '/m/talk.mp4';
const BED = '/m/bed.mp3';
const said = (text, from = 1) =>
  text.split(' ').map((word, i) => ({ word, start: from + i * 0.5, end: from + 0.4 + i * 0.5 }));
const SIDECARS = {
  [TALK]: { transcript: said('We ship. It works well. Thanks for watching all.') },
};
const read = (file) => SIDECARS[file] || null;

/** Plain footage for 20 s; the talk's sound from 4 to 12 s and a music bed, both captioned. */
function timeline(audio = {}) {
  const clip = (clipId, sourceFile, start, end, more = {}) =>
    createClip({ clipId, sourceFile, timelineStart: start, timelineEnd: end, ...more });
  const on = { captions: { on: true } };
  return createEdl({
    tracks: [
      createTrack('video', { trackId: 'v1', clips: [clip('pic', '/m/broll.mp4', 0, 20)] }),
      createTrack('audio', { trackId: 'a1', clips: [clip('vo', TALK, 4, 12, on)], ...audio }),
      createTrack('audio', { trackId: 'a2', clips: [clip('bed', BED, 0, 20, on)] }),
    ],
  });
}
const routed = (edl, options) =>
  renderSegments(edl, options).map((s) => [s.start, s.end, s.engine, s.reasons.join()]);

describe('words of a render', () => {
  it('reads the transcript of every captioned file and names those without one', () => {
    const asked = [];
    const { words, warnings } = loadWords(timeline(), (file) => (asked.push(file), read(file)));
    assert.deepEqual(asked, [TALK, BED]);
    assert.equal(words[TALK].transcript.length, 9);
    assert.deepEqual(words[TALK].segments, []);
    assert.equal(words[BED], null);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /^Captions are on for \/m\/bed\.mp3, which has no transcript/);
    assert.equal(
      wordsFrom(words)({ sourceFile: TALK }),
      words[TALK],
      'the same object every frame',
    );
    assert.equal(wordsFrom(words)({ sourceFile: '/m/other.mp4' }), null);
    assert.equal(wordsFrom(undefined)({ sourceFile: TALK }), null);
  });

  it('asks for nothing when no clip is captioned, muted clips included, and survives a bad sidecar', () => {
    assert.deepEqual(loadWords(timeline({ muted: true }), () => null).warnings.length, 1);
    const none = timeline();
    for (const track of none.tracks) for (const clip of track.clips) delete clip.captions;
    assert.deepEqual(loadWords(none, read), { words: {}, warnings: [] });
    const warn = console.warn;
    console.warn = () => {};
    try {
      const broken = loadWords(timeline(), () => {
        throw new Error('not JSON');
      });
      assert.deepEqual(broken.words, { [TALK]: null, [BED]: null });
    } finally {
      console.warn = warn;
    }
    assert.equal(
      loadWords(timeline(), () => ({ transcript: 'x', segments: [] })).words[TALK],
      null,
    );
    const phrases = { segments: [{ start: 1, end: 2, text: 'only phrases' }] };
    assert.deepEqual(loadWords(timeline(), () => phrases).words[TALK].transcript, []);
  });
});

describe('routing captions', () => {
  it('draws the stretch a voice with words covers, and leaves the rest to the filter graph', () => {
    const edl = timeline();
    const { words } = loadWords(edl, read);
    assert.deepEqual(routed(edl, { words }), [
      [0, 4, 'ffmpeg', ''],
      [4, 8, 'canvas', 'captions'],
      [8, 12, 'canvas', 'captions'],
      [12, 20, 'ffmpeg', ''],
    ]);
    assert.deepEqual(
      spokenClips(edl.tracks, words).map((clip) => clip.clipId),
      ['vo'],
    );
  });

  it('draws for every captioned voice while the words are not known', () => {
    const all = routed(timeline());
    assert.ok(all.every(([, , engine, reasons]) => engine === 'canvas' && reasons === 'captions'));
    assert.deepEqual([all[0][0], all[all.length - 1][1]], [0, 20]);
  });

  it('draws nothing for a voice that is not heard, or that has no words', () => {
    const edl = timeline({ muted: true });
    assert.deepEqual(routed(edl, { words: loadWords(edl, read).words }), [[0, 20, 'ffmpeg', '']]);
    const own = timeline();
    own.tracks[2].clips[0].captions = { on: true, words: [[1, 2, 'la']] };
    const table = loadWords(own, () => null).words;
    assert.deepEqual(table, { [TALK]: null });
    assert.ok(routed(own, { words: table }).every(([, , engine]) => engine === 'canvas'));
  });

  it('is refused by a renderer that cannot draw it', () => {
    const edl = timeline();
    const options = {
      words: loadWords(edl, read).words,
      engine: /** @type {'ffmpeg'} */ ('ffmpeg'),
    };
    assert.throws(
      () => renderSegments(edl, options),
      /cannot render this timeline: it has captions/,
    );
  });
});

describe('subtitle files', () => {
  const edl = timeline();
  const { words } = loadWords(edl, read);

  it('writes phrases for reading by default, the groups as drawn when asked', () => {
    const phrases = subtitleCues(edl, words);
    assert.deepEqual(
      phrases.map((cue) => cue.text),
      ['We ship.', 'It works well.', 'Thanks for watching all.'],
    );
    assert.deepEqual([phrases[0].start, phrases[1].start], [5, 6]);
    const drawn = subtitleCues(edl, words, { as: 'drawn' });
    assert.deepEqual(drawn.map((cue) => cue.text).slice(-2), ['Thanks', 'for watching all.']);
    assert.match(
      subtitleText(phrases, 'srt'),
      /^1\n00:00:05,000 --> 00:00:06,000\nWe ship\.\n\n2\n/,
    );
    assert.match(subtitleText(phrases, 'vtt'), /^WEBVTT\n\n00:00:05\.000 --> /);
    // A style that shouts: the picture's groups do, the phrases keep the text as written.
    const pop = { ...edl, captions: { style: { preset: 'pop' } } };
    assert.equal(subtitleCues(pop, words)[1].text, 'It works well.');
    assert.equal(subtitleCues(pop, words, { as: 'drawn' })[1].text, 'IT WORKS');
  });

  it('times a range from its start and keeps only what falls inside', () => {
    const cues = subtitleCues(edl, words, { range: { start: 5.5, end: 7 } });
    assert.deepEqual(
      cues.map((cue) => [cue.start, cue.end, cue.text]),
      [
        [0, 0.5, 'We ship.'],
        [0.5, 1.5, 'It works well.'],
      ],
    );
    assert.deepEqual(subtitleCues(edl, words, { range: { start: 15, end: Infinity } }), []);
    assert.deepEqual(subtitleCues(timeline({ muted: true }), words), []);
  });

  it('is named after its video and may be fetched and deleted like one', () => {
    assert.equal(subtitleName('My Cut.mp4', 'srt'), 'My Cut.srt');
    assert.equal(subtitleName('/out/a.b/final.cut.mp4', 'vtt'), '/out/a.b/final.cut.vtt');
    for (const name of ['a.mp4', 'a.srt', 'a.VTT']) assert.equal(isRenderName(name), true, name);
    for (const name of ['a.mp4.json', '.a.srt', 'a.txt', '../a.srt', 'x/a.vtt', 'srt']) {
      assert.equal(isRenderName(name), false, name);
    }
  });
});
