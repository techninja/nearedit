/**
 * The stage: the controller behind the timeline canvas. It sizes the canvas
 * (device-pixel-ratio aware), redraws it with `requestAnimationFrame` only
 * when something changed — the document, the view, the theme, the size, a
 * thumbnail, waveform or rendering arriving, a playback frame — and keeps the playhead
 * on screen during playback. Pointer handling lives in `interaction/`.
 * @module utils/timeline/stage
 */

import { store } from 'hybrids';
import UserPrefs from '#store/UserPrefs.js';
import ViewState from '#store/ViewState.js';
import { onPendingRipple, pendingRipple } from '#utils/commands/postRipple.js';
import { getDoc, onDocChange } from '#utils/editor/session.js';
import { getView } from '#utils/editor/view.js';
import { onLibraryChange, sourceDurations } from '#utils/media/library.js';
import { getPosition, isPlaying, onFrame } from '#utils/playback/transport.js';
import { onArrival } from './arrivals.js';
import { drawScene, emptyOverlay } from './draw/scene.js';
import { getEdgeTrim, onEdgeTrim } from './edgeTrim.js';
import { laneHeightFor } from './laneSize.js';
import { layoutLanes } from './layout.js';
import { setStageSize } from './metrics.js';
import { readPalette, watchTheme } from './palette.js';
import { currentViewport, revealTime } from './scroll.js';
import { countFrame, fitCanvas, noFrames } from './surface.js';

/**
 * What the stage asks of the component that hosts it.
 * @typedef {Object} StageUi
 * @property {(x: number, y: number, hit: import('./hitTest.js').Hit) => void} openMenu -
 *   Context menu at a client position
 * @property {(markerId: string) => void} renameMarker - Start inline rename
 * @property {(regionId: string) => void} renameRegion - The same for a region
 */

/**
 * @typedef {Object} Stage
 * @property {HTMLCanvasElement} canvas
 * @property {StageUi} ui
 * @property {boolean} coarse - The primary pointer is a finger
 * @property {number} laneHeight - Follows the track-height preference
 * @property {import('./draw/scene.js').Overlay} overlay
 * @property {any} press - The pointer press in progress (interaction/pointer.js)
 * @property {{ clientX: number, clientY: number }|null} hover - Where the pointer rests
 * @property {import('./surface.js').FrameStats} stats - Draw cost, ms
 * @property {() => void} invalidate - Ask for a redraw on the next frame
 * @property {(coarse?: boolean) => import('./hitTest.js').Geometry} geometry
 * @property {() => void} destroy
 */

/**
 * Bind a canvas.
 * @param {HTMLCanvasElement} canvas - Sized by CSS; the stage sets its backing store
 * @param {StageUi} ui
 * @returns {Stage}
 */
export function createStage(canvas, ui) {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  /** @type {import('./palette.js').Palette|null} */
  let palette = null;
  let frame = 0;
  /** What the last frame showed, to tell a moving playhead from a moving view. */
  let seen = {
    playhead: getView().playheadPosition,
    scrollX: getView().scrollX,
    zoom: getView().zoom,
  };

  /** @type {Stage} */
  const stage = {
    canvas,
    ui,
    coarse,
    get laneHeight() {
      return laneHeightFor(store.get(UserPrefs), coarse);
    },
    overlay: emptyOverlay(),
    press: null,
    hover: null,
    stats: noFrames(),
    invalidate() {
      if (!frame) frame = requestAnimationFrame(draw);
    },
    geometry(touch = coarse) {
      const doc = getDoc();
      const lanes = layoutLanes(doc.tracks, stage.laneHeight);
      return { vp: currentViewport(), lanes, doc, coarse: touch };
    },
    destroy() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      for (const stop of stops) stop();
    },
  };

  /** Draw one frame and record what it cost. */
  function draw() {
    frame = 0;
    const started = performance.now();
    const { clientWidth: width, clientHeight: height } = canvas;
    setStageSize({ width, height, laneHeight: stage.laneHeight });
    const ctx = fitCanvas(canvas);
    if (!ctx) return;
    palette = palette || readPalette(canvas);
    const view = getView();
    const playhead = isPlaying() ? getPosition() : view.playheadPosition;
    // A playhead that moved on its own (playback, a jump) is brought back
    // into view, a page at a time. Not while the pointer is at work, and not
    // when the view moved in the same step (scrolling, opening a project).
    const viewMoved = view.scrollX !== seen.scrollX || view.zoom !== seen.zoom;
    if (playhead !== seen.playhead && !viewMoved && !stage.press) revealTime(playhead);
    seen = { playhead, scrollX: view.scrollX, zoom: view.zoom };
    drawScene({
      ...stage.geometry(),
      ctx,
      view,
      palette,
      selected: new Set(view.selection),
      playhead,
      overlay: stage.overlay,
      durations: sourceDurations(),
      coarse,
      edgeTrim: getEdgeTrim(),
      rippleSteps: pendingRipple(),
    });
    stage.stats = countFrame(stage.stats, performance.now() - started);
  }

  const observer = new ResizeObserver(stage.invalidate);
  observer.observe(canvas);
  const stops = [
    onDocChange(stage.invalidate),
    store.observe(ViewState, stage.invalidate),
    store.observe(UserPrefs, stage.invalidate),
    onEdgeTrim(stage.invalidate),
    onPendingRipple(stage.invalidate),
    onLibraryChange(stage.invalidate),
    onArrival(stage.invalidate),
    onFrame(stage.invalidate),
    watchTheme(() => {
      palette = null;
      stage.invalidate();
    }),
  ];
  stage.invalidate();
  return stage;
}
