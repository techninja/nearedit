import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SECTION_ENERGY, SECTION_NAMES, arcLevels, sectionName, sectionNames } from './arc.js';
import { shapeEnergy } from './arc.js';
import { MAX_SECTIONS, layoutSections, phraseBars, turningBars } from './sections.js';

const point = (time, weight = 3) => ({ time, weight });
const starts = (sections) => sections.map((section) => section.from);
const names = (sections) => sections.map((section) => section.name);
/** Sections must cover the song without gaps, each at least two bars, the last three. */
function checkCover(sections, bars, at = '') {
  assert.equal(sections[0].from, 0, at);
  assert.equal(sections.at(-1).to, bars, at);
  sections.forEach((section, i) => {
    if (i) assert.equal(section.from, sections[i - 1].to, `${at}: a gap before ${section.name}`);
    const least = i === sections.length - 1 && sections.length > 1 ? 3 : bars > 1 ? 2 : 1;
    assert.ok(section.to - section.from >= Math.min(bars, least), `${at}: ${section.name} too short`);
    assert.ok(SECTION_NAMES.includes(section.name), `${at}: ${section.name}`);
    assert.ok(section.energy >= 0.05 && section.energy <= 1, `${at}: ${section.energy}`);
  });
}

test('sections begin on the bar line nearest each marker', () => {
  // 32 bars of 2 s. Markers at 15.2 s, 31 s and 48.9 s: bars 8, 16 (15.5 rounds up) and 24.
  const sections = layoutSections({
    bars: 32,
    barSeconds: 2,
    points: [point(15.2), point(31), point(48.9)],
  });
  assert.deepEqual(starts(sections), [0, 8, 16, 24]);
  assert.deepEqual(names(sections), ['intro', 'verse', 'lift', 'outro']);
  checkCover(sections, 32);
  // Nearest means nearest: 16.9 s is bar 8, 17.1 s bar 9.
  assert.deepEqual(turningBars(32, 2, [point(16.9)]), [8]);
  assert.deepEqual(turningBars(32, 2, [point(17.1)]), [9]);
  const odd = layoutSections({ bars: 20, barSeconds: 2, points: [point(14.2), point(26)] });
  assert.deepEqual(starts(odd), [0, 7, 13], 'on bars 7 and 13, not on a round number');
});

test('markers come first; what is too close to another point or to an end begins nothing', () => {
  // A cut at 16 s and a marker at 18 s are one bar apart: the marker is kept.
  assert.deepEqual(turningBars(32, 2, [point(16, 1), point(18, 3)]), [9]);
  assert.deepEqual(turningBars(32, 2, [point(16, 3), point(18, 1)]), [8]);
  // Two bars apart, both are.
  assert.deepEqual(turningBars(32, 2, [point(16, 1), point(20, 3)]), [8, 10]);
  // Not in the first two bars, nor in the last three.
  assert.deepEqual(turningBars(32, 2, [point(1), point(2.8), point(4.2)]), [2]);
  assert.deepEqual(turningBars(32, 2, [point(57.9), point(59), point(63)]), [29]);
  // A section lasts at least four seconds: at a fast tempo that is more than two bars.
  assert.deepEqual(turningBars(40, 1.4, [point(14), point(16.8), point(19.6)]), [10, 14]);
  // Equal weights: the earlier one is kept.
  assert.deepEqual(turningBars(32, 2, [point(18, 2), point(16, 2)]), [8]);
  const many = Array.from({ length: 60 }, (_, i) => point(8 + i * 8.1));
  assert.equal(turningBars(256, 2, many).length, MAX_SECTIONS - 1);
});

test('a stretch without a turning point is divided into phrases', () => {
  // No points at all. A phrase is the first of 4, 8, 16… bars to last eleven seconds.
  assert.deepEqual(phraseBars([], 64, 2), [8, 16, 24, 32, 40, 48, 56]);
  assert.deepEqual(phraseBars([], 10, 3.4), [4]);
  assert.deepEqual(phraseBars([], 24, 1.5), [8, 16]);
  assert.deepEqual(phraseBars([], 21, 2), [8, 16]);
  // A song that would have fewer than three sections gets phrases half as long.
  assert.deepEqual(phraseBars([], 18, 2), [4, 8, 12]);
  assert.deepEqual(phraseBars([9], 18, 2), [4, 9, 13]);
  assert.deepEqual(phraseBars([], 5, 2), []);
  // Around a marker on bar 7 of 32: the stretch after it is divided from the marker on.
  assert.deepEqual(phraseBars([7], 32, 2), [7, 15, 23]);
  // Stretches up to a phrase and a half stay whole.
  assert.deepEqual(phraseBars([8, 16, 24], 32, 2), [8, 16, 24]);
  assert.deepEqual(phraseBars([12], 24, 2), [12]);
  // The last section keeps at least three bars, and half a phrase.
  assert.deepEqual(phraseBars([], 14, 2), [4, 8]);
  // A long song has longer phrases, not more sections than a score may have.
  assert.equal(phraseBars([], 300, 2).length, 18);
  for (const bars of [1, 2, 3, 5, 6, 7, 9, 13, 17, 31, 64, 100, 257, 512]) {
    for (const barSeconds of [1.4, 2, 3.5]) {
      const sections = layoutSections({ bars, barSeconds });
      checkCover(sections, bars, `${bars} bars of ${barSeconds}s`);
      assert.ok(sections.length <= MAX_SECTIONS, `${bars}: ${sections.length} sections`);
    }
  }
  assert.deepEqual(names(layoutSections({ bars: 1, barSeconds: 2 })), ['verse']);
});

test('the arc: an intro, an outro, and the last thing before the outro is a lift', () => {
  assert.deepEqual(sectionNames(1), ['verse']);
  assert.deepEqual(sectionNames(2), ['intro', 'lift']);
  assert.deepEqual(sectionNames(3), ['intro', 'lift', 'outro']);
  assert.deepEqual(sectionNames(4), ['intro', 'verse', 'lift', 'outro']);
  assert.deepEqual(sectionNames(5), ['intro', 'verse', 'break', 'lift', 'outro']);
  assert.deepEqual(sectionNames(6), ['intro', 'verse', 'lift', 'break', 'lift', 'outro']);
  for (let count = 3; count <= MAX_SECTIONS; count++) {
    const arc = sectionNames(count);
    assert.equal(arc.length, count);
    assert.deepEqual([arc[0], arc.at(-2), arc.at(-1)], ['intro', 'lift', 'outro'], `${count}`);
    arc.forEach((name, i) => {
      if (i) assert.ok(!(name === 'break' && arc[i - 1] === 'break'), `${count}: two breaks`);
    });
  }
  // The last of several lifts is the peak.
  assert.deepEqual(arcLevels(sectionNames(6)), [0.3, 0.55, 0.9, 0.3, 1, 0.45]);
  assert.deepEqual(arcLevels(sectionNames(4)), [0.3, 0.55, 0.9, 0.45]);
});

test('the energy parameter moves the whole arc', () => {
  assert.equal(shapeEnergy(0.9, 0.5), 0.9);
  assert.equal(shapeEnergy(0.9, 0), 0.45);
  assert.equal(shapeEnergy(0.9, 1), 1);
  assert.equal(shapeEnergy(0.3, 1), 0.45);
  assert.equal(shapeEnergy(0.05, 0), 0.05);
  assert.equal(shapeEnergy(0.6, NaN), 0.6);
  const levels = (energy) =>
    layoutSections({ bars: 16, barSeconds: 2, energy }).map((section) => section.energy);
  assert.deepEqual(levels(0.5), [0.3, 0.55, 0.9, 0.45]);
  assert.deepEqual(levels(0), [0.15, 0.275, 0.45, 0.225]);
  assert.deepEqual(levels(1), [0.45, 0.825, 1, 0.675]);
});

test('a plan’s sections take their share of the length and begin on turning points nearby', () => {
  const asked = [
    { name: 'intro', share: 1, energy: 0.2 },
    { name: 'verse', share: 2 },
    { name: 'lift', share: 1, energy: 1 },
  ];
  const plain = layoutSections({ bars: 32, barSeconds: 2, asked });
  assert.deepEqual(starts(plain), [0, 8, 24]);
  assert.deepEqual(
    plain.map((section) => [section.name, section.energy]),
    [
      ['intro', 0.2],
      ['verse', SECTION_ENERGY.verse],
      ['lift', 1],
    ],
  );
  // A marker at 19 s (bar 10, two bars from the plan's bar 8) is where the verse begins.
  const pulled = layoutSections({ bars: 32, barSeconds: 2, asked, points: [point(19)] });
  assert.deepEqual(starts(pulled), [0, 10, 24]);
  // One at 26 s (bar 13) is too far away to move it.
  const far = layoutSections({ bars: 32, barSeconds: 2, asked, points: [point(26)] });
  assert.deepEqual(starts(far), [0, 8, 24]);
  // The energy parameter still moves a plan's levels.
  const quiet = layoutSections({ bars: 32, barSeconds: 2, asked, energy: 0 });
  assert.deepEqual(
    quiet.map((section) => section.energy),
    [0.1, 0.275, 0.5],
  );
  // Sections that would be too short are merged into the one before.
  const crowded = Array.from({ length: 12 }, (_, i) => ({ name: i % 2 ? 'lift' : 'verse', share: 1 }));
  const merged = layoutSections({ bars: 10, barSeconds: 2, asked: crowded });
  checkCover(merged, 10, 'twelve sections in ten bars');
  assert.ok(merged.length < 12 && merged.length >= 3);
  assert.deepEqual(names(layoutSections({ bars: 8, barSeconds: 2, asked: [asked[2]] })), ['lift']);
});

test('sections are named in any of the words people use', () => {
  for (const name of SECTION_NAMES) assert.equal(sectionName(name), name);
  assert.equal(sectionName(' Chorus '), 'lift');
  assert.equal(sectionName('build-up'), 'verse');
  assert.equal(sectionName('Verse 2'), 'verse');
  assert.equal(sectionName('BRIDGE'), 'break');
  assert.equal(sectionName('ending'), 'outro');
  for (const nothing of ['solo', '', null, 3, {}]) assert.equal(sectionName(nothing), null);
});
