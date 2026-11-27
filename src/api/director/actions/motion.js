/**
 * `motion_piece` — a piece made only of generated layers, from a brief:
 * gradients, noise, patterns, shapes, particles and animated titles; no
 * media files. A motion plan says what each scene shows (written by the
 * heuristic planner, or by the LLM when asked); the builder turns it into
 * frame-exact clips. Reference: docs/app-spec/DIRECTOR-MOTION.md.
 * @module api/director/actions/motion
 */

import { formatSeconds } from '#utils/director/snap.js';
import { getTheme } from '#utils/director/motion/themes.js';
import { briefScenes, checkBrief } from '../motion/brief.js';
import { buildMotion } from '../motion/build.js';
import { completePlan } from '../motion/complete.js';
import { requestMotionPlan } from '../motion/request.js';
import { motionPrompt } from '../prompts/motion.js';
import { directorResult } from '../result.js';

/** @typedef {import('../pipeline.js').ActionContext} ActionContext */

/**
 * Let the LLM write the plan; null when it cannot (the brief's lines take over).
 * @param {ActionContext} ctx
 * @param {number} target - Target length in seconds, 0 for none
 * @param {string[]} notes
 * @returns {Promise<any|null>} A plan valid against the motion-plan schema
 */
async function askLlm(ctx, target, notes) {
  const { directive, llm, format } = ctx;
  try {
    ctx.progress(15, `Asking ${llm.model} for a motion plan…`);
    let lastReport = 0;
    const asked = await requestMotionPlan({
      llm,
      ...motionPrompt({ directive, format, target }),
      signal: ctx.signal,
      log: ctx.log,
      onProgress: (chars, attempt) => {
        if (Date.now() - lastReport < 750) return;
        lastReport = Date.now();
        const verb = attempt === 1 ? 'Writing' : 'Correcting';
        ctx.progress(Math.min(80, 15 + chars / 40), `${verb} the plan… ${chars} characters`);
      },
    });
    const count = asked.plan.scenes.length;
    ctx.progress(85, `Plan received: ${count} scene${count === 1 ? '' : 's'} — building…`);
    notes.push(`The scenes were written by the LLM (${llm.model}).`, ...asked.notes);
    return asked.plan;
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    notes.push(
      `The LLM could not write the plan (${err.message}) — the lines of the brief were used as scenes instead.`,
    );
    return null;
  }
}

/**
 * A readable list: "a, b and c".
 * @param {string[]} items
 * @returns {string}
 */
function listed(items) {
  const unique = [...new Set(items)];
  if (unique.length < 2) return unique.join('');
  return `${unique.slice(0, -1).join(', ')} and ${unique[unique.length - 1]}`;
}

/**
 * @param {ActionContext} ctx
 * @returns {Promise<import('../result.js').DirectorResult>}
 */
export async function motionPiece(ctx) {
  const { directive, format, edl } = ctx;
  const { params, context, mode } = directive;
  checkBrief(directive);
  const span = mode === 'range' && context.range ? context.range.end - context.range.start : 0;
  const target = params.duration || span;
  const notes = [];

  let raw = params.useLlm ? await askLlm(ctx, target, notes) : null;
  if (!raw) {
    const read = briefScenes(directive.prompt);
    raw = { scenes: read.scenes };
    notes.push(...read.notes);
  }
  const completed = completePlan(raw, params);
  const { plan } = completed;
  const theme = getTheme(plan.theme);
  const built = buildMotion(plan, {
    format,
    seed: params.seed,
    pacing: params.pacing,
    duration: target,
  });
  // Why this theme: the editor named it, the plan did, or the variation number chose.
  let chosen = ` (variation ${params.seed})`;
  if (params.theme === plan.theme) chosen = '';
  else if (getTheme(raw.theme)?.id === plan.theme) chosen = ' (the LLM’s choice)';
  notes.push(
    ...completed.notes,
    `Theme ${theme.label}${chosen}: ${theme.description.toLowerCase()}.`,
    `Laid out for ${format.width}×${format.height} at ${format.fps} fps; text is ` +
      `${plan.align === 'left' ? 'set against the left margin' : 'centred'}.`,
    ...built.notes,
    'Every clip is an ordinary generator or title: change its text, colours, keyframes or ' +
      'effects in the inspector, or run again with another variation number for a different take.',
  );
  const count = plan.scenes.length;
  const particles = plan.scenes.map((s) => s.particles).filter((p) => p !== 'none');
  const summary =
    `Motion piece “${theme.label}”: ${count} scene${count === 1 ? '' : 's'}, ` +
    `${formatSeconds(built.seconds)} — ${listed(plan.scenes.map((s) => s.background))} ` +
    `background${new Set(plan.scenes.map((s) => s.background)).size === 1 ? '' : 's'}` +
    (particles.length ? `, ${listed(particles)}` : '');
  const described = {
    ...plan,
    scenes: plan.scenes.map((scene, i) => ({
      ...scene,
      duration:
        Math.round(((built.shots[i].endF - built.shots[i].startF) / format.fps) * 100) / 100,
    })),
  };
  return directorResult(
    { tracks: built.tracks, markers: built.markers, summary, notes, plan: described },
    directive,
    edl,
    format.fps,
  );
}
