/**
 * Plan resolution — turn a validated edit plan into picks bound to real
 * media. Handles become MediaInfo, segment and scene numbers become rough
 * source times, roles are made to fit the file. A language model never
 * gets to invent a file: whatever cannot be resolved is dropped and
 * explained in `notes`.
 * @module api/director/plan/resolve
 */

import { resolvePart, segmentRuns } from './parts.js';

/**
 * @typedef {import('../context/mediaInfo.js').MediaInfo} MediaInfo
 * @typedef {import('./parts.js').ResolvedPart} ResolvedPart
 * @typedef {ResolvedPart & { role: 'primary'|'narration'|'broll', title: string, note: string,
 *   visuals: ResolvedPart[], index: number }} ResolvedPick
 * @typedef {Object} ResolvedPlan
 * @property {string} title
 * @property {string} rationale
 * @property {{ media: MediaInfo, start: number, volume: number|null } | null} music
 * @property {ResolvedPick[]} picks
 * @property {string[]} notes
 */

/**
 * Find the file a plan refers to: by handle, then by path or name.
 * @param {unknown} ref
 * @param {MediaInfo[]} media
 * @returns {MediaInfo|null}
 */
export function findMedia(ref, media) {
  if (typeof ref !== 'string' || !ref.trim()) return null;
  const want = ref.trim().replace(/^["']|["']$/g, '');
  const lower = want.toLowerCase();
  const stem = (/** @type {string} */ name) => name.replace(/\.[^.]+$/, '').toLowerCase();
  return (
    media.find((m) => m.handle === lower) ||
    media.find((m) => m.filePath === want || m.relativePath === want) ||
    media.find((m) => m.filename.toLowerCase() === lower) ||
    media.find((m) => stem(m.filename) === stem(want)) ||
    null
  );
}

/**
 * The role a pick can actually play given its file.
 * @param {string|undefined} asked
 * @param {MediaInfo} m
 * @returns {'primary'|'narration'|'broll'|'music'}
 */
export function fitRole(asked, m) {
  if (m.type === 'image') return 'broll';
  if (m.type === 'audio') {
    if (asked === 'music' || (!asked && m.kind === 'music')) return 'music';
    return asked === 'broll' && m.kind === 'music' ? 'music' : 'narration';
  }
  if (asked === 'music') return m.hasAudio ? 'music' : 'broll';
  if (!m.hasAudio) return 'broll';
  if (asked === 'primary' || asked === 'narration' || asked === 'broll') return asked;
  return m.kind === 'speech' ? 'primary' : 'broll';
}

/**
 * @param {any[]} visuals
 * @param {MediaInfo[]} media
 * @param {string} label
 * @param {string[]} notes
 * @returns {ResolvedPart[]}
 */
function resolveVisuals(visuals, media, label, notes) {
  const out = [];
  for (const visual of visuals || []) {
    const m = findMedia(visual.file, media);
    if (!m) notes.push(`${label}: unknown visual "${visual.file}" — dropped.`);
    else if (!m.hasVideo)
      notes.push(`${label}: ${m.filename} has no picture — not used as a visual.`);
    else out.push(resolvePart(visual, m, label, notes));
  }
  return out;
}

/**
 * Resolve a plan against the project's media.
 * @param {any} plan - Valid against PLAN_SCHEMA
 * @param {MediaInfo[]} media
 * @returns {ResolvedPlan}
 */
export function resolvePlan(plan, media) {
  const notes = [];
  /** @type {ResolvedPlan} */
  const out = {
    title: (plan.title || '').trim(),
    rationale: plan.rationale || '',
    music: null,
    picks: [],
    notes,
  };
  const setMusic = (
    /** @type {MediaInfo} */ m,
    /** @type {any} */ start,
    /** @type {any} */ volume,
  ) => {
    const from = Number.isFinite(start) && (!m.duration || start < m.duration - 1) ? start : 0;
    out.music = { media: m, start: from, volume: Number.isFinite(volume) ? volume : null };
  };
  if (plan.music) {
    const m = findMedia(plan.music.file, media);
    if (!m) notes.push(`Music: unknown file "${plan.music.file}" — dropped.`);
    else if (!m.hasAudio) notes.push(`Music: ${m.filename} has no sound — dropped.`);
    else setMusic(m, plan.music.start, plan.music.volume);
  }

  plan.picks.forEach((/** @type {any} */ pick, /** @type {number} */ i) => {
    const label = `Pick ${i + 1}`;
    const m = findMedia(pick.file, media);
    if (!m) return notes.push(`${label}: unknown file "${pick.file}" — dropped.`);
    const role = fitRole(pick.role, m);
    if (role === 'music') {
      if (out.music) notes.push(`${label}: a music bed is already set — ${m.filename} dropped.`);
      else setMusic(m, pick.start, null);
      return;
    }
    if (pick.role && pick.role !== role)
      notes.push(`${label}: ${m.filename} cannot be "${pick.role}" — used as ${role}.`);
    const visuals = resolveVisuals(pick.visuals, media, label, notes);
    const runs = segmentRuns(pick, m, label, notes);
    runs.forEach((run, r) =>
      out.picks.push({
        ...resolvePart({ ...pick, segments: run }, m, label, notes),
        role,
        title: r === 0 ? (pick.title || '').trim() : '',
        note: r === 0 ? pick.note || '' : '',
        visuals: r === 0 ? visuals : [],
        index: i,
      }),
    );
  });
  return out;
}
