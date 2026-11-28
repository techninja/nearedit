/**
 * The look of word captions, from a request. A look is one of the caption
 * presets (docs/app-spec/CAPTIONS.md § Style) and nothing else: the form
 * names one, or the person's own words do — "big bold captions",
 * "karaoke", "subtitles" — read by rule, the same way every time. Only when
 * the words name none, and the person asked for it, is the language model
 * consulted; it too may only answer with a preset's name.
 * @module api/director/inplace/captionsLook
 */

import { CAPTION_PRESETS } from '#utils/captions/presets.js';
import { PRESET_NAMES } from '#utils/captions/style.js';

/** Words that point at a preset. Whole words, any case. */
const HINTS = {
  pop: /\b(pop|big|bigger|bold|large|huge|loud|punchy|chunky|capitals?|caps|upper-?case|tiktok|reels?|shorts|viral|social|energetic|hype)\b/gi,
  karaoke:
    /\b(karaoke|sing-?along|lyrics?|whole (?:line|phrase|sentence)s?|line by line|fill(?:s|ing)? in)\b/gi,
  boxed: /\b(box|boxed|boxes|plate|pill|label|badge|card|banner|background|backdrop)\b/gi,
  minimal:
    /\b(minimal|subtle|quiet|small|smaller|light|thin|discreet|understated|subtitles?|documentary|film|cinematic|classic)\b/gi,
  clean: /\b(clean|simple|plain|standard|default|neutral|normal|white|readable)\b/gi,
};

/**
 * The preset a description names, by rule: its own name wins, then the
 * preset most of the description's words point at (the earlier one in the
 * text when two tie).
 * @param {string} text
 * @returns {string} A preset's name; '' when the words point at none
 */
export function presetFromText(text) {
  const words = String(text || '');
  let best = { name: '', count: 0, at: Infinity };
  for (const name of PRESET_NAMES) {
    const own = new RegExp(`\\b${name}\\b`, 'i').exec(words);
    const hits = [...words.matchAll(HINTS[name])];
    // Its own name is worth more than any number of hints.
    const count = hits.length + (own ? 100 : 0);
    const at = Math.min(own?.index ?? Infinity, hits[0]?.index ?? Infinity);
    if (count > best.count || (count === best.count && count > 0 && at < best.at)) {
      best = { name, count, at };
    }
  }
  return best.name;
}

/**
 * The preset named in a model's reply: the first preset's name it contains.
 * @param {string} reply
 * @returns {string} '' when it names none
 */
export function presetFromReply(reply) {
  const found = /"preset"\s*:\s*"([a-z]+)"/i.exec(String(reply || ''));
  const named = (found?.[1] || String(reply || '').trim()).toLowerCase();
  return PRESET_NAMES.find((name) => name === named) || '';
}

/**
 * Ask the language model which preset fits a description.
 * @param {import('../pipeline.js').ActionContext} ctx
 * @returns {Promise<string>} A preset's name
 * @throws {Error} When the model cannot be reached or names no preset
 */
async function askLlm(ctx) {
  const list = PRESET_NAMES.map((name) => `- ${name}: ${CAPTION_PRESETS[name].description}`);
  const tall = ctx.format.height > ctx.format.width;
  const system = [
    'You choose the look of word-by-word captions for a video. The looks are:',
    ...list,
    'Reply with ONE JSON object and nothing else: {"preset": "<one of the names above>"}.',
  ].join('\n');
  const user = `The video is ${tall ? 'vertical' : 'horizontal'}. The captions should be: ${ctx.directive.prompt}`;
  const { text } = await ctx.llm.chat({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    json: true,
    signal: ctx.signal,
    maxTokens: 64,
  });
  const preset = presetFromReply(text);
  if (!preset) throw new Error('its reply named none of the looks');
  return preset;
}

/**
 * The look a request asks for.
 * @param {import('../pipeline.js').ActionContext} ctx
 * @param {string[]} notes - Added to when the model was asked
 * @returns {Promise<{ preset: string, by: 'form'|'words'|'llm'|'' }>} `preset`
 *   '' = none was asked for (or the model could not say): the timeline keeps
 *   the style it has, or follows the brand kit (`captionsStyle.js`)
 */
export async function chooseLook(ctx, notes) {
  const { params, prompt } = ctx.directive;
  if (PRESET_NAMES.includes(params.preset)) return { preset: params.preset, by: 'form' };
  const named = presetFromText(prompt);
  if (named) return { preset: named, by: 'words' };
  if (!params.useLlm || !prompt) return { preset: '', by: '' };
  try {
    ctx.progress(30, `Asking ${ctx.llm.model} which look fits…`);
    const preset = await askLlm(ctx);
    notes.push(
      `The look (${CAPTION_PRESETS[preset].label}) was chosen by the LLM (${ctx.llm.model}).`,
    );
    return { preset, by: 'llm' };
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    // What the captions then look like is said with the style that is used instead.
    notes.push(`The LLM could not choose a look (${err.message}).`);
    return { preset: '', by: '' };
  }
}
