/**
 * The render job: probe sources → build the plan → run FFmpeg → move the
 * finished file into the renders directory with its record. Everything
 * temporary (graph script, title text, the partial output) lives in one
 * work directory that is removed on success, failure and cancellation.
 * @module api/render/job
 */

import { mkdtempSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { getCapabilities } from './capabilities.js';
import { RenderError } from './errors.js';
import { encodeTimeline } from './passes.js';
import { probeSources } from './probe.js';
import { renderSources } from './scope.js';
import { rendersDir, renderUrl, sanitizeFilename, uniqueName, writeRecord } from './store.js';

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
 * Default output name: the adaptation name and a timestamp.
 * @param {string} name
 * @returns {string}
 */
function defaultName(name) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
  return sanitizeFilename(`${name || 'render'}-${stamp}`);
}

/**
 * Worker of a `render` job.
 * @param {import('./request.js').RenderRequest} request
 * @param {import('../lib/jobs.js').JobContext} ctx
 * @returns {Promise<{ output: string, file: string, url: string, duration: number,
 *   size: number, width: number, height: number, fps: number }>}
 */
export async function runRender(request, ctx) {
  const dir = rendersDir();
  sweepStaleWork(dir);
  const workDir = mkdtempSync(join(dir, WORK_PREFIX));
  active.add(basename(workDir));
  try {
    const sources = renderSources(request.edl);
    ctx.log(`Probing ${sources.length} source file(s)`);
    const [probes, capabilities] = await Promise.all([
      probeSources(sources, { signal: ctx.signal }),
      getCapabilities(),
    ]);
    if (!capabilities.libx264)
      throw new RenderError(503, 'This FFmpeg build has no libx264 encoder');
    const partial = join(workDir, 'output.mp4');
    const plan = await encodeTimeline(
      request.edl,
      {
        ...{ probes, capabilities, workDir, outputPath: partial },
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
    writeRecord(file, {
      ...{ projectId: request.projectId, adaptationId: request.adaptationId },
      ...{ preset: request.preset, range: request.range, ...facts, createdAt: Date.now() },
    });
    ctx.log(`Finished ${file}`);
    return { output, file, url: renderUrl(file), ...facts };
  } finally {
    active.delete(basename(workDir));
    rmSync(workDir, { recursive: true, force: true });
  }
}
