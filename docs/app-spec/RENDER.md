# Render Engine

The headless renderer turns an EDL ([EDL.md](./EDL.md)) into a video file as
a cancellable background job. It has **two picture renderers**: an FFmpeg
`filter_complex` for stretches of plain footage (fast), and the shared frame
compositor ([COMPOSITOR.md](./COMPOSITOR.md)) for everything else — the same
code the preview draws with, run on a server-side canvas and piped through
FFmpeg. Sound is always mixed by FFmpeg. Routes and the job result are
specified in [API.md](./API.md#render).

```text
POST /render ─ validate ─► job (lane "render")
                             │ probe sources, detect FFmpeg features
                             │ plan segments, choose a renderer for each
                             │   filter graph ─► one FFmpeg run     ┐ several
                             │   canvas ─► decode ► draw ► encode   ┘ at a time
                             │ join the segments (no re-encode) + mix the sound
                             ▼
              <data>/renders/<name>.mp4  +  <name>.mp4.json
```

Geometry and levels are never re-derived here. Placement comes from
`src/utils/edl/geometry.js`, fades and gain from `levels.js`,
`fadeCurves.js` and `gainEnvelope.js`, track selection from `query.js`
(`activeTracks`), the picture of the canvas path from `drawFrame` — the same
code the preview runs.

## Modules

Everything lives in `src/api/render/`; `src/api/render.js` is the thin router.

| Module | Role | I/O |
| ------ | ---- | --- |
| `request.js`, `mediaPaths.js` | Validate the request, normalise the EDL, check every file path | reads |
| `scope.js` | Which clips render, which files they read, empty-timeline check | pure |
| `prepare.js`, `probe.js`, `capabilities.js` | Probe sources, detect what this FFmpeg can do | runs ffprobe/ffmpeg |
| `route.js`, `segments.js`, `segmentRules.js` | What needs the compositor; segments and their renderer | pure |
| `plan.js`, `context.js`, `timing.js`, `sources.js`, `conform.js` | Filter-graph plan, frame arithmetic, frame choice | pure |
| `videoGraph.js`, `layer.js`, `layerFilters.js`, `layerMotion.js`, `layerParts.js`, `placement.js`, `mediaLayer.js`, `visible.js` | Picture graph | pure |
| `canvas/plan.js`, `canvas/sizes.js`, `canvas/decodeArgs.js`, `canvas/encodeArgs.js` | Plan of a canvas segment | pure |
| `canvas/segment.js`, `canvas/footage.js`, `canvas/pipes.js`, `canvas/host.js`, `canvas/still.js` | Decode, draw, encode; one frame as a picture | runs ffmpeg |
| `canvas/worker.js`, `canvas/workers.js` | Canvas worker processes | forks |
| `audioGraph.js`, `audioSpan.js`, `audioChain.js`, `audioEnvelope.js` | Sound graph | pure |
| `mux.js` | Joining pass | pure |
| `passes.js`, `parts.js`, `job.js`, `progress.js` | Run the passes, report progress, clean up | runs ffmpeg |
| `store.js` | Finished renders on disk, safe names | reads/writes |
| `presets.js`, `expr.js`, `errors.js` | Presets, graph text helpers, typed errors | pure |

```js
buildRenderPlan(edl, { probes, preset, range, outputPath, workDir, capabilities, streams })
// → { args, filterComplex, duration, inputs, files, warnings, width, height, fps, frames }
buildCanvasPlan(edl, { probes, preset, range, outputPath })
// → { doc, width, height, fps, startFrame, frames, footage, images, stills, encoderArgs, output }
```

Both perform no I/O, so they are unit-tested without FFmpeg. `probes` maps
each source path to its probe result; `files` lists what the caller must
write before running (the graph script, envelope tracks). With a `workDir`
the graph is passed as a script file (`-filter_complex_script`, or
`-/filter_complex` on FFmpeg 7+), so graph size never hits the
argument-length limit.

## Two renderers

A segment takes the **canvas path** when anything in it needs the
compositor, and the **filter graph** otherwise (`route.js`):

| Reason | What triggers it |
| ------ | ---------------- |
| `generator`, `title` | A generator clip; a title |
| `effect`, `track-effect` | An enabled effect on a clip or on its track |
| `blend`, `track-blend` | A blend mode other than `normal` |
| `keyframes` | Keyframes on anything but `volume` |
| `fade-curve` | A fade that is not linear (a fade-out hidden by a cross-fade does not count) |
| `track-opacity` | Track opacity below 1 |
| `background` | A document background other than black — every segment |

`POST /render/plan` lists the segments with their `engine` (`ffmpeg` or
`canvas`) and `reasons`. The filter graph refuses a range that holds any of
the above rather than drawing it wrong.

| Variable | Default | Meaning |
| -------- | ------- | ------- |
| `RENDER_ENGINE` | `auto` | `auto` routes as above. `canvas` draws everything with the compositor. `ffmpeg` uses only the filter graph and refuses (`422`) a timeline that needs the compositor |
| `RENDER_WORKERS` | half the cores, 1 to 4 | Segments rendered at once |

Both are read when a render is planned (`route.js`, `parts.js`).

## Timing

All timing is integer arithmetic on output frames and 48 kHz samples.

- The EDL frame rate becomes an exact rational (`29.97` → `30000/1001`).
- Clip starts and ends are snapped to output frames. The source window moves
  with a snapped start, so picture and keyframes stay in sync with the
  document; only a file's window is held at 0 or later.
- Fades are clamped to the clip (invariant 3).
- The render lasts `timelineDuration(edl)` — a trailing placeholder or muted
  clip still counts as (black, silent) length.
- A timeline with nothing to render is refused with `422`.

**Frame choice** (`conform.js`, both renderers). Every output frame shows
what a player would show at that moment: the latest source frame that has
started, or is about to within 0.3 of a frame (so rounded or jittery
timestamps — Matroska, variable-rate phone video — never make a frame
repeat). The input opens 0.1 s early so that frame exists for the clip's
first output frame; `settb`/`setpts` line the stream up in microseconds,
`fps=round=up` does the picking, `tpad` holds the last frame if the source
runs short and `trim` cuts to the exact count. The rule is absolute, so a
range render, a segment and either renderer pick exactly the same frames.

## Picture graph (filter path)

A black base of the output size, frame rate and exact frame count; then one
chain and one `overlay` per visible clip, back to front (the first video
track is drawn last), clips within a track in start order.

```text
color=c=black:s=1920x1080:r=30,format=yuv444p,trim=end_frame=150[v0];
[0:v:0]settb=AVTB,setpts=PTS-110000,fps=fps=30:round=up:start_time=0,
       tpad=stop_mode=clone:…,trim=end_frame=90,
       scale=w=1920:h=1080:in_color_matrix=bt709:out_color_matrix=bt709:out_range=tv:…,
       format=yuva444p[c0];
[v0][c0]overlay=x=0:y=0:format=yuv444:eof_action=pass:eval=init:
        enable='between(t,-0.016667,2.983333)'[v1];
[v1]format=yuv420p[vout]
```

Each clip is its own input, seeked and bounded so only the used part is
decoded. Its chain: conform → crop → scale (with colour conversion) → flip,
rotate → opacity (`lut` on alpha) and fades (`fade … alpha=1`) → timeline
position (`setpts`, `overlay` enabled only for the clip's frames).

- **Dissolves.** A fade-out is emitted only where `videoFadeOutWindow` says
  there is one: in a cross-fade the outgoing clip stays opaque and the
  incoming clip fades in over it.
- **Only what is seen is scaled.** For an unrotated, unanimated layer the
  part hidden by the frame is cropped away before scaling.
- **Rotation about the anchor**: `rotate` turns a layer about its centre;
  the overlay position is the bounding box rotated about the anchor.
- **Displayed size.** Rotation metadata (phone video, EXIF) swaps width and
  height, and non-square pixels are squared first.
- **Stills** are decoded, scaled and rotated once, then held by `tpad`.
- **Colour.** Composited in 8-bit BT.709 limited range. Each source is
  converted from its own matrix: a tagged file says which; untagged
  JPEG-family sources are BT.601; otherwise HD is BT.709 and SD is BT.601.
- **Ken burns.** The layer is scaled once to its largest size, then resized
  and positioned per frame with expressions of the clip's progress. Pan and
  zoom move in straight lines; a moving crop bends the path, which is
  followed through 33 samples (`CROP_STEPS`) with the crop warped per frame
  by `perspective`. `oracle.test.js` checks rendered frames against
  `resolveTransform` + `placeSource`: within 2 px, 4 px when rotated.

## The canvas path

```text
ffmpeg -ss … -i a.mp4 -vf conform,scale,format=rgba ─► raw RGBA ┐   (one per clip on screen)
ffmpeg -ss … -i b.mp4 …                             ─► raw RGBA ┤
                         stills, sprites (loaded once) ─────────┤
                                                                ▼
            for each frame: env.frameOf ─► drawFrame(ctx, doc, time, env) ─► canvas
                                                                │ raw RGB
                                                                ▼
ffmpeg -f rawvideo -i pipe:0 -vf scale(bt709,tv),setsar=1,format=yuv420p + the preset's x264 settings
```

- **The document** is the EDL with its clips snapped to the frame grid;
  frame *n* is drawn at `n / fps`. `layersAt` and the plan agree on which
  clips are on screen because both read the same snapped document.
- **Footage.** One FFmpeg per clip decodes exactly the frames the output
  shows (the shared frame choice above) and writes them as RGBA; frame *i*
  of its output belongs to output frame `first + i`. Rotation metadata is
  applied by FFmpeg, non-square pixels are squared by the scale, colour is
  converted from the source's matrix, alpha is kept. A decoder starts 12
  frames before its clip appears and is closed when the clip has gone; the
  same file used by several clips gets a decoder per clip.
- **Decode size** (`sizes.js`). A clip is decoded at the largest size it is
  ever shown at (keyframes and ken burns sampled along the clip), never
  larger than the source, with the source's proportions — the same size in
  every segment. FFmpeg does the reduction with the preset's scaler; the
  canvas only ever enlarges.
- **Stills and sprites** (`requirements`) are decoded by the canvas library
  once per segment that shows them and kept while the next segment needs
  them; EXIF orientation is honoured. A still clip that is shown smaller
  than it is comes reduced from FFmpeg instead, like footage.
- **Back-pressure.** Decoder output is read one frame at a time and the
  encoder is given the next frame only when it has taken the last, so each
  stream holds one frame in flight plus what fits in a pipe.
- **Encoding.** The encoder arguments are the filter path's own (`videoArgs`)
  and the frames arrive in the same shape — `yuv420p`, BT.709, limited
  range, square pixels — so both kinds of segment carry byte-identical
  H.264 parameter sets (`pipeline.test.js`) and join by stream copy.
- **Workers.** Drawing is synchronous and CPU-bound, so it runs in worker
  processes (`canvas/worker.js`, forked on first use, one compositor
  environment each, reused from segment to segment), never on the server's
  event loop. Long canvas segments are cut into 4 s chunks on the keyframe
  grid so several workers have something to do.
- **Cancelling and failing.** Cancelling stops the workers, which kill their
  FFmpeg processes and remove their partial files; a worker also stops when
  its parent disappears. The first segment that fails stops the others. An
  error names the file: `Cannot decode source file: <path> (…)`,
  `Cannot read image: <path>`.
- **Titles** are drawn here and nowhere else: the bundled fonts, wrapping,
  animation and colour emoji come from the compositor.

`renderStill(edl, time, { probes, width })` (`canvas/still.js`) draws one
frame with the same plan and decoders; `nearedit frame` uses it.

## Sound graph

Only audio tracks make sound (`activeTracks(tracks, 'audio')`); a clip on a
video track is silent. Clips whose source has no audio stream are skipped.

```text
[2:a:0]aresample=sample_rate=48000:async=1:first_pts=0,aformat=…stereo,
       atrim=end_sample=240000,volume=volume=0.8,afade=t=in:st=0:d=1:curve=hsin,
       apad=whole_len=240000[a2];
[a2][lane1]amix=inputs=2:normalize=0:duration=longest,
           alimiter=limit=0.891:level=0:latency=1,apad=whole_len=…,atrim=end_sample=…[aout]
```

- Each clip: its own trimmed input → 48 kHz stereo float (mono is copied to
  both channels at unity, as Web Audio does) → its level → padded with
  silence up to the next clip of its lane.
- **Level** follows `levels.js` `clipGain`. A constant gain is `volume`
  (`track.volume × clip.volume`); fades are `afade` with the curve of the
  same formula (`fadeCurves.js`): in / out `tri`/`tri` (linear),
  `hsin`/`hsin` (smooth), `ipar`/`qua` (fast), `qua`/`ipar` (slow),
  `ihsin`/`ihsin` (sharp).
- **Volume envelopes.** A clip with a keyframed `volume` gets its whole gain
  — track volume, keyframes, curved fades — from `gainEnvelope` samples
  joined by straight lines, written as a 2400 Hz mono float control track
  (`envelope-N.f32`, 9.6 kB per second), resampled by FFmpeg and multiplied
  in with `amultiply`. The track is padded at both ends so the resampler's
  edges fall outside the part that is used. A range render samples only its
  own part.
- **Lanes.** Clips that do not overlap share a lane, a plain `concat`, so
  FFmpeg reads sources one after another. A cross-fade pair lands on two
  lanes and both clips ramp (equal gain).
- Lanes are summed with `amix normalize=0`, limited at −1 dBFS (`alimiter`,
  auto-level off, look-ahead compensated), then cut to the exact length.
- No audible clip → `anullsrc`, so the file always has an audio stream.

`audioLevels.test.js` measures the mix as it leaves the graph against
`clipGain(resolveClip(clip, t), t)`: within 0.004 of full scale for every
curve and for an envelope with eased, held and bouncing keys.

## Presets

| Preset | Size | Compositing (filter path) | x264 | CRF | AAC |
| ------ | ---- | ------------------------- | ---- | --- | --- |
| `draft` | half, even | 4:2:0, bilinear | `veryfast` | 28 | 128k |
| `standard` (default) | full | 4:4:4, bicubic | `medium` | 20 | 192k |
| `high` | full | 4:4:4, lanczos | `slow` | 16 | 320k |

All presets write H.264 High, `yuv420p`, BT.709-tagged, a keyframe every
2 s, AAC 48 kHz stereo, MP4 with `+faststart`. Draft halves every position
and size; on the canvas path the canvas itself is half size (`frame.scale`
0.5), so it shows the same framing.

## Range renders and segments

`range: { start, end }` (seconds) is clamped to the timeline. Clips that
began before the range are seeked further in; fades, ken burns, keyframes
and envelopes are picked up part-way, not restarted.

Every clip is a separate FFmpeg input, and an open input holds decoder
buffers plus one waiting frame — about 55–75 MB per HD clip — so the picture
is rendered in **segments** (`segments.js`, `segmentRules.js`):

- the range is cut at clip boundaries; consecutive stretches join while
  they use the same renderer and touch at most 8 video-track clips
  (`MAX_LAYERS`);
- no segment is shorter than 30 frames: a short compositor stretch borrows
  just the frames it lacks from the plain footage beside it, and plain
  footage too short to stand alone is drawn by the canvas with its
  neighbour;
- canvas segments longer than 4 s are cut into chunks.

Each segment is a range render without sound. `RENDER_WORKERS` of them run
at once. The final pass joins them with the concat demuxer and `-c:v copy`
(exact stated durations keep every frame on the grid) while mixing the sound
of the whole range once — audio is never segmented. A timeline that is one
filter-graph segment runs as the single pass that `POST /render/plan`
shows; otherwise the plan shows the joining pass.

## Jobs, files and cleanup

- `POST /render` validates synchronously (a bad request is a `4xx`, not a
  failed job) and starts `runJob('render', …)` in the `render` lane
  (`RENDER_CONCURRENCY`).
- Progress: frames finished over all segments are 0–95 %, the joining pass
  the rest; a single pass reports FFmpeg's `out_time_us`.
- Everything temporary — graph scripts, envelope tracks, segments, the
  partial output — lives in `<renders>/.work-XXXXXX/`, removed on success,
  failure and cancellation. Cancelling aborts the job's signal, which kills
  FFmpeg and the canvas workers. Work directories orphaned by a crash are
  swept when the next job starts.
- The finished file is renamed into `<data>/renders/` with a record
  `<name>.mp4.json` that `GET /renders?projectId=` reads.
- Names: `filename` is reduced to letters, digits, space and `._()-`, given
  an `.mp4` extension, and refused (`422`) if it contains a path separator.
  An existing render is never overwritten (`name-2.mp4`).
- `GET`/`DELETE /render/file/:name` accept only a plain, non-hidden `.mp4`
  basename inside the renders directory; `GET` supports HTTP ranges.

### Path safety

An EDL is normalised (`normalizeEdl`) and then every file it names — each
`sourceFile` and each `image` parameter of a generator or effect, on every
track, also muted ones (`mediaPaths.js`) — must pass `lib/paths.js`
`isAllowedPath`, or the request is `403`. A relative path resolves against
the dev media directory. A missing file is a `422` naming it. Canvas workers
read only what the checked document names.

## FFmpeg requirements

`ffmpeg` and `ffprobe` on `PATH` with `libx264` (otherwise `503`).
Developed and tested against **6.1.1**.

| Feature | Needs | Without it |
| ------- | ----- | ---------- |
| `amultiply` (volume envelopes) | 4.0 | A render with a keyframed volume fails |
| `alimiter` `latency` | 5.1 | Sound is 5 ms late |
| `-/filter_complex` | 7.0 | `-filter_complex_script` is used on older versions |

The FFmpeg 7+ argument form is covered by unit tests; it has not been run
against a real FFmpeg 7 build. The canvas path needs `@napi-rs/canvas`
(prebuilt for Linux, macOS and Windows) and the fonts vendored at install.

## Speed and memory

Measured on a 4-core machine that was busy with other work (FFmpeg 6.1.1,
1920×1080, 30 fps, `standard`, 10 s scenes); read the figures as lower
bounds.

| Scene | Renderer | Frames per second |
| ----- | -------- | ----------------- |
| One footage layer | filter graph | 32 |
| One footage layer | canvas, 1 / 2 workers | 20 / 26 |
| Two footage layers and an animated title | canvas, 1 / 2 workers | 25 / 22 |
| Generators only (gradient, blended pattern, animated title) | canvas, 1 / 2 workers | 22 / 21 |
| Blurred footage under a glowing title | canvas, 1 / 2 workers | 17 / 18 |

The encoder is the limit: with x264 taken out, one footage layer runs
through the canvas path at 50 frames per second (decode 5 ms, draw 5 ms,
read back 3 ms, hand over 6 ms); `draft` encodes it at 125. Plain footage is
therefore 1.2 to 1.6 times slower on the canvas path than on the filter
graph, which is why routing keeps it there. x264 already uses every core,
so a second worker gains little on four cores; it pays off on larger
machines and for scenes whose drawing is the slow part.

Peak memory is the tool, its workers and every FFmpeg together, sampled
while a mixed 1080p timeline rendered (5 s cuts of two HD files, a title
over every other one, a generator every 30 s, a volume envelope on the
music):

| Timeline | Segments (canvas) | Workers | Time | Peak memory |
| -------- | ----------------- | ------- | ---- | ----------- |
| 2 min, `standard` | 36 (20) | 1 | 166 s (22 fps) | 1.1 GB |
| 2 min, `standard` | 36 (20) | 2 | 118 s (31 fps) | 2.2 GB |
| 6 min, `standard` | 108 (60) | 2 | 345 s (31 fps) | 2.2 GB |
| 10 min, `draft` | 180 (100) | 2 | 196 s (92 fps) | 1.1 GB |

Memory follows the number of workers, not the length of the timeline: about
1.1 GB per worker at 1080p `standard`, of which 0.8 GB is FFmpeg (x264's
look-ahead and the decoders) and 0.2 GB the canvas worker.

- **Layers at one instant** are not split: 30 stacked video tracks are one
  segment with 30 decoders (≈ 2 GB at HD). 4K sources cost about four times
  the HD figures on the filter path; the canvas path decodes them at output
  size.
- **Audio clips** all open in the joining pass (≈ 2 MB each). The practical
  ceiling is the open-file limit: about 1000 audio clips at `ulimit -n 1024`.

## Limits and what is not honoured

- **Two renderers, one picture.** Where a title appears over a running shot
  the footage changes renderer for that stretch. Both pick the same frames
  and place them alike, but they scale and convert colour differently
  (FFmpeg bicubic in YUV; canvas bilinear in RGB): the same plain footage
  differs by about 43–49 dB PSNR after encoding — below what is visible in
  motion, not zero. `RENDER_ENGINE=canvas` draws everything one way.
- **Footage and stills are reduced by FFmpeg**, not by the canvas, before
  they are drawn — a plain bilinear `drawImage` turns fine detail into moiré
  at reductions of three times and more. A reduced clip is therefore
  resampled a little differently than in the preview (same place, mean
  difference about 2 of 255 on a test pattern at half size).
- **Sparse sources.** Only 0.1 s before a clip's first frame is decoded. A
  clip that starts inside a longer gap between source frames (a screen
  recording that only stores changes) shows the next frame early.
- **Filter path:** positions are whole pixels (even pixels in `draft`); an
  animated crop on a rotated clip keeps the crop of the clip's start, with
  a warning in the job log.
- **Canvas path:** 8-bit RGB without colour management. Sprites, and stills
  shown at their own size or larger, are held at full size in each worker
  that shows them. An animated GIF or WebP shows its first frame. A worker
  that dies fails the job (no retry).
- **HDR and 10-bit** sources are converted to 8-bit BT.709 with the right
  matrix but are not tone-mapped. Interlaced sources are not deinterlaced.
  VP9 alpha is not decoded by FFmpeg's native decoder.
- **Envelopes** follow `gainEnvelope`'s 10 ms samples: a `hold` step in a
  keyframed volume is a ramp of up to 10 ms, as in the preview.
- **Surround** sources are downmixed with FFmpeg's defaults, which are
  quieter than Web Audio's. The limiter has no counterpart in the preview.
- **Markers** are not written as chapters.

## Tests

`node --test src/api/render/*.test.js src/api/render/canvas/*.test.js`
(about two minutes; needs FFmpeg).

| File | What it proves |
| ---- | -------------- |
| `plan.test.js`, `planMix.test.js`, `units.test.js`, `support.test.js` | Graph structure and every pure module, without FFmpeg |
| `route.test.js` | Each trigger and its reason; segment planning with both renderers; `RENDER_ENGINE` |
| `video.test.js`, `motion.test.js`, `oracle.test.js` | Filter path pixels: layer order, fades, fit, crop, rotation, stills, alpha, ken burns, awkward sources; placement and levels equal the shared maths |
| `frames.test.js` | Frame accuracy with numbered frames, **through both renderers**: every clip start and cut, 60 and 24 fps conform, range renders |
| `canvas/compare.test.js` | Rendered frames equal `renderFrame` of the same document: byte for byte when encoded without loss, within a stated tolerance through each preset |
| `canvas/footage.test.js` | Canvas path footage and stills: rotation, EXIF, non-square pixels, 10-bit and 4:4:4, colour, alpha, one file in several clips, short sources, decode size, reduced stills |
| `canvas/pipeline.test.js` | Back-pressure, the plan as data, identical H.264 parameter sets on both paths, cancellation, errors that name the file |
| `mixed.test.js` | Mixed timelines: exact frame counts, continuous timestamps, no repeated or dropped frame at a renderer change, parallel workers, cancel and failure, `RENDER_ENGINE` |
| `audio.test.js`, `audioLevels.test.js` | Measured levels: gain, fades on every curve, envelopes, cross-fades, mute/solo, silence, limiter |
| `segments.test.js` | A segmented render equals the whole render frame for frame |
| `routes.test.js`, `routesCanvas.test.js` | Every route, the job result, listing, serving, deletion, refusals (also for image parameters), cancellation and cleanup |

Renders are 320×180 and a few seconds long; pixels are read back as raw RGB
and tones with a single-bin DFT, so assertions are numeric.
