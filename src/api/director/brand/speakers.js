/**
 * Putting the speakers of a brand request on the timeline: each named
 * person gets the moment they first speak. Without a language model the
 * people are matched to the files that speak **in order** — the first
 * person named to the first file that speaks, and so on — and the result
 * says so. With one, the model reads the transcripts and says whose file
 * is whose (and, where the words show it, in which segment they begin);
 * what it cannot say falls back to the order.
 * Reference: docs/app-spec/DIRECTOR-BRAND.md § Who speaks where.
 * @module api/director/brand/speakers
 */

import Ajv from 'ajv';
import { jsonrepair } from 'jsonrepair';
import { buildDigest } from '../context/digest.js';
import { jsonCandidates } from '../llm/clean.js';
import { findMedia } from '../plan/resolve.js';
import { SPEAKERS_SCHEMA, speakersPrompt } from '../prompts/brandPass.js';
import { segmentTime } from './speech.js';

/** @typedef {import('./speech.js').Speaking} Speaking */
/** @typedef {{ name: string, role: string, at: number|null }} Asked */
/** @typedef {{ name: string, role: string, time: number|null, until: number|null, why: string }} Timed */

const validate = new Ajv({ allErrors: true }).compile(SPEAKERS_SCHEMA);
const same = (/** @type {string} */ a, /** @type {string} */ b) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The answer of the model, when it can be read as one.
 * @param {string} reply
 * @returns {{ name: string, role?: string, file: string, segment?: number }[]|null}
 */
export function parseSpeakers(reply) {
  for (const snippet of jsonCandidates(reply)) {
    for (const read of [JSON.parse, (/** @type {string} */ text) => JSON.parse(jsonrepair(text))]) {
      try {
        const value = read(snippet);
        const plan = Array.isArray(value) ? { speakers: value } : value;
        if (validate(plan)) return /** @type {any} */ (plan).speakers;
      } catch {
        continue; // malformed JSON is expected from a language model: try the repair, then the next snippet
      }
    }
  }
  return null;
}

/**
 * Ask the model whose file is whose.
 * @param {import('../pipeline.js').ActionContext} ctx
 * @param {Asked[]} speakers
 * @param {Speaking[]} speaking
 * @returns {Promise<{ name: string, role?: string, file: string, segment?: number }[]>}
 */
async function ask(ctx, speakers, speaking) {
  const { llm } = ctx;
  ctx.progress(20, `Asking ${llm.model} who speaks where…`);
  const media = ctx.media.filter((m) => speaking.some((file) => file.media === m));
  const digest = buildDigest(media.length ? media : speaking.map((file) => file.media));
  const prompt = speakersPrompt({ digest: digest.text, speakers });
  const reply = await llm.chat({
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ],
    json: true,
    signal: ctx.signal,
    maxTokens: 1024,
  });
  const found = parseSpeakers(reply.text);
  if (!found) throw new Error('its answer was not the JSON asked for');
  return found;
}

/**
 * The speakers of a request, each with the time of their lower third.
 * @param {import('../pipeline.js').ActionContext} ctx
 * @param {Asked[]} asked
 * @param {Speaking[]} speaking - The files that speak, in order
 * @param {string[]} notes - Added to
 * @returns {Promise<Timed[]>}
 */
export async function timeSpeakers(ctx, asked, speaking, notes) {
  let told = [];
  if (ctx.directive.params.useLlm && speaking.length) {
    try {
      told = await ask(ctx, asked, speaking);
      notes.push(`Who speaks where was read from the transcripts by the LLM (${ctx.llm.model}).`);
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      notes.push(
        `The LLM could not say who speaks where (${err.message}) — the speakers were matched ` +
          'to the speaking files in order instead.',
      );
    }
  }
  const people = asked.length ? asked : told.map((s) => ({ name: s.name, role: '', at: null }));
  const fileOf = (/** @type {string} */ ref) => {
    const media = findMedia(ref, ctx.media);
    return speaking.find((file) => file.media === media) || null;
  };
  let turn = 0;
  let assumed = 0;
  const timed = people.map((person) => {
    const said = told.find((s) => same(s.name, person.name));
    const role = person.role || said?.role || '';
    if (person.at !== null) {
      return {
        name: person.name,
        role,
        time: person.at,
        until: null,
        why: 'at the time asked for',
      };
    }
    const named = said ? fileOf(said.file) : null;
    const file = named || speaking[turn++] || null;
    if (!file) return { name: person.name, role, time: null, until: null, why: '' };
    const where = (named && said.segment && segmentTime(file, said.segment)) || file;
    if (!named) assumed++;
    const why = named
      ? `where ${file.media.filename} first speaks${where === file ? '' : ` segment ${said.segment}`}`
      : `over ${file.media.filename}, the ${ordinal(turn)} file that speaks`;
    return { name: person.name, role, time: where.time, until: where.until, why };
  });
  if (assumed) {
    notes.push(
      `Assumed: ${assumed === 1 ? 'the speaker was' : `${assumed} speakers were`} matched to the ` +
        'files that speak in the order they were named — the first name to the first file ' +
        'that speaks, and so on. Give a time (“Ada Lovelace at 0:12”) to say otherwise.',
    );
  }
  const silent = timed.filter((speaker) => speaker.time === null).map((speaker) => speaker.name);
  if (silent.length) {
    notes.push(
      speaking.length
        ? `No lower third for ${silent.join(', ')}: more people were named than files speak.`
        : `No lower third for ${silent.join(', ')}: no clip on the timeline speaks.`,
    );
  }
  return timed;
}

/** @param {number} n @returns {string} first, second, third, 4th… */
const ordinal = (n) => ['first', 'second', 'third'][n - 1] || `${n}th`;
