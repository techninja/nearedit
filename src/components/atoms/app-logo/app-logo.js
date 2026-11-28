/**
 * Logo atom — NearEdit's logo as inline SVG: the `wordmark` (its letters
 * take the colour of the text around it, so it follows every theme), the
 * `icon` (the NE monogram on its navy tile) or the `mark` (the E alone).
 * With `animated` it builds itself once when it appears — the playhead
 * arrives, the clips slide out of it, the letters settle — and stands
 * still for people who prefer reduced motion (see `app-logo.css`).
 * @module components/atoms/app-logo
 */

import { html, define } from 'hybrids';
import { logoMarkup } from './markup.js';

/**
 * @typedef {Object} AppLogoHost
 * @property {'wordmark'|'icon'|'mark'} variant
 * @property {'sm'|'md'|'lg'|'xl'} size - Height: 1.25, 1.75, 3 or 5 rem
 * @property {boolean} animated - Build itself once on arrival
 */

/** @type {import('hybrids').Component<AppLogoHost>} */
export default define({
  tag: 'app-logo',
  variant: 'wordmark',
  size: 'md',
  animated: false,
  render: {
    value: ({ variant, size, animated }) => html`
      <span
        class="${{ 'app-logo': true, [`app-logo-${size}`]: true, 'app-logo-animated': animated }}"
        innerHTML="${logoMarkup(variant)}"
      ></span>
    `,
    shadow: false,
  },
});
