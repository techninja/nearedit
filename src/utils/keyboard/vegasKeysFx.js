/**
 * The Vegas preset, part 3 — keyframes, effects, generators and web clips. Vegas has
 * no keys of its own for these on the timeline, so they take the same
 * keys as in the NearEdit preset, all free in the Vegas layout.
 * @module utils/keyboard/vegasKeysFx
 */

/** @type {Record<string, string[]>} Command id → shortcuts */
export const VEGAS_FX_KEYS = {
  'go.previousKeyframe': [';'],
  'go.nextKeyframe': ["'"],
  'keyframe.add': ['Shift+K'],
  'keyframe.remove': ['Alt+K'],
  'clip.showEffects': ['Alt+E'],
  'clip.bypassEffects': ['Shift+E'],
  'edit.pasteAttributes': ['Mod+Alt+V'],
  'generator.addLast': ['Alt+G'],
  'web.editSteps': ['Alt+W'],
  'web.record': ['Alt+R'],
};
