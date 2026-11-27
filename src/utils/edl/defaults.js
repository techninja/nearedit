/**
 * EDL default value blocks (transform, ken burns, title text).
 * Isomorphic: runs in the browser and in Node.
 * @module utils/edl/defaults
 */

export const EDL_VERSION = 2;

/** @returns {object} Identity ken-burns block (disabled). */
export function defaultKenBurns() {
  return {
    enabled: false,
    startX: 0,
    startY: 0,
    startScale: 1,
    endX: 0,
    endY: 0,
    endScale: 1,
    startCropTop: 0,
    startCropBottom: 0,
    startCropLeft: 0,
    startCropRight: 0,
    endCropTop: 0,
    endCropBottom: 0,
    endCropLeft: 0,
    endCropRight: 0,
  };
}

/** @returns {object} Identity transform. */
export function defaultTransform() {
  return {
    fit: 'cover',
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 1,
    cropTop: 0,
    cropBottom: 0,
    cropLeft: 0,
    cropRight: 0,
    anchorX: 0.5,
    anchorY: 0.5,
    kenBurns: defaultKenBurns(),
  };
}

/** @returns {object} Default title text block (empty content = not a title). */
export function defaultText() {
  return {
    content: '',
    fontFamily: 'sans-serif',
    fontSize: 72,
    color: '#ffffff',
    background: '',
    align: 'center',
    bold: true,
    italic: false,
    outlineColor: '#000000',
    outlineWidth: 0,
  };
}
