/**
 * Copying text. The async clipboard API only exists on secure origins
 * (https or localhost); NearEdit is often opened over plain http from
 * another device on the network, so there is a fallback that works there.
 * @module utils/transcript/clipboard
 */

/**
 * Put text on the clipboard. Call from a user gesture (a click or key).
 * @param {string} text
 * @returns {Promise<void>} Rejects when the browser refuses
 */
export async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
  document.body.append(area);
  area.select();
  const copied = document.execCommand('copy');
  area.remove();
  if (!copied) throw new Error('the browser did not allow it');
}
