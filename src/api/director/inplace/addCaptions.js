/**
 * `add_captions` — captions for the speech on the timeline, two ways
 * (`params.as`). `words` (the default) switches captions on for the clips that speak:
 * words on screen as they are said, drawn by the compositor from each
 * clip's transcript in the timeline's one style, and in step with the
 * speech whatever is cut later (docs/app-spec/CAPTIONS.md). `phrases`
 * makes a title clip per phrase, as before.
 * Reference: docs/app-spec/DIRECTOR.md § Working on the existing timeline.
 * @module api/director/inplace/addCaptions
 */

import { captionPhrases } from './addCaptionsPhrases.js';
import { captionWords } from './addCaptionsWords.js';

/**
 * @param {import('../pipeline.js').ActionContext} ctx
 * @returns {Promise<import('../result.js').DirectorResult>}
 */
export async function addCaptions(ctx) {
  return ctx.directive.params.as === 'phrases' ? captionPhrases(ctx) : captionWords(ctx);
}

export { captionPhrases, captionTrack } from './addCaptionsPhrases.js';
export { captionWords } from './addCaptionsWords.js';
