/**
 * What each scene of a motion piece is: an ordinary scene, or — when the
 * piece follows the brand — the opening, a section card or the closing,
 * which the kit's own `intro`, `chapter` and `outro` elements draw instead
 * of ad-hoc text. A plan may say so scene by scene; what it leaves open is
 * decided here by the scene's place in the piece. Pure.
 * Reference: docs/app-spec/DIRECTOR-BRAND.md § Motion piece.
 * @module api/director/motion/kinds
 */

import { SCENE_KINDS } from '#utils/director/motion/planSchema.js';

/** The kinds a brand element draws. */
export const CARD_KINDS = SCENE_KINDS.filter((kind) => kind !== 'scene');

/** Words a plan may use for a kind. */
const WORDS = {
  ...{ opening: 'intro', opener: 'intro', bumper: 'intro', start: 'intro' },
  ...{ section: 'chapter', part: 'chapter', card: 'chapter' },
  ...{ closing: 'outro', end: 'outro', ending: 'outro', 'end card': 'outro', credits: 'outro' },
  ...{ title: 'scene', text: 'scene', slide: 'scene' },
};

/**
 * @param {unknown} name
 * @returns {string|null} A scene kind, or null for a word that names none
 */
export function kindOf(name) {
  const word = String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, ' ');
  if (SCENE_KINDS.includes(word)) return word;
  return Object.hasOwn(WORDS, word) ? WORDS[word] : null;
}

/**
 * The kind of every scene of a plan.
 * @param {{ kind?: string }[]} scenes
 * @param {{ branded: boolean, bumpers?: boolean }} piece - `branded`: the
 *   piece follows the brand kit; `bumpers`: open with the kit's intro and
 *   close with its outro where the plan does not say
 * @param {string[]} notes - Added to
 * @returns {{ kind: string, number: string }[]} `number`: a chapter's place
 *   among the chapters, two digits
 */
export function sceneKinds(scenes, { branded, bumpers = true }, notes) {
  const asked = scenes.map((scene, i) => {
    if (scene.kind === undefined || scene.kind === null || scene.kind === '') return '';
    const kind = kindOf(scene.kind);
    if (!kind) notes.push(`Scene ${i + 1}: unknown kind “${scene.kind}” — an ordinary scene.`);
    return kind || 'scene';
  });
  if (!branded) {
    if (asked.some((kind) => CARD_KINDS.includes(kind))) {
      notes.push(
        'Opening, chapter and closing cards are drawn by the brand kit — choose the Brand ' +
          'theme to get them. Here they are ordinary scenes.',
      );
    }
    return scenes.map(() => ({ kind: 'scene', number: '' }));
  }
  const kinds = [...asked];
  const last = kinds.length - 1;
  if (bumpers && last >= 1 && !kinds[0] && !kinds.includes('intro')) kinds[0] = 'intro';
  if (bumpers && last >= 2 && !kinds[last] && !kinds.includes('outro')) kinds[last] = 'outro';
  let chapter = 0;
  return kinds.map((kind) => ({
    kind: kind || 'scene',
    number: kind === 'chapter' ? String(++chapter).padStart(2, '0') : '',
  }));
}
