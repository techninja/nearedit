/**
 * The render job: probe sources, read the transcripts captions need →
 * render the passes → move the finished file into the renders directory
 * with its record, and its subtitle file when one was asked for. Everything temporary
 * (graph scripts, envelope tracks, segments, the partial output) lives in
 * one work directory that is removed on success, failure and cancellation.
 * @module api/render/job
 */

import { mkdtempSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { encodeTimeline } from './passes.js';
import { prepareRender } from './prepare.js';
import { renderSources } from './scope.js';
import { rendersDir, renderUrl, sanitizeFilename, uniqueName, writeRecord } from './store.js';
import { subtitleCues, subtitleName, subtitleText } from './subtitles.js';

const WORK_PREFIX = '.work-';
const STALE_MS = 10 * 60_000;
/** Work directories of renders running in this process. */
const active = new Set();

/**
 * Remove work directories left behind by a crashed server: not ours, and
 * nothing written to them for a while.
 * @param {string} dir - Renders directory
 */
function sweepStaleWork(dir) {
  for (const entry of readdirSync(dir)) {
    if (!entry.startsWith(WORK_PREFIX) || active.has(entry)) continue;
    const path = join(dir, entry);
    try {
      const times = readdirSync(path).map((file) => statSync(join(path, file)).mtimeMs);
      const newest = Math.max(statSync(path).mtimeMs, ...times);
      if (Date.now() - newest > STALE_MS) rmSync(path, { recursive: true, force: true });
    } catch (err) {
      console.warn(`[render] cannot clean ${path}: ${err.message}`);
    }
  }
}

/**
 * Default output name: the adaptation name and the local time.
 * @param {string} name
 * @returns {string}
 */
function defaultName(name) {
  const now = new Date();
  const two = (value) => String(value).padStart(2, '0');
  const day = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}`;
  const time = `${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`;
  // An adaptation may be called "16/9 cut": keep the name, lose the separator.
  return sanitizeFilename(`${(name || 'render').replace(/[/\\\0]/g, '_')}-${day}-${time}`);
}

/**
 * Save a render's captions as a subtitle file beside it.
 * @param {import('./request.js').RenderRequest} request
 * @param {import('./words.js').WordTable} words
 * @param {string} file - The render's file name
 * @returns {{ file: string, url: string, format: string, cues: number } | null}
 *   null when the timeline has no captions to write
 */
function saveSubtitles(request, words, file) {
  const cues = subtitleCues(request.edl, words, { range: request.range });
  if (!cues.length) return null;
  const name = subtitleName(file, request.subtitles);
  writeFileSync(join(rendersDir(), name), subtitleText(cues, request.subtitles));
  return { file: name, url: renderUrl(name), format: request.subtitles, cues: cues.length };
}

/**
 * Worker of a `render` job.
 * @param {import('./request.js').RenderRequest} request
 * @param {import('../lib/jobs.js').JobContext} ctx
 * @returns {Promise<{ output: string, file: string, url: string, duration: number,
 *   size: number, width: number, height: number, fps: number, warnings: string[],
 *   subtitles?: { file: string, url: string, format: string, cues: number } }>}
 *   `warnings`: what the render could not honour; `subtitles`: the file
 *   that was saved beside the video, when one was asked for and there were captions
 */
export async function runRender(request, ctx) {
  const dir = rendersDir();
  sweepStaleWork(dir);
  const workDir = mkdtempSync(join(dir, WORK_PREFIX));
  active.add(basename(workDir));
  try {
    ctx.log(`Probing ${renderSources(request.edl).length} source file(s)`);
    const { signal, log } = ctx;
    const prepared = await prepareRender(request.edl, { signal, log });
    const { probes, capabilities, words } = prepared;
    for (const warning of prepared.warnings) log(`Warning: ${warning}`);
    const partial = join(workDir, 'output.mp4');
    const plan = await encodeTimeline(
      request.edl,
      {
        ...{ probes, capabilities, words, workDir, outputPath: partial },
        ...{ preset: request.preset, range: request.range },
      },
      ctx,
    );

    const file = uniqueName(request.filename || defaultName(request.name));
    const output = join(dir, file);
    renameSync(partial, output);
    const { width, height } = plan;
    const facts = {
      ...{ duration: Number(plan.duration.toFixed(3)), size: statSync(output).size },
      ...{ width, height, fps: Number(plan.fps.toFixed(3)) },
    };
    const warnings = [...prepared.warnings, ...plan.warnings];
    const subtitles = request.subtitles ? saveSubtitles(request, words, file) : null;
    if (request.subtitles && !subtitles) {
      warnings.push('Subtitles were asked for, but no clip that is heard has captions with words');
      log(`Warning: ${warnings[warnings.length - 1]}`);
    }
    const extras = subtitles ? { subtitles } : {};
    writeRecord(file, {
      ...{ projectId: request.projectId, adaptationId: request.adaptationId },
      ...{ preset: request.preset, range: request.range, ...facts, createdAt: Date.now() },
      ...extras,
    });
    ctx.log(`Finished ${file}${subtitles ? ` and ${subtitles.file}` : ''}`);
    return { output, file, url: renderUrl(file), ...facts, warnings, ...extras };
  } finally {
    active.delete(basename(workDir));
    rmSync(workDir, { recursive: true, force: true });
  }
}
