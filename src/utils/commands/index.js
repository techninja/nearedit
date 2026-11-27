/**
 * Editor commands — every editing action as a plain function acting on the
 * edit session, the view state and the transport, plus the registry that
 * describes them (id, label, default shortcut, availability). The toolbar,
 * context menus, keyboard handler and shortcuts list are generated from the
 * registry; panels call the functions directly.
 * @module utils/commands
 */

export { canRedo, canUndo, redo, undo } from '#utils/editor/session.js';

export { editModes, editTime } from './context.js';
export {
  canSplit,
  deleteSelection,
  nudgeSelection,
  rippleDeleteSelection,
  splitAtCursor,
  trimEndToCursor,
  trimStartToCursor,
} from './edit.js';
export {
  CLIPBOARD_KEY,
  copySelection,
  cutSelection,
  duplicateSelection,
  getClipboard,
  hasClipboard,
  onClipboardChange,
  paste,
} from './clipboard.js';
export {
  groupSelection,
  linkSelection,
  selectAllClips,
  selectNone,
  ungroupSelection,
  unlinkSelection,
} from './select.js';
export {
  addAudioTrack,
  addMarkerAtCursor,
  addTitleAtCursor,
  addTrackOfType,
  addVideoTrack,
  deleteMarker,
  insertMediaItem,
  removeTrackById,
} from './insert.js';
export {
  forward,
  goToEnd,
  goToNextEdit,
  goToNextMarker,
  goToPreviousEdit,
  goToPreviousMarker,
  goToStart,
  playPause,
  playPauseInPlace,
  rewind,
  stepFrames,
  stop,
  toggleLoop,
} from './navigate.js';
export {
  onUiRequest,
  showShortcuts,
  toggleAutoCrossfade,
  toggleRipple,
  toggleSnapping,
  zoomIn,
  zoomOut,
  zoomToFit,
} from './viewCommands.js';
export {
  COMMANDS,
  commandGroups,
  getCommand,
  isEnabled,
  isPressed,
  runCommand,
} from './registry.js';
