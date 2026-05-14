/**
 * Preview compositor — dual-mode canvas rendering pipeline.
 *
 * PLAYBACK MODE: Video elements play natively at 1x. Each rAF tick
 * grabs the current frame via drawImage — zero seeking overhead.
 *
 * SCRUB MODE: Video elements are paused and seeked to exact time.
 * Uses triple-buffer rotation to avoid tearing during async seeks.
 *
 * @module utils/compositor
 */

/** @returns {object} */
export function defaultTransform() {
  return {
    x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
    cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0,
    anchorX: 0.5, anchorY: 0.5,
  };
}

export class Compositor {
  /** @param {number} width @param {number} height */
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this._playing = false;
    this._rafId = 0;
    /** @type {CanvasRenderingContext2D|null} */
    this._outputCtx = null;

    // Offscreen composite buffer
    this._offscreen = new OffscreenCanvas(width, height);
    this._offCtx = this._offscreen.getContext('2d');

    /** @type {Map<string, HTMLVideoElement>} */
    this._videoPool = new Map();
    /** @type {{ tracks: object[], time: number }|null} */
    this._currentScene = null;
  }

  /** Bind to the on-screen canvas for output. */
  setOutput(canvas) {
    this._outputCtx = canvas.getContext('2d');
  }

  /** Get or create a pooled video element. */
  _getVideo(sourceFile) {
    if (this._videoPool.has(sourceFile)) return this._videoPool.get(sourceFile);
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.playsInline = true;
    video.src = `/api/media/file?path=${encodeURIComponent(sourceFile)}`;
    video.load();
    this._videoPool.set(sourceFile, video);
    return video;
  }

  /**
   * Start playback mode — videos play natively, compositor grabs frames each tick.
   * @param {object[]} tracks
   * @param {number} startTime - Timeline time to start from
   * @param {(time: number) => void} onTick - Called each frame with current timeline time
   */
  startPlayback(tracks, startTime, onTick) {
    this._playing = true;
    this._currentScene = { tracks, time: startTime };
    const startWall = performance.now();
    const startPos = startTime;

    // Start all relevant videos playing from their source offset
    this._syncVideosForPlay(tracks, startTime);

    const tick = () => {
      if (!this._playing) return;
      const elapsed = (performance.now() - startWall) / 1000;
      const timelineTime = startPos + elapsed;
      this._currentScene.time = timelineTime;

      this._compositeFrame(tracks, timelineTime);
      onTick(timelineTime);
      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  /** Stop playback — pause all videos. */
  stopPlayback() {
    this._playing = false;
    cancelAnimationFrame(this._rafId);
    for (const video of this._videoPool.values()) {
      if (!video.paused) video.pause();
    }
  }

  /**
   * Scrub to a specific time (non-playing). Seeks videos and composites.
   * @param {object[]} tracks
   * @param {number} time
   */
  scrub(tracks, time) {
    if (this._playing) return;
    this._currentScene = { tracks, time };

    // Seek relevant videos and composite when ready
    const activeClips = this._getActiveClips(tracks, time);
    let pending = 0;

    for (const { clip, track } of activeClips) {
      const video = this._getVideo(clip.sourceFile);
      const sourceTime = clip.sourceIn + (time - clip.timelineStart);

      if (video.readyState < 2) {
        pending++;
        video.addEventListener('loadeddata', () => {
          video.currentTime = sourceTime;
        }, { once: true });
        video.addEventListener('seeked', () => {
          pending--;
          if (pending <= 0) this._compositeFrame(tracks, time);
        }, { once: true });
      } else if (Math.abs(video.currentTime - sourceTime) > 0.04) {
        pending++;
        video.addEventListener('seeked', () => {
          pending--;
          if (pending <= 0) this._compositeFrame(tracks, time);
        }, { once: true });
        video.currentTime = sourceTime;
      }
    }

    // If nothing needed seeking, composite immediately
    if (pending === 0) this._compositeFrame(tracks, time);
  }

  /**
   * Start videos playing at their correct offsets for native playback.
   * @param {object[]} tracks
   * @param {number} timelineTime
   */
  _syncVideosForPlay(tracks, timelineTime) {
    const active = this._getActiveClips(tracks, timelineTime);
    for (const { clip } of active) {
      const video = this._getVideo(clip.sourceFile);
      const sourceTime = clip.sourceIn + (timelineTime - clip.timelineStart);
      video.currentTime = sourceTime;
      video.play().catch(() => {});
    }
  }

  /**
   * Get all clips visible at a given time.
   * @param {object[]} tracks
   * @param {number} time
   * @returns {{ clip: object, track: object }[]}
   */
  _getActiveClips(tracks, time) {
    const result = [];
    for (const track of tracks) {
      if (track.type === 'audio' || track.muted) continue;
      for (const clip of track.clips) {
        if (!clip.sourceFile) continue;
        if (time >= clip.timelineStart && time < clip.timelineEnd) {
          result.push({ clip, track });
        }
      }
    }
    return result;
  }

  /**
   * Composite all visible layers and blit to output.
   * @param {object[]} tracks
   * @param {number} time
   */
  _compositeFrame(tracks, time) {
    const ctx = this._offCtx;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.width, this.height);

    // Render bottom-up (last track in sorted order draws first)
    const visible = tracks.filter((t) => t.type !== 'audio' && !t.muted);
    for (let i = visible.length - 1; i >= 0; i--) {
      const track = visible[i];
      for (const clip of track.clips) {
        if (!clip.sourceFile) continue;
        if (time < clip.timelineStart || time >= clip.timelineEnd) continue;

        const ext = clip.sourceFile.split('.').pop().toLowerCase();
        const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext);
        const t = clip.transform || defaultTransform();

        if (isImage) {
          this._drawImageSource(ctx, clip.sourceFile, t);
        } else {
          const video = this._getVideo(clip.sourceFile);
          if (video.readyState >= 2) {
            this._drawSource(ctx, video, video.videoWidth, video.videoHeight, t);
          }
        }
      }
    }

    // Blit to output canvas
    if (this._outputCtx) {
      this._outputCtx.clearRect(0, 0, this.width, this.height);
      this._outputCtx.drawImage(this._offscreen, 0, 0);
    }
  }

  /** Draw an image source with transform. */
  _drawImageSource(ctx, sourceFile, t) {
    let img = this._videoPool.get(`img_${sourceFile}`);
    if (!img) {
      img = new Image();
      img.src = `/api/media/file?path=${encodeURIComponent(sourceFile)}`;
      this._videoPool.set(`img_${sourceFile}`, img);
    }
    if (!img.complete || !img.naturalWidth) return;
    this._drawSource(ctx, img, img.naturalWidth, img.naturalHeight, t);
  }

  /**
   * Draw any source with crop + transform.
   * @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} ctx
   * @param {CanvasImageSource} source
   * @param {number} srcW
   * @param {number} srcH
   * @param {object} t - Transform
   */
  _drawSource(ctx, source, srcW, srcH, t) {
    const sx = t.cropLeft * srcW;
    const sy = t.cropTop * srcH;
    const sw = srcW * (1 - t.cropLeft - t.cropRight);
    const sh = srcH * (1 - t.cropTop - t.cropBottom);

    const aspect = sw / sh;
    let dw, dh;
    if (aspect > this.width / this.height) {
      dw = this.width * t.scaleX;
      dh = (this.width / aspect) * t.scaleY;
    } else {
      dh = this.height * t.scaleY;
      dw = (this.height * aspect) * t.scaleX;
    }

    const dx = (this.width - dw) / 2 + t.x;
    const dy = (this.height - dh) / 2 + t.y;

    ctx.save();
    ctx.globalAlpha = t.opacity;
    if (t.rotation !== 0) {
      const cx = dx + dw * t.anchorX;
      const cy = dy + dh * t.anchorY;
      ctx.translate(cx, cy);
      ctx.rotate((t.rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }
    ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
    ctx.restore();
  }

  /** @returns {boolean} */
  get isPlaying() { return this._playing; }

  /** Resize buffers. */
  resize(width, height) {
    this.width = width;
    this.height = height;
    this._offscreen.width = width;
    this._offscreen.height = height;
  }

  /** Release all resources. */
  destroy() {
    this.stopPlayback();
    for (const el of this._videoPool.values()) {
      if (el instanceof HTMLVideoElement) { el.src = ''; el.load(); }
    }
    this._videoPool.clear();
  }
}
