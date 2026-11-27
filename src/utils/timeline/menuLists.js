/**
 * What each context menu of the timeline offers, as lists of command ids
 * (`-` is a dividing line). The menus are built from the command registry
 * in `menuModel.js`.
 * @module utils/timeline/menuLists
 */

export const CLIP_MENU = [
  'edit.split',
  '-',
  ...['edit.cut', 'edit.copy', 'edit.paste', 'edit.duplicate', 'edit.pasteInsert'],
  '-',
  'edit.delete',
  'edit.rippleDelete',
  '-',
  ...['edit.trimStart', 'edit.trimEnd', 'edit.trimToSelection'],
  '-',
  ...['clip.group', 'clip.removeFromGroup', 'clip.ungroup', 'clip.link', 'clip.unlink'],
  '-',
  ...['clip.showEffects', 'clip.bypassEffects', 'edit.pasteAttributes'],
  ...['keyframe.add', 'keyframe.remove', 'keyframe.clear'],
  '-',
  ...['ripple.postTracks', 'ripple.postMarks', 'ripple.postAll'],
];

export const LANE_MENU = [
  ...['edit.paste', 'edit.pasteInsert', 'edit.pasteRepeat', 'edit.split', 'edit.trimToSelection'],
  '-',
  ...['ripple.postTracks', 'ripple.postMarks', 'ripple.postAll'],
  '-',
  ...['marker.add', 'region.add', 'title.add', 'generator.addLast'],
  '-',
  'select.all',
  'select.none',
  '-',
  'track.addVideo',
  'track.addAudio',
  '-',
  ...['ripple.scopeTracks', 'ripple.scopeMarks', 'ripple.scopeAll'],
  '-',
  'view.zoomFit',
];

export const RULER_MENU = [
  ...['marker.add', 'marker.addNamed', 'region.add'],
  '-',
  ...['transport.toggleLoop', 'select.markIn', 'select.markOut', 'select.recall', 'loop.clear'],
  '-',
  'go.toTime',
  '-',
  ...['view.zoomIn', 'view.zoomOut', 'view.zoomFit', 'view.centerCursor'],
];
