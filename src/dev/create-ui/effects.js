/**
 * Temporary harness: the effect list with one more effect, served in place
 * of `/utils/compose/effects/index.js` by the Playwright test. Deleted
 * before the work is done.
 * @module dev/create-ui/effects
 */

// eslint-disable-next-line import/no-absolute-path
import real from '/utils/compose/effects/index.js?real=1';

const negative = {
  type: 'negative',
  label: 'Negative',
  category: 'holograms',
  description: 'Inverts the colours (harness)',
  params: {
    amount: { type: 'number', default: 1, min: 0, max: 1, animatable: true },
    hue: { type: 'boolean', default: false, label: 'Also turn the hue' },
  },
  filter: (p) => `invert(${p.amount})${p.hue ? ' hue-rotate(180deg)' : ''}`,
};

export default [...real, negative];
