/**
 * JSON in localStorage that never throws: storage can be missing (Node
 * tests), blocked (private browsing) or hold something unreadable.
 * @module utils/ui/storage
 */

/** @returns {Storage|null} */
function storage() {
  try {
    return globalThis.localStorage || null;
  } catch (err) {
    console.warn('[storage] not available:', err.message);
    return null;
  }
}

/**
 * Read a stored object.
 * @param {string} key
 * @returns {Record<string, any>} `{}` when nothing usable is stored
 */
export function readStored(key) {
  try {
    const raw = storage()?.getItem(key);
    const value = raw ? JSON.parse(raw) : null;
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch (err) {
    console.warn(`[storage] could not read ${key}:`, err.message);
    return {};
  }
}

/**
 * Store an object. Failure (quota, blocked storage) is logged, not thrown:
 * preferences that cannot be saved must not break the editor.
 * @param {string} key
 * @param {Record<string, any>} value
 */
export function writeStored(key, value) {
  try {
    storage()?.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`[storage] could not save ${key}:`, err.message);
  }
}
