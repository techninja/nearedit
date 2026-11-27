# Render Engine

The headless renderer turns an EDL ([EDL.md](./EDL.md)) into an FFmpeg
`filter_complex` and runs it as a cancellable background job. Routes and the
job result are specified in [API.md](./API.md#render); this document
explains how the graph is built, what the presets are, and where the limits
lie.

```text
POST /render ─ validate ─► job (lane "render")
                             │ probe sources, detect FFmpeg features, measure title fonts
                             │ plan segments ─► one FFmpeg run per segment (picture)
                             │                ─► one run joining them + mixing the sound
                             ▼
              <data>/renders/<name>.mp4  +  <name>.mp4.json
```

Geometry and levels are never re-derived here. Placement comes from
`src/utils/edl/geometry.js` (`resolveTransform`, `placeSource`), fades and
gain from `levels.js` (`videoFadeOutWindow`, `clipGain`), track selection
from `query.js` (`activeTracks`), title layout constants from
`src/utils/playback/titleLayout.js` — the same code the preview runs.

## Modules

Everything lives in `src/api/render/`; `src/api/render.js` is the thin router.

| Module | Role | I/O |
| ------ | ---- | --- |
| `request.js` | Validate the request body, normalise the EDL, enforce the path allow-list | reads |
| `scope.js` | Which clips render, which files they read, empty-timeline check | pure |
| `prepare.js`, `probe.js`, `capabilities.js`, `fontMetrics.js`, `fonts.js` | Probe sources, detect what this FFmpeg can do, measure fonts | runs ffprobe/ffmpeg |
| `plan.js` | `buildRenderPlan(edl, options)` → arguments + graph | pure |
| `context.js`, `timing.js`, `sources.js` | Frame/sample arithmetic, source description, shared plan state | pure |
| `videoGraph.js`, `layer.js`, `layerFilters.js`, `layerMotion.js`, `layerParts.js`, `placement.js`, `mediaLayer.js` | Picture graph | pure |
| `title.js`, `titleStyle.js` | Title cards (drawtext) | pure |
| `audioGraph.js` | Sound graph | pure |
| `segments.js`, `mux.js` | Splitting long renders, joining pass | pure |
| `passes.js`, `job.js`, `progress.js` | Run FFmpeg, report progress, clean up | runs ffmpeg |
| `store.js` | Finished renders on disk, safe names | reads/writes |
| `presets.js`, `expr.js`, `errors.js` | Presets, graph text helpers, typed errors | pure |

### The plan builder

```js
buildRenderPlan(edl, { probes, preset, range, outputPath, workDir, capabilities, streams })
// → { args, filterComplex, duration, inputs, files, warnings, width, height, fps, frames }
```

It performs no I/O, so it is unit-tested without FFmpeg. `probes` maps each
source path to its probe result; `files` lists what the caller must write
before running (title text, the graph script). With a `workDir` the graph is
passed as a script file (`-filter_complex_script`, or `-/filter_complex` on
FFmpeg 7+), so graph size never hits the argument-length limit. `warnings`
names anything the render could not honour; the job logs them.

## Timing

All timing is integer arithmetic on output frames and 48 kHz samples.

- The EDL frame rate becomes an exact rational (`29.97` → `30000/1001`).
- Clip starts and ends are snapped to output frames. `sourceIn` moves with a
  snapped start, so the picture stays in sync with the document.
- Fades are clamped to the clip (invariant 3).
- The render lasts `timelineDuration(edl)` — the shared definition, so a
  trailing placeholder or muted clip still counts as (black, silent) length.
- A timeline with nothing to render — no clips, only placeholders, every
  track muted — is refused with `422`.

## Picture graph

A black base of the output size, frame rate and exact frame count; then one
chain and one `overlay` per visible clip. Tracks come from
`activeTracks(tracks, 'video')` and are composited back to front (the first
video track is drawn last); clips within a track in start order.

```text
color=c=black:s=1920x1080:r=30,format=yuv444p,trim=end_frame=150[v0];
[0:v:0]settb=AVTB,setpts=PTS-110000,fps=fps=30:round=up:start_time=0,
       tpad=stop_mode=clone:…,trim=end_frame=90,
       scale=w=1920:h=1080:in_color_matrix=bt709:out_color_matrix=bt709:out_range=tv:…,
       format=yuva444p[c0];
[v0][c0]overlay=x=0:y=0:format=yuv444:eof_action=pass:eval=init:
        enable='between(t,-0.016667,2.983333)'[v1];
[1:v:0]settb=…,setpts=…,fps=…,tpad=…,trim=end_frame=90,scale=…,format=yuva444p,
       fade=t=in:st=0:d=1:alpha=1,setpts=PTS+60[c1];
[v1][c1]overlay=…:enable='between(t,1.983333,4.983333)'[v2];
[v2]format=yuv420p[vout]
```

Each clip is its own input, seeked and bounded (`-ss`, `-t`) so only the
used part is decoded. Its chain:

1. **Conform** to the output frame rate. Every output frame shows what a
   player would show at that moment: the latest source frame that has
   started, or is about to within 0.3 of a frame (so rounded or jittery
   timestamps — Matroska, variable-rate phone video — never make a frame
   repeat). To have that frame for the clip's first output frame the input
   opens 0.1 s early; `settb`/`setpts` line the stream up in microseconds
   and `fps=round=up` does the picking. `tpad` holds the last frame if the
   source turns out shorter than the clip (a container's stated duration is
   often a frame or two longer than its video); `trim` cuts to the exact
   frame count. Because the rule is absolute, a range render or a segment
   picks exactly the frames the whole render does.
2. **Crop** by the crop fractions (`crop`, whole source pixels).
3. **Scale** to the fitted size (`cover`/`contain` × `scaleX`/`scaleY`),
   converting colour on the way (see below).
4. **Flip** for negative scales, **rotate** (`rotate`, transparent fill).
5. **Opacity** (`lut` on the alpha plane) and **fades** (`fade … alpha=1`).
6. **Timeline position** — `setpts=PTS+<frames>`; the `overlay` is enabled
   only for the clip's frames and placed at the `placeSource` position.

Details that matter:

- **Dissolves.** A fade-out is emitted only where `videoFadeOutWindow` says
  there is one. In a cross-fade the outgoing clip stays opaque and the
  incoming clip (overlaid later) fades in over it, so the midpoint is a
  50/50 blend and never darker.
- **Only what is seen is scaled.** For an unrotated, unanimated layer the
  part hidden by the frame is cropped away *before* scaling (a 16:9 clip
  covering a 9:16 frame scales a third of its pixels).
- **Rotation about the anchor.** `rotate` turns a layer about its own
  centre; the overlay position is the bounding box of the rectangle rotated
  about the anchor point (`placement.js` `rotatedBox`).
- **Displayed size.** Placement uses what a viewer sees: rotation metadata
  (phone video, EXIF-rotated photos — read from the first frame, which is
  where a JPEG keeps it) swaps width and height, and non-square pixels are
  squared first. FFmpeg's autorotate turns the frames themselves.
- **Stills** are decoded, cropped, scaled and rotated once; `tpad` then
  repeats that one frame for the clip's free duration.
- **Alpha** in a source (a PNG logo) is kept and composited.
- **Colour.** Everything is composited in 8-bit BT.709 limited range and
  the output is tagged accordingly. Each source is converted from its own
  matrix in the scale step: a tagged file says which; untagged JPEG-family
  sources are BT.601; otherwise HD is BT.709 and SD is BT.601. RGB sources
  and title cards go straight to BT.709.

### Ken burns

When `transform.kenBurns.enabled`, placement is evaluated with the shared
maths along the clip and turned into FFmpeg expressions:

- the layer is scaled once to its largest size, then resized per frame
  (`scale=…:eval=frame`) and positioned per frame (`overlay` `x`/`y`
  expressions on the output clock);
- progress is `clip(t / duration, 0, 1)` on the clip's own clock, the same
  as `clipProgress`;
- pan and zoom move in straight lines, so the placement at the clip's start
  and end describes them exactly: `start + (end − start) × progress`;
- a moving crop changes the fit, which bends the path of the destination
  rectangle. It is sampled at 33 points (`CROP_STEPS`) and followed
  piecewise; the crop window itself is warped onto the source frame per
  frame with `perspective` (the `crop` filter cannot change size
  mid-stream).

`oracle.test.js` checks rendered frames against `resolveTransform` +
`placeSource` along the clip: within 2 px for pan, zoom and animated crop,
4 px when rotated.

## Titles

A title (`clipKind === 'title'`) is drawn **once** by `drawtext` onto a
transparent RGB card and then treated like a still image, so opacity,
fades, rotation, scale, flips and ken burns all apply to titles too.

```text
color=c=black@0:s=1920x1080:r=30,format=gbrap,trim=end_frame=1,
drawtext=fontfile=sans-serif\\:bold:textfile=/…/t0.txt:expansion=none:fontsize=72:
         fontcolor=0xffffff@1:x=(w-text_w)/2:y=(h-text_h)/2:text_align=center:y_align=font,
unpremultiply=inplace=1,scale=…,format=yuva444p,fps=…,tpad=…,trim=…,fade=…,setpts=…[t0]
```

- **Text never enters the graph.** The content is written to a file and read
  with `textfile` and `expansion=none`, so quotes, colons, percent signs,
  backslashes, emoji and line breaks are drawn literally and cannot inject
  filters. Colours are accepted only as hex; family and alignment only from
  their enums; the file path is escaped for both parser levels.
- **Layout matches the preview** (`titleLayout.js`): the block is centred in
  the frame and moved by `transform.x`/`y`; lines are pitched 1.2 × the font
  size; the background box is the block plus 0.25 × the font size. Because
  drawtext spaces lines by each font's own line height (1.1–1.4 × the size),
  the renderer measures the chosen font with a tiny FFmpeg run and corrects
  `line_spacing` and the box padding.
- **Fonts.** With fontconfig, `fontfile` takes a fontconfig pattern
  (`serif:bold:italic`): the generic families resolve to whatever the system
  provides, the same way a browser resolves them. Without fontconfig, font
  files are searched in the usual directories (DejaVu, Liberation, Noto,
  FreeFont, Arial…) and the closest style is used.
- **Scale.** Uniform scale goes into the font size, so scaled text stays
  crisp; only a stretch (`scaleX ≠ scaleY`) or an animated zoom resizes the
  card.
- **Outline** is `borderw`/`bordercolor`; drawtext blends premultiplied into
  the transparent card, which `unpremultiply` undoes so edges stay clean.

Degradation: without `text_align`/`y_align` (FFmpeg < 6.1) lines are
left-aligned inside the block and vertical centring follows the ink; without
`drawtext` at all, titles are skipped and the job log says so.

## Sound graph

Only audio tracks make sound (`activeTracks(tracks, 'audio')`); a clip on a
video track is silent. Clips whose source has no audio stream are skipped.

```text
[2:a:0]aresample=sample_rate=48000:async=1:first_pts=0,aformat=…stereo,
       atrim=end_sample=240000,volume=volume=0.8,afade=…,apad=whole_len=240000[a2];
[a2][lane1]amix=inputs=2:normalize=0:duration=longest,
           alimiter=limit=0.891:level=0:latency=1,apad=whole_len=…,atrim=end_sample=…[aout]
```

- Each clip: its own trimmed input → 48 kHz stereo float (mono is copied to
  both channels at unity, as Web Audio does) → gain `track.volume ×
  clip.volume` → linear `afade` in/out → padded with silence up to the next
  clip of its lane.
- **Lanes.** Clips that do not overlap share a lane, which is a plain
  `concat`; FFmpeg therefore reads sources one after another however long
  the timeline is. A cross-fade pair overlaps, lands on two lanes and both
  clips ramp (equal gain).
- Lanes are summed with `amix normalize=0` (no automatic level change),
  limited at −1 dBFS (`alimiter`, auto-level off, look-ahead compensated) so
  a hot mix does not clip, then padded/trimmed to the exact sample count.
- No audible clip → `anullsrc`, so the file always has an audio stream.

## Presets

| Preset | Size | Compositing | x264 | CRF | AAC |
| ------ | ---- | ----------- | ---- | --- | --- |
| `draft` | half, even | 4:2:0, bilinear | `veryfast` | 28 | 128k |
| `standard` (default) | full | 4:4:4, bicubic | `medium` | 20 | 192k |
| `high` | full | 4:4:4, lanczos | `slow` | 16 | 320k |

All presets write H.264 High, `yuv420p`, BT.709-tagged, a keyframe every
2 s, AAC 48 kHz stereo, MP4 with `+faststart`. Draft halves every position
and size (titles included), so it shows the same framing.

## Range renders

`range: { start, end }` (seconds) is clamped to the timeline. Clips that
began before the range are seeked further in; their filters keep counting
from the clip's own start, so a fade or a ken-burns move is picked up
part-way rather than restarted.

## Long timelines: segments

Every clip is a separate FFmpeg input, and an open input holds decoder
buffers plus one waiting frame — about 55–75 MB per HD clip. One graph for
a whole film therefore needs gigabytes (measured: 100 HD clips ≈ 8 GB).

So the picture is rendered in **segments** (`segments.js`): the timeline is
cut at clip boundaries so that each segment touches at most 8 video-track
clips (`MAX_LAYERS`) and is at least 30 frames long. Each segment is a
range render without sound; the final pass joins them with the concat
demuxer and `-c:v copy` (exact stated durations keep every frame on the
grid) while mixing the sound of the whole range once. Audio is never
segmented: a seek in the middle of a music bed could click.

A timeline that fits in one segment runs as the single pass that
`POST /render/plan` shows; `segments` in that response lists the ranges a
real run would use.

## Jobs, files and cleanup

- `POST /render` validates synchronously (so a bad request is a `4xx`, not
  a failed job) and starts `runJob('render', …)` in the `render` lane
  (`RENDER_CONCURRENCY`).
- Progress is parsed from FFmpeg's `-progress pipe:2` (`out_time_us`) as a
  share of the output duration; with segments, the picture takes 0–95 % and
  the joining pass the rest.
- Everything temporary — graph scripts, title text, segments, the partial
  output — lives in `<renders>/.work-XXXXXX/`, removed on success, failure
  and cancellation. Cancelling aborts the job's signal, which kills FFmpeg.
  Work directories orphaned by a crash are swept when the next job starts.
- The finished file is renamed into `<data>/renders/` with a record
  `<name>.mp4.json` (`projectId`, `adaptationId`, `preset`, `range`,
  `duration`, `width`, `height`, `fps`, `size`, `createdAt`) that
  `GET /renders?projectId=` reads.
- Names: `filename` is reduced to letters, digits, space and `._()-`, given
  an `.mp4` extension, and refused (`422`) if it contains a path separator.
  Without one the name is `<adaptation>-<YYYYMMDD-HHMMSS>.mp4`. An existing
  render is never overwritten (`name-2.mp4`).
- `GET`/`DELETE /render/file/:name` accept only a plain, non-hidden `.mp4`
  basename (`400` otherwise) inside the renders directory; `GET` supports
  HTTP ranges and `?download`.

### Path safety

An EDL is normalised (`normalizeEdl`) and then every `sourceFile` on every
track — also muted ones — must pass `lib/paths.js` `isAllowedPath`, or the
request is `403`. A relative path (v1 documents) resolves against the dev
media directory. A missing file is a `422` naming it; a file FFmpeg cannot
read fails the job with `Cannot read source file: <path>`.

## FFmpeg requirements

`ffmpeg` and `ffprobe` on `PATH` with `libx264` (otherwise `503`).
Developed and tested against **6.1.1**. Detected at first use
(`capabilities.js`) and worked around when missing:

| Feature | Needs | Without it |
| ------- | ----- | ---------- |
| `drawtext` `text_align`, `y_align`, per-side box padding | 6.1 | Lines left-aligned, ink-centred, uncorrected line pitch |
| `alimiter` `latency` | 5.1 | Sound is 5 ms late |
| `-/filter_complex` | 7.0 | `-filter_complex_script` is used on older versions |
| fontconfig | build option | Font files are located by name |
| `drawtext` | libfreetype | Titles are skipped with a warning |

The FFmpeg 7+ argument form and the non-fontconfig font lookup are covered
by unit tests and (for fonts) one real render with a forced font file; they
have not been run against a real FFmpeg 7 build.

## Limits and what is not honoured

Measured on a 4-core machine with FFmpeg 6.1.1, 1080p `standard`:

| Timeline | Passes | Peak memory | Time |
| -------- | ------ | ----------- | ---- |
| 40 clips × 1 s, one graph (forced) | 1 | 3.7 GB | 44 s |
| 40 clips × 1 s | 5 + 1 | 1.2 GB | 30 s |
| 100 clips × 0.5 s, one graph (forced) | 1 | 8.1 GB | 47 s |
| 300 clips + 150 captions, 150 s | 60 + 1 | 1.1 GB | 185 s |
| 1000 clips + 300 captions + 1000 audio clips, 500 s (`draft`) | 184 + 1 | 1.9 GB | 446 s |

The last output has exactly 15 000 frames on an even 1/30 s grid. The
machine was busy with other work during these runs, so read the times as
upper bounds; the split runs were consistently faster than one big graph.

- **Layers at one instant** are not split: 30 stacked video tracks are one
  segment with 30 inputs (≈ 2 GB at HD). 4K sources cost about four times
  the HD figures.
- **Audio clips** all open in the joining pass (≈ 2 MB each). The practical
  ceiling is the open-file limit: about 1000 audio clips at the common
  `ulimit -n 1024`.
- **Sparse sources.** Only 0.1 s before a clip's first frame is decoded. A
  clip that starts inside a longer gap between source frames (a screen
  recording that only stores changes) shows the next frame early.
- **Positions are whole pixels**, even pixels in `draft`; a very slow pan
  moves in pixel steps.
- **Titles** turn about the centre of their text block (`anchorX`/`anchorY`
  are ignored for titles — the block's size is unknown to the planner), and
  text reaching beyond the frame plus twice its offset is clipped when the
  title is rotated or stretched. Vertical centring uses font metrics; a
  browser's `middle` baseline can differ by a few percent of the font size.
- **Glyphs.** One font per title: characters the font lacks (emoji, CJK
  with a Latin default) draw as boxes; colour emoji are not supported.
- **Animated crop on a rotated clip** keeps the crop of the clip's start
  (the `rotate` filter needs frames of one size); pan and zoom still
  animate, and the job log carries a warning.
- **HDR and 10-bit** sources are converted to 8-bit BT.709 with the right
  matrix but are not tone-mapped. Interlaced sources are not deinterlaced.
- **Surround** sources are downmixed with FFmpeg's defaults, which are
  quieter than Web Audio's.
- **Animated GIF** plays once and holds its last frame; animated WebP and
  VP9 alpha are not decoded by FFmpeg's native decoders.
- **Markers** are not written as chapters.
- The limiter has no counterpart in the preview, which simply clips.

## Tests

`node --test src/api/render/*.test.js` (under a minute; needs FFmpeg).

| File | What it proves |
| ---- | -------------- |
| `plan.test.js`, `planMix.test.js`, `units.test.js`, `support.test.js` | Graph structure and every pure module, without FFmpeg |
| `video.test.js` | Rendered pixels: layer order, offsets, mute/solo, the dissolve rule, fades, contain/cover, crop, opacity, flip, rotation, stills, PNG alpha; stream layout per preset |
| `motion.test.js` | Ken burns, range renders, rotation metadata, EXIF, non-square pixels, frame-rate/pixel-format/colour conformance |
| `frames.test.js` | Frame accuracy with numbered frames: the exact frame at every clip start and cut (MP4 and Matroska), 60 and 24 fps conform, range renders pick the same frames |
| `oracle.test.js` | Rendered placement, opacity and gain equal the shared maths the preview uses (`placeSource`, `resolveTransform`, `videoOpacity`, `clipGain`) |
| `titles.test.js` | Title position, colours, box, hostile text, alignment, opacity/fades, scale/rotation, fonts |
| `audio.test.js` | Measured levels: gain, fades, equal-gain cross-fade, placement, mute/solo, silence, limiter |
| `segments.test.js` | Segment planning; a segmented render equals the single-pass render frame for frame |
| `routes.test.js` | Every route, the job result, listing, range serving, deletion, refusals, cancellation and cleanup |

Renders are 320×180 and a few seconds long; pixels are read back as raw RGB
and tones with a single-bin DFT, so assertions are numeric.
