/**
 * `generate_script` and `execute_script` — the review-first workflow: the
 * LLM writes Markdown edit-script options, a person reads and edits one,
 * and the approved script is turned into an edit plan and assembled.
 * @module api/director/actions/scripts
 */

import { kitOf } from '../brand/kit.js';
import { buildDigest } from '../context/digest.js';
import { DirectorError } from '../errors.js';
import { scriptPlanPrompt } from '../prompts/editPlan.js';
import { cleanScript, scriptPrompt } from '../prompts/script.js';
import { fileStamp, loadScript, saveScript, scriptsDir } from '../scripts/files.js';
import { planAndAssemble } from './generateEdit.js';

/** @typedef {import('../pipeline.js').ActionContext} ActionContext */

/**
 * @typedef {Object} ScriptResult
 * @property {{ variant: number, filename: string, filePath: string, script: string }[]} scripts
 * @property {number} count
 * @property {string} folder - Where the scripts were saved
 * @property {string} summary
 * @property {string[]} notes
 */

/**
 * Write N script options and save them under the project's scripts/ folder.
 * @param {ActionContext} ctx
 * @returns {Promise<ScriptResult>}
 */
export async function generateScripts(ctx) {
  const { directive, media, llm, format } = ctx;
  if (!media.length)
    throw new DirectorError('This project has no media yet', {
      status: 422,
      detail: 'Add video, audio or image files to the project folder and analyse them.',
    });
  const digest = buildDigest(media, { focus: directive.prompt });
  const variants = Math.round(directive.params.variants);
  const folder = scriptsDir(ctx.projectDir, format.name);
  const stamp = fileStamp();
  const notes = [];
  if (digest.hidden)
    notes.push(
      `${digest.hidden} files did not fit in the prompt and were not offered to the model.`,
    );
  const scripts = [];
  for (let i = 0; i < variants; i++) {
    ctx.signal?.throwIfAborted();
    const from = 5 + (i / variants) * 90;
    ctx.progress(from, `Asking ${llm.model} for script option ${i + 1} of ${variants}…`);
    const prompt = scriptPrompt({ digest: digest.text, directive, format, variant: i });
    let lastReport = 0;
    const reply = await llm.chat({
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      temperature: 0.6,
      signal: ctx.signal,
      onToken: (_delta, info) => {
        if (Date.now() - lastReport < 750) return;
        lastReport = Date.now();
        const part = Math.min(0.95, info.chars / 4000);
        ctx.progress(
          from + (part * 90) / variants,
          `Option ${i + 1}: ${info.chars} characters written`,
        );
      },
    });
    const script = cleanScript(reply.text);
    if (script.trim().length < 40) {
      notes.push(`Option ${i + 1}: the model returned nothing usable.`);
      continue;
    }
    const saved = saveScript(folder, `${stamp}-option-${i + 1}`, script);
    scripts.push({ variant: i + 1, ...saved, script });
    ctx.log(`Saved ${saved.filename}`);
  }
  if (!scripts.length)
    throw new DirectorError('The LLM did not write a usable script', { status: 502 });
  const s = scripts.length === 1 ? '' : 's';
  return {
    scripts,
    count: scripts.length,
    folder,
    summary: `${scripts.length} script option${s} saved to ${folder}`,
    notes,
  };
}

/**
 * Build the timeline from an approved script.
 * @param {ActionContext} ctx
 * @returns {Promise<import('../result.js').DirectorResult>}
 */
export async function executeScript(ctx) {
  const script = loadScript(ctx.directive).slice(0, 24000);
  if (!ctx.media.length) throw new DirectorError('This project has no media yet', { status: 422 });
  // The script cites segment numbers, so a smaller digest is enough context.
  const digest = buildDigest(ctx.media, { focus: script.slice(0, 3000), budget: 14000 });
  const kit = kitOf(ctx);
  const prompt = scriptPlanPrompt({ digest: digest.text, script, format: ctx.format, kit });
  const result = await planAndAssemble(ctx, prompt, []);
  result.summary = `From script: ${result.summary}`;
  return result;
}
