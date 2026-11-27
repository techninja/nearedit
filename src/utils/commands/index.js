/**
 * Editor commands — every editing action as a plain function acting on the
 * edit session, the view state and the transport, plus the registry that
 * describes them (id, label, default shortcut, availability). The toolbar,
 * context menus, keyboard handler and shortcuts list are generated from the
 * registry; panels call the functions directly.
 * @module utils/commands
 */

export { canRedo, canUndo, redo, undo } from '#utils/editor/session.js';

export { editModes, editRippling, editTime, pixelSeconds } from './context.js';
export {
  canSplit,
  deleteSelection,
  nudgeBy,
  nudgeSelection,
  rippleDeleteSelection,
  splitAtCursor,
  trimEndToCursor,
  trimStartToCursor,
  trimToSelection,
} from './edit.js';
export { leaveEdgeTrim, moveSelectionToTrack, selectEdge, trimEdgeBy } from './eventKeys.js';
export { addNamedMarker, addRegionFromSelection, deleteRegion, selectRegion } from './marks.js';
export { pasteInsertAtCursor, pasteRepeatAtCursor } from './pasteSpecial.js';
export {
  canPostRipple,
  onPendingRipple,
  pendingRipple,
  postEditRipple,
  rippled,
} from './postRipple.js';
export { onShuttle, shuttle, shuttlePause, shuttleRate, stopShuttle } from './shuttleRun.js';
export {
  clearTimeSelection,
  extendByPixel,
  extendToEdit,
  getTimeSelection,
  markIn,
  markOut,
  recallSelection,
  selectBetweenMarkers,
  selectClipSpan,
  setTimeSelection,
} from './timeSelection.js';
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
  removeFromGroup,
  selectAllClips,
  selectNone,
  selectWholeGroups,
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
  goToMarker,
  goToNextEdit,
  goToNextMarker,
  goToPreviousEdit,
  goToPreviousMarker,
  goToSelectionEdge,
  goToStart,
  playFromStart,
  playPause,
  playPauseInPlace,
  rewind,
  stepFrames,
  stepGrid,
  stepPixel,
  stop,
  toggleLoop,
} from './navigate.js';
export {
  centerOnCursor,
  onUiRequest,
  setRippleScope,
  showShortcuts,
  toggleAutoCrossfade,
  toggleRipple,
  toggleSnapMarkers,
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
