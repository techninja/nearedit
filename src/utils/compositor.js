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
  /** @param {number} width @param {number} height @param {number} [outputAspect] */
  constructor(width, height, outputAspect) {
    this.width = width;
    this.height = height;
    this.outputAspect = outputAspect || width / height;
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

      // Sync videos — start/stop as playhead crosses clip boundaries
      this._syncVideosForPlay(tracks, timelineTime);
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
    this._rafId = 0;
    for (const [key, el] of this._videoPool) {
      if (key.startsWith('img_')) continue;
      if (el instanceof HTMLVideoElement && !el.paused) el.pause();
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
    const activeFiles = new Set(active.map(({ clip }) => clip.sourceFile));

    // Start newly active videos
    for (const { clip } of active) {
      const video = this._getVideo(clip.sourceFile);
      const sourceTime = clip.sourceIn + (timelineTime - clip.timelineStart);
      if (video.paused || Math.abs(video.currentTime - sourceTime) > 0.5) {
        video.currentTime = sourceTime;
        video.play().catch(() => {});
      }
    }

    // Pause videos no longer active
    for (const [key, el] of this._videoPool) {
      if (key.startsWith('img_')) continue;
      if (!(el instanceof HTMLVideoElement)) continue;
      if (!activeFiles.has(key) && !el.paused) {
        el.pause();
      }
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

    // Viewport is the full canvas (canvas is already the correct aspect)
    this._viewport = { x: 0, y: 0, w: this.width, h: this.height };

    const visible = tracks.filter((t) => t.type !== 'audio' && !t.muted);
    for (let i = visible.length - 1; i >= 0; i--) {
      const track = visible[i];
      for (const clip of track.clips) {
        if (!clip.sourceFile) continue;
        if (time < clip.timelineStart || time >= clip.timelineEnd) continue;

        const ext = clip.sourceFile.split('.').pop().toLowerCase();
        const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext);
        const t = clip.transform || defaultTransform();
        const progress = (time - clip.timelineStart) / (clip.timelineEnd - clip.timelineStart);
        const duration = clip.timelineEnd - clip.timelineStart;

        // Set fade context for _drawSource
        this._currentClipFade = {
          fadeIn: clip.fadeIn || 0,
          fadeOut: clip.fadeOut || 0,
          progress,
          duration,
        };

        if (isImage) {
          this._drawImageSource(ctx, clip.sourceFile, t, progress);
        } else {
          const video = this._getVideo(clip.sourceFile);
          if (video.readyState >= 2) {
            this._drawSource(ctx, video, video.videoWidth, video.videoHeight, t, progress);
          }
        }
      }
    }

    if (this._outputCtx) {
      this._outputCtx.clearRect(0, 0, this.width, this.height);
      this._outputCtx.drawImage(this._offscreen, 0, 0);
    }
  }

  /** Draw an image source with transform. */
  _drawImageSource(ctx, sourceFile, t, progress = 0) {
    let img = this._videoPool.get(`img_${sourceFile}`);
    if (!img) {
      img = new Image();
      img.src = `/api/media/file?path=${encodeURIComponent(sourceFile)}`;
      this._videoPool.set(`img_${sourceFile}`, img);
    }
    if (!img.complete || !img.naturalWidth) return;
    this._drawSource(ctx, img, img.naturalWidth, img.naturalHeight, t, progress);
  }

  /**
   * Draw any source with crop + transform.
   * Handles ken burns animation for images based on timeline position.
   * @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} ctx
   * @param {CanvasImageSource} source
   * @param {number} srcW
   * @param {number} srcH
   * @param {object} t - Transform
   * @param {number} [progress=0] - 0-1 progress through clip (for ken burns)
   */
  _drawSource(ctx, source, srcW, srcH, t, progress = 0) {
    // Ken burns: if transform has kenBurns data, interpolate
    let transform = t;
    if (t.kenBurns) {
      const kb = t.kenBurns;
      const lerp = (a, b) => a + (b - a) * progress;
      transform = {
        ...t,
        x: lerp(kb.startX ?? t.x, kb.endX ?? t.x),
        y: lerp(kb.startY ?? t.y, kb.endY ?? t.y),
        scaleX: lerp(kb.startScale ?? t.scaleX, kb.endScale ?? t.scaleX),
        scaleY: lerp(kb.startScale ?? t.scaleY, kb.endScale ?? t.scaleY),
        cropTop: lerp(kb.startCropTop ?? t.cropTop, kb.endCropTop ?? t.cropTop),
        cropBottom: lerp(kb.startCropBottom ?? t.cropBottom, kb.endCropBottom ?? t.cropBottom),
        cropLeft: lerp(kb.startCropLeft ?? t.cropLeft, kb.endCropLeft ?? t.cropLeft),
        cropRight: lerp(kb.startCropRight ?? t.cropRight, kb.endCropRight ?? t.cropRight),
      };
    }

    const vp = this._viewport || { x: 0, y: 0, w: this.width, h: this.height };

    const sx = transform.cropLeft * srcW;
    const sy = transform.cropTop * srcH;
    const sw = srcW * (1 - transform.cropLeft - transform.cropRight);
    const sh = srcH * (1 - transform.cropTop - transform.cropBottom);

    // Fill mode: scale source to COVER the viewport (crop overflow)
    // This prevents letterboxing — source always fills the frame
    const srcAspect = sw / sh;
    const vpAspect = vp.w / vp.h;
    let dw, dh;
    if (srcAspect > vpAspect) {
      // Source is wider than viewport — fill height, crop sides
      dh = vp.h * transform.scaleY;
      dw = (vp.h * srcAspect) * transform.scaleX;
    } else {
      // Source is taller than viewport — fill width, crop top/bottom
      dw = vp.w * transform.scaleX;
      dh = (vp.w / srcAspect) * transform.scaleY;
    }

    const dx = vp.x + (vp.w - dw) / 2 + transform.x;
    const dy = vp.y + (vp.h - dh) / 2 + transform.y;

    ctx.save();
    ctx.globalAlpha = transform.opacity;

    // Apply fade in/out if clip progress is provided
    if (this._currentClipFade) {
      const { fadeIn, fadeOut, progress, duration } = this._currentClipFade;
      const timeInClip = progress * duration;
      const timeFromEnd = duration - timeInClip;
      if (fadeIn > 0 && timeInClip < fadeIn) {
        ctx.globalAlpha *= timeInClip / fadeIn;
      }
      if (fadeOut > 0 && timeFromEnd < fadeOut) {
        ctx.globalAlpha *= timeFromEnd / fadeOut;
      }
    }

    if (transform.rotation !== 0) {
      const cx = dx + dw * transform.anchorX;
      const cy = dy + dh * transform.anchorY;
      ctx.translate(cx, cy);
      ctx.rotate((transform.rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }
    ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
    ctx.restore();
  }

  /** @returns {boolean} */
  get isPlaying() { return this._playing; }

  /** Resize buffers. */
  resize(width, height, outputAspect) {
    this.width = width;
    this.height = height;
    if (outputAspect) this.outputAspect = outputAspect;
    this._offscreen.width = width;
    this._offscreen.height = height;
  }

  /** Release all resources. */
  destroy() {
    this.stopPlayback();
    for (const [key, el] of this._videoPool) {
      if (el instanceof HTMLVideoElement) { el.src = ''; el.load(); }
    }
    this._videoPool.clear();
  }
}
