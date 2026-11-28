/**
 * `score` — music written for the timeline. A score plan says what the
 * music is like (from the form and the timeline, or from the LLM when
 * asked); deterministic code does everything else: it fits a tempo so the
 * span is whole bars, lays the sections out on the timeline's turning
 * points, writes every note from the seed, renders the song and adds it as
 * one music clip on a "Music" track, ducked under speech. The posted
 * timeline comes back whole, as the in-place actions return it, with the
 * one clip added. Reference: docs/app-spec/DIRECTOR-SCORE.md.
 * @module api/director/actions/score
 */

import { fitTempo } from '#utils/director/score/fit.js';
import { generateSong } from '#utils/director/score/generate.js';
import { layoutSections } from '#utils/director/score/sections.js';
import { formatSeconds } from '#utils/director/snap.js';
import { SCALES } from '#utils/music/theory/scales.js';
import { docTracks, inPlaceResult, mediaLookup } from '../inplace/doc.js';
import { placeScore, scoreClip } from '../score/clip.js';
import { duckNotes, sectionNotes, songNote, tempoNote } from '../score/notes.js';
import { decide, planScore } from '../score/plan.js';
import { renderScore } from '../score/render.js';
import { findSpeech } from '../score/speech.js';
import { cutsPerMinute, scoreSpan, turningPoints } from '../score/timeline.js';

/**
 * @typedef {import('../pipeline.js').ActionContext} ActionContext
 * @typedef {{ render?: import('../score/render.js').Renderer }} ScoreParts - The
 *   renderer, for tests to stand in for
 */

const round = (/** @type {number} */ value) => Math.round(value * 100) / 100;

/**
 * @param {ActionContext} ctx
 * @param {ScoreParts} [deps]
 * @returns {Promise<import('../result.js').DirectorResult>}
 */
export async function score(ctx, deps = {}) {
  const { directive, format, edl } = ctx;
  const { params, prompt } = directive;
  const { fps } = format;
  const span = scoreSpan(edl, directive, fps);
  const seen = {
    seconds: span.seconds,
    what: span.what,
    cutsPerMinute: cutsPerMinute(edl, span),
    points: turningPoints(edl, span),
    speech: findSpeech(edl, span, mediaLookup(ctx.media)),
  };
  ctx.progress(12, `Scoring ${formatSeconds(span.seconds)}: ${span.what}`);
  const notes = [];
  const planned = await planScore(ctx, seen, notes);
  const made = decide(planned.plan, { params, prompt, seen, by: planned.by });
  const { style } = made;
  notes.push(...made.notes);
  ctx.signal?.throwIfAborted();

  const fit = fitTempo(span.seconds, style, {
    energy: made.energy,
    bpm: made.bpm,
    points: seen.points,
  });
  const barSeconds = (fit.beatsPerBar * 60) / fit.bpm;
  const sections = layoutSections({
    ...{ bars: fit.bars, barSeconds, points: seen.points },
    ...{ energy: made.energy, asked: made.sections },
  });
  const { song, harmony } = generateSong({
    ...{ style, bpm: fit.bpm, bars: fit.bars, sections, seed: params.seed },
    ...{ key: made.key, brightness: made.brightness, rest: fit.rest },
  });
  const scale = SCALES[harmony.scale].label.toLowerCase();
  const title = `${style.label} in ${harmony.key} ${scale}, ${round(fit.bpm)} BPM`;
  ctx.progress(40, `Rendering ${title}…`);
  const rendering = await renderScore({ ctx, song, render: deps.render });
  ctx.signal?.throwIfAborted();

  const tracks = docTracks(edl);
  const built = scoreClip({
    ...{ rendering, song, span, fps, barSeconds, rest: fit.rest },
    ...{ speech: seen.speech.spans, volume: params.volume, duck: params.duck },
    label: `Score · ${title}`,
  });
  const placed = placeScore(tracks, built.clip);
  notes.push(
    tempoNote(fit, style, span.seconds),
    ...sectionNotes(sections, barSeconds, seen.points),
    songNote(song, harmony),
    ...duckNotes({ duck: params.duck, speech: seen.speech, ducked: built.ducked }),
    placed.created
      ? 'The clip is on a new audio track, “Music”.'
      : `The clip is on the track “${placed.track.name}”, which was free there.`,
  );
  if (placed.beside) {
    notes.push('There is other music in this span: mute or remove one of the two.');
  }
  if (built.short > 0.05) {
    notes.push(`A song cannot be longer: the last ${formatSeconds(built.short)} have no music.`);
  }
  notes.push(
    'It is an ordinary music clip: open it to change any note, or run again with another ' +
      'variation number for another take.',
  );
  const ducked = built.ducked.length;
  const summary =
    `Score: ${title} — ${fit.bars} bar${fit.bars === 1 ? '' : 's'} over ` +
    `${formatSeconds(built.clip.timelineEnd - span.start)}, ${sections.length} ` +
    `section${sections.length === 1 ? '' : 's'}` +
    (ducked ? `, ducked under speech in ${ducked} place${ducked === 1 ? '' : 's'}` : '');
  const plan = {
    style: style.id,
    mood: made.mood,
    energy: made.energy,
    brightness: made.brightness,
    ...{ key: harmony.key, scale: harmony.scale, progression: harmony.numerals },
    ...{ bpm: round(fit.bpm), beatsPerBar: fit.beatsPerBar, bars: fit.bars, seed: params.seed },
    sections: sections.map((section) => ({
      ...section,
      start: round(span.start + section.from * barSeconds),
      end: round(span.start + section.to * barSeconds),
    })),
    speech: built.ducked.map((s) => ({
      start: round(span.start + s.start),
      end: round(span.start + s.end),
    })),
  };
  return { ...inPlaceResult(ctx, tracks, summary, notes), plan };
}
