/**
 * Temporary dev harness for the playback engine — exposes the stores,
 * the transport and engine internals on `window.harness` for Playwright.
 * @module dev/playback-harness
 */

import { store } from 'hybrids';
import TimelineState from '#store/TimelineState.js';
import ViewState from '#store/ViewState.js';
import { createClip, createTrack } from '#utils/edl/factory.js';
import * as audioGraph from '#utils/playback/audioGraph.js';
import * as transport from '#utils/playback/transport.js';
import { clock, mixer } from '#utils/playback/transportEngine.js';
import { previewSurface } from '#organisms/video-preview/video-preview.js';
import '#atoms/transport-controls/transport-controls.js';

const preview = () => document.querySelector('video-preview');
const canvas = () => /** @type {HTMLCanvasElement} */ (document.querySelector('video-preview canvas'));

/** @type {AnalyserNode|null} */
let spectrum = null;

window.harness = {
  store,
  TimelineState,
  ViewState,
  transport,
  audioGraph,
  createClip,
  createTrack,
  view: () => ({ ...store.get(ViewState) }),
  setDoc: (doc) => store.set(TimelineState, doc),
  setView: (values) => store.set(ViewState, values),
  surface: () => previewSurface(preview()),
  clockSource: () => clock.source(),
  /** Pixel at a fractional position of the canvas. */
  pixel(fx, fy) {
    const c = canvas();
    const x = Math.min(c.width - 1, Math.floor(fx * c.width));
    const y = Math.min(c.height - 1, Math.floor(fy * c.height));
    return Array.from(c.getContext('2d').getImageData(x, y, 1, 1).data.slice(0, 3));
  },
  canvasSize: () => ({ width: canvas().width, height: canvas().height, css: canvas().style.cssText }),
  compositor: () => {
    const stats = previewSurface(preview()).compositor.stats();
    return {
      paints: stats.paints,
      images: stats.images,
      slots: stats.slots.map((s) => ({
        clipId: s.clipId,
        url: decodeURIComponent(s.url).split('/').pop(),
        paused: s.el.paused,
        time: s.el.currentTime,
        rate: s.el.playbackRate,
        ready: s.el.readyState,
        stale: s.stale,
        seeking: s.el.seeking,
      })),
    };
  },
  voices: () =>
    mixer.voices().map((v) => ({
      clipId: v.clipId,
      url: decodeURIComponent(v.url).split('/').pop(),
      route: v.url.split('?')[0],
      paused: v.el.paused,
      time: v.el.currentTime,
      rate: v.el.playbackRate,
      gain: v.gain.gain.value,
      ready: v.el.readyState,
    })),
  audio: () => {
    const graph = audioGraph.getAudioGraph();
    return { state: graph?.ctx.state, time: graph?.ctx.currentTime, level: audioGraph.readMasterLevel() };
  },
  /** Magnitude (dB) of the master output near each frequency. */
  tones(frequencies) {
    const graph = audioGraph.getAudioGraph();
    if (!spectrum) {
      spectrum = graph.ctx.createAnalyser();
      spectrum.fftSize = 8192;
      spectrum.smoothingTimeConstant = 0;
      graph.master.connect(spectrum);
    }
    const bins = new Float32Array(spectrum.frequencyBinCount);
    spectrum.getFloatFrequencyData(bins);
    const hzPerBin = graph.ctx.sampleRate / spectrum.fftSize;
    return frequencies.map((f) => {
      const i = Math.round(f / hzPerBin);
      return Math.round(Math.max(bins[i - 1], bins[i], bins[i + 1]));
    });
  },
};
