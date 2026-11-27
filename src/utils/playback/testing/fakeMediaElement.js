/**
 * Fake `<audio>`/`<video>` element for Node tests of the playback engine.
 * It models only what the engine touches: play/pause flags and seeking
 * that lands when the test says so.
 * @module utils/playback/testing/fakeMediaElement
 */

/** A media element whose loads and seeks finish on demand. */
export class FakeMediaElement extends EventTarget {
  paused = true;
  seeking = false;
  readyState = 0;
  playbackRate = 1;
  duration = NaN;
  videoWidth = 640;
  videoHeight = 360;
  src = '';
  /** @type {number[]} Every position the engine seeked to */
  seeks = [];
  time = 0;

  /** @returns {number} */
  get currentTime() {
    return this.time;
  }

  /** @param {number} value */
  set currentTime(value) {
    this.time = value;
    this.seeks.push(value);
    if (this.readyState >= 1) this.seeking = true;
  }

  /** @returns {Promise<void>} */
  play() {
    this.paused = false;
    return Promise.resolve();
  }

  /** Pause playback. */
  pause() {
    this.paused = true;
  }

  /** (Re)load: back to having no data. */
  load() {
    this.readyState = 0;
    this.seeking = false;
  }

  /**
   * @param {string} name
   * @returns {string|null}
   */
  getAttribute(name) {
    return name === 'src' ? this.src || null : null;
  }

  /** @param {string} name */
  removeAttribute(name) {
    if (name === 'src') this.src = '';
  }

  /** Test control: the media loaded and has a frame at its position. */
  finishLoad() {
    this.readyState = 4;
    this.duration = 600;
    this.dispatchEvent(new Event('loadeddata'));
  }

  /** Test control: the seek in flight landed. */
  finishSeek() {
    this.seeking = false;
    this.readyState = 4;
    this.dispatchEvent(new Event('seeked'));
  }

  /** Test control: playback ran on by some seconds. */
  advance(seconds) {
    this.time += seconds * this.playbackRate;
  }
}

/**
 * Install the fake as the element the engine creates.
 * @returns {void}
 */
export function installFakeElements() {
  const scope = /** @type {any} */ (globalThis);
  scope.Audio = FakeMediaElement;
  scope.document = { createElement: () => new FakeMediaElement() };
}
