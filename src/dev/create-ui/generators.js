/**
 * Temporary harness: the generator list with one more generator, served in
 * place of `/utils/compose/generators/index.js` by the Playwright test, to
 * prove the Create tab and the inspector are built from the catalog.
 * Deleted before the work is done.
 * @module dev/create-ui/generators
 */

// eslint-disable-next-line import/no-absolute-path
import real from '/utils/compose/generators/index.js?real=1';
// eslint-disable-next-line import/no-absolute-path
import rings from '/utils/compose/generators/rings.js';

export default [...real, rings];
