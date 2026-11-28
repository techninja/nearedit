/**
 * Found pictures and their credits, as data: the item a provider finds,
 * the source written beside its file, the credit a clip carries, what the
 * licences ask for, and the credits of a timeline as a list and as text.
 * Isomorphic and pure — the editor and the server read the same module.
 * Contract: docs/app-spec/STOCK.md.
 * @module utils/stock
 */

export {
  CREDIT_FIELDS,
  CREDIT_LIMITS,
  checkCredit,
  cleanCredit,
  cleanText,
  cleanUrl,
  creditFromSource,
  creditKey,
} from './credit.js';
export { credits, creditsStatement } from './credits.js';
export { CREDIT_FORMATS, creditHost, creditLine, creditsText } from './creditsText.js';
export { cleanSource, normalizeItem, sourceOfItem, stockName } from './item.js';
export {
  ccKindsOffered,
  ccLicenseId,
  licenseFacts,
  licenseFromUrl,
  mayOffer,
  readOffer,
} from './licenses.js';
