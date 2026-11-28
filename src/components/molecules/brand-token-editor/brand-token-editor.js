/**
 * Token editor — a brand kit's tokens as a form generated from
 * `TOKEN_SCHEMA`: colours (with a plain remark when text would be hard to
 * read on its ground), the two fonts (a bundled family or a font file of
 * your own), the logo, shape, spacing, motion and sound. It shows every
 * token as it is in force and marks the ones the customisation sets, each
 * with a button to let it follow its kit again. Reports changes as
 * bubbling `field-change` events (`{ name: <token path>, value, phase }`),
 * `token-reset` (`{ path }`) and `token-file` (`{ path, file }`).
 * @module components/molecules/brand-token-editor
 */

import { define, html } from 'hybrids';
import { fontBlock } from '#utils/brandUi/tokenEditorFont.js';
import { logoRow } from '#utils/brandUi/tokenEditorLogo.js';
import { tokenRow } from '#utils/brandUi/tokenEditorRows.js';
import { tokenGroups } from '#utils/brandUi/tokenFields.js';
import '#atoms/app-icon/app-icon.js';
import '#atoms/field-color/field-color.js';
import '#atoms/field-number/field-number.js';

/** @typedef {import('#utils/brandUi/tokenEditorEvents.js').TokenEditorHost} TokenEditorHost */

const GROUPS = tokenGroups();
/** A line under a group's heading, where what a token does needs saying. */
const HINTS = {
  logo: 'The corner bug, the intro, the outro and the stinger show the mark. The logo you upload is the mark too, until you give a mark of its own; with no picture at all a mark is drawn from the colours.',
  space: 'Lengths are in units: hundredths of the frame’s shorter side.',
  sound: 'What the director reaches for when it writes music for this brand.',
  caption:
    'How word-by-word captions look in this brand: a caption style, and what the brand changes in it.',
};

/**
 * @param {TokenEditorHost} host
 * @param {import('#utils/brandUi/tokenFields.js').TokenField} field
 */
function fieldOf(host, field) {
  if (field.spec.type === 'font') return fontBlock(host, field);
  return field.spec.type === 'image' ? logoRow(host, field) : tokenRow(host, field);
}

/** @type {import('hybrids').Component<TokenEditorHost>} */
export default define({
  tag: 'brand-token-editor',
  tokens: { value: /** @type {any} */ ({}) },
  changed: { value: /** @type {any} */ ({}) },
  fonts: { value: [] },
  notes: { value: /** @type {any} */ ({}) },
  problem: '',
  render: {
    value: (host) => html`
      ${host.problem ? html`<p class="error-message" role="alert">${host.problem}</p>` : html``}
      ${GROUPS.map(
        ({ group, label, fields }) => html`
          <section class="brand-token-group" data-group="${group}" aria-label="${label}">
            <h3 class="field-group-title">${label}</h3>
            ${HINTS[group] ? html`<p class="brand-token-hint">${HINTS[group]}</p>` : html``}
            ${fields.map((field) => fieldOf(host, field))}
          </section>
        `,
      )}
    `,
    shadow: false,
  },
});
