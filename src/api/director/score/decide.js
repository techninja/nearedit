/**
 * What a score's plan comes to: whoever wrote it — the rules or a language
 * model — `decide` turns it into the choices the generator needs. What the
 * form fixes always wins; what it leaves to the brand comes from the kit.
 * Reference: docs/app-spec/DIRECTOR-SCORE.md § The plan, DIRECTOR-BRAND.md § Score.
 * @module api/director/score/decide
 */

import { BRAND } from '#utils/director/brand/theme.js';
import { sectionName } from '#utils/director/score/arc.js';
import { autoStyle } from '#utils/director/score/auto.js';
import { scaleNote } from '#utils/director/score/brand.js';
import { readMood } from '#utils/director/score/mood.js';
import { AUTO, findStyle, getStyle } from '#utils/director/score/styles.js';
import { SONG_LIMITS } from '#utils/music/limits.js';
import { keyName } from '#utils/music/normalize.js';
import { brandChoice } from './brand.js';

/** @typedef {import('./plan.js').ScorePlan} ScorePlan */
/** @typedef {import('./plan.js').Seen} Seen */

const clamp01 = (/** @type {number} */ value) => Math.min(1, Math.max(0, value));

/**
 * Turn a plan into the choices the generator needs.
 * @param {ScorePlan} plan
 * @param {{ params: Record<string, any>, prompt: string, seen: Seen, by: 'llm'|'rule',
 *   kit?: import('#utils/brand/types.js').Kit }} given - `kit`: the brand kit
 *   whose sound `style: brand` and `key: brand` mean
 * @returns {{ style: import('#utils/director/score/style.js').Style, energy: number,
 *   brightness: number, mood: string[], bpm: number, key: string|undefined,
 *   sections: import('#utils/director/score/sections.js').AskedSection[], notes: string[] }}
 */
export function decide(plan, { params, prompt, seen, by, kit }) {
  const notes = [];
  const auto = () =>
    autoStyle({
      cutsPerMinute: seen.cutsPerMinute,
      spoken: seen.speech.spoken,
      seed: params.seed,
      brief: prompt,
    });
  const brand = brandChoice({ params, prompt, plan, kit, auto });
  let style = getStyle(params.style);
  if (style) notes.push(`Style ${style.label}, as chosen in the form.`);
  else if (brand.style && (by !== 'llm' || !findStyle(plan.style))) {
    style = brand.style;
    notes.push(...brand.notes);
  } else if (plan.style === AUTO || plan.style === BRAND || !plan.style) {
    const chosen = auto();
    style = chosen.style;
    notes.push(`Style ${style.label} — ${chosen.why}.`);
  } else {
    style = findStyle(plan.style);
    if (style) notes.push(`Style ${style.label} (the LLM’s choice).`);
    else {
      const chosen = auto();
      style = chosen.style;
      notes.push(`Unknown style “${plan.style}” — ${style.label} is used instead: ${chosen.why}.`);
    }
  }
  const mood = readMood(plan.mood);
  const energy = Math.round(clamp01(params.energy + mood.energy) * 100) / 100;
  const brightness = Math.round(clamp01(0.5 + mood.brightness) * 100) / 100;
  if (mood.known.length) {
    const source = by === 'llm' ? 'Mood' : 'Mood from the brief';
    notes.push(`${source}: ${mood.known.join(', ')} — energy ${energy}, brightness ${brightness}.`);
  }
  if (mood.unknown.length && by === 'llm') {
    notes.push(
      `Mood words the director does not know were passed over: ${mood.unknown.join(', ')}.`,
    );
  }
  const sections = (plan.sections || []).map((section) => {
    const name = sectionName(section.name);
    if (!name) notes.push(`Unknown kind of section “${section.name}” — taken as a verse.`);
    const share = section.share > 0 ? section.share : 1;
    return { name: name || 'verse', share, energy: section.energy };
  });
  const [slowest, fastest] = SONG_LIMITS.bpm;
  const asked = params.bpm > 0 ? params.bpm : plan.bpm;
  const bpm = asked > 0 ? Math.min(fastest, Math.max(slowest, asked)) : 0;
  const free = params.key === AUTO || params.key === BRAND;
  const key = free ? keyName(plan.key, '') || brand.key || undefined : params.key;
  if (free && key && key === brand.key && !keyName(plan.key, '')) notes.push(brand.keyNote);
  const clash = brand.scale ? scaleNote(style, brand.scale) : '';
  if (clash) notes.push(clash);
  return { style, energy, brightness, mood: mood.known, bpm, key, sections, notes };
}
