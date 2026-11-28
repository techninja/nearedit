# NearEdit

**A browser-based, Vegas-style video editor with an AI assistant editor —
running next to your footage, on your own machine.**

NearEdit pairs a fast, direct-manipulation timeline (drag a clip over
another and you get a cross-fade) with local media analysis: word-level
transcripts, beats, scene cuts and visual tags. An automatic base edit and
an optional AI director turn that data into a rough cut. The result is an
ordinary timeline you can then fine-tune by hand — never a black box.

```text
State (JSON EDL)  →  UI (canvas timeline + preview)  →  headless render (canvas + FFmpeg)
        ↑
  base edit / AI director  (only ever proposes timeline changes)
```

- **Your media stays put.** Source files are never modified or uploaded.
  The server runs where the footage is; you edit from any browser on your
  network, desktop or phone.
- **Works with FFmpeg alone.** Transcription, vision tagging and the LLM
  are optional, pluggable, and can all be local.
- **No build step.** Plain ES modules and web components; what is in
  `src/` is what runs.

## What it does

### Edit

- Multi-track canvas timeline: video tracks layered front to back, audio
  tracks mixed together, zoom from single frames to hours.
- Move, trim, slip, split, ripple; linked picture and sound; groups;
  copy / paste / duplicate; markers; loop region; snapping to clip edges,
  markers, the playhead and the beats of your music.
- **Overlap means cross-fade.** Drag one clip over another for a dissolve;
  pull them apart and it is gone. Drag a clip's top corners for fades.
- Stills with ken-burns moves, per-clip position, scale, rotation,
  opacity and crop — on the preview itself, with handles and snapping;
  per-track mute, solo, lock, volume, opacity and blend mode.
- **Keyframes** on almost every number and colour: transforms, volume,
  text, generator and effect parameters, with ten easings. Fade curves.
- Time selection, regions, ripple modes, slip, slide and roll, paste
  insert and paste repeat, and a **Vegas keymap** beside the default one.
- Undo for everything, including whatever the director did. Autosave.
- Real-time preview in the browser with every audio track playing.
- Mouse, keyboard and touch. Remappable shortcuts.

### Create

- **Generators** — clips that need no media: solid, gradient, shape,
  pattern, noise, and a **particle system** with thirteen presets (snow,
  sparks, confetti, star field…) that can also throw your own images.
- **Text** in five bundled font families with colour emoji, outline, box
  and shadow, animated in and out by block, line, word or letter.
- **Effects** on clips and on whole tracks, stacked and reordered: colour
  correction, blur, glow, drop shadow, vignette, grain, scanlines,
  pixelate, RGB split, mirror, chroma key, mask, wipe — and ready-made
  looks built from them.
- **Music clips** — a drum machine and a synth in the timeline: step
  patterns, a piano roll, four drum kits and eleven synth sounds, helpers
  that write a bass line or an arpeggio over a chord progression, MIDI in
  and out. It plays in the page as you edit and renders identically on the
  server, with nothing to install.
- **Web clips** — footage of a real web page being used, without anyone
  recording a screen: give an address, click what should be clicked on a
  picture of the page, set how long things take, and NearEdit plays it in
  a headless browser frame by frame — smooth cursor, hovers, typing,
  scrolling — and records it. Change a step and record again. Zoom in on
  the clicks with ordinary keyframes.
- What you see is what renders: the preview and the server draw every
  frame with the same code.

### Analyse (locally)

- **Transcripts** with word timestamps — whisper.cpp, faster-whisper, or any
  OpenAI-compatible speech server.
- **Beats and tempo**, **scene cuts**, **silences** — built in, no model
  needed.
- **Visual tags** and descriptions from a vision model (Ollama or any
  OpenAI-compatible server).
- Everything is cached in a small sidecar file beside each media file and
  is searchable.

### Assemble

- **Base edit** — an automatic rough cut with no AI at all: speech with the
  dead air removed, B-roll picked by scene, music cut on the beat.
- **AI director** — describe the edit; a local LLM chooses what to use and
  deterministic code does all the timing on word, scene and beat
  boundaries. Replace the timeline, append, insert at the cursor, or redo
  just a range.
- **Text-based editing** — cut, keep or insert by selecting words in the
  transcript.
- Remove silences, sync cuts to the beat, add captions, find B-roll.
- **Site demo** — give an address and say what to show in plain lines
  (`click Pricing`, `type hello@example.com into Email | sign up in
  seconds`, or nothing at all for a tour): the director finds those things
  on the page, records the visit, zooms in on what matters, captions each
  stop and frames the page as a window on a background. Every part of it
  stays editable — the steps, the timing, the zooms, the words.
- **Score** — music written for the timeline in one of ten styles: the
  tempo is fitted so it ends with the picture, sections change at your
  markers, and it drops under speech and comes back in the gaps. It is an
  ordinary music clip: open it and change any note.
- **Motion piece** — type a few lines and get a title sequence made only
  of generated layers (animated backgrounds, particles, shapes, titles) in
  one of eight themes, fitted to 16:9, 9:16 or 1:1. No media, and no AI
  unless you want it to write the plan.

### Deliver

- **Adaptations**: one project, many timelines — a 16:9 long-form with 9:16
  and 1:1 versions nested under it.
- Headless rendering as a background job, with progress, cancel and a
  browser notification when it is done.
- **No editor needed:** `nearedit render timeline.json` draws frames,
  checks and renders a timeline from a shell — see
  [examples](examples/README.md) for a piece made of generators alone.

## Quick start

You need **Node 22.9+** and **FFmpeg 6.1+** (`ffmpeg` and `ffprobe` on your
`PATH`).

```bash
git clone https://github.com/techninja/nearedit.git
cd nearedit
npm install
npm start
```

Open <http://localhost:6556>, create a project by picking a folder of
footage, press **Analyse project**, then open the editor and run **Base
edit** in the Director tab. Tweak, then **Export**. Press `?` in the editor
for the shortcuts.

To record web pages (web clips) NearEdit needs one extra browser build,
which it never downloads by itself:

```bash
npm run install-browser
```

By default the folder browser can see your home directory. To use footage
elsewhere, set `BROWSE_ROOTS` in `.env.local`:

```bash
BROWSE_ROOTS=/mnt/footage,/home/me/Videos
```

### Docker

```bash
docker compose up -d      # after editing the two paths in compose.yaml
```

The image contains only the server and FFmpeg; AI providers stay external.

## Turning on the AI parts

All optional. Without them you still get the editor, beats, scenes,
silences, the base edit and rendering.

| Feature | Easiest local option | Setting |
| ------- | -------------------- | ------- |
| Transcripts | `pip install faster-whisper`, or whisper.cpp | `TRANSCRIBE_PROVIDER` (auto-detected) |
| AI director | [Ollama](https://ollama.com) with a model such as `qwen3:14b` | `LLM_PROVIDER`, `OLLAMA_URL`, `OLLAMA_MODEL` |
| Visual tags | Ollama with a vision model such as `llava:7b` | `VISION_PROVIDER`, `VISION_MODEL` |

Any OpenAI-compatible server works for all three. The project page shows
which providers NearEdit can actually reach. Step-by-step setup:
[INTELLIGENCE.md](docs/app-spec/INTELLIGENCE.md) and
[CONFIGURATION.md](docs/app-spec/CONFIGURATION.md).

## Security

NearEdit is meant for a machine and a network you trust. Out of the box it
listens on every interface with **no login**, so anyone who can reach the
port can browse the allowed media folders and start renders.

- On a shared network, set `NEAREDIT_PASSWORD`.
- To keep it to one machine, set `HOST=127.0.0.1`.
- For access over the internet, put it behind an HTTPS reverse proxy.

The browser that records web clips refuses private addresses —
`localhost`, your LAN, cloud metadata — unless `WEB_CAPTURE_ALLOW` lists
them, so that someone who can reach NearEdit cannot use it to look around
your network. To record your own app in development:
`WEB_CAPTURE_ALLOW=localhost:5173`.

The server only reads inside registered project folders, their extra media
folders and `GLOBAL_MEDIA_PATHS`. Details:
[CONFIGURATION.md](docs/app-spec/CONFIGURATION.md#access-and-security).

## Status and limits

NearEdit is young. Things worth knowing before you rely on it:

- **Browsers:** developed and tested in Chromium. Firefox, Safari and iOS
  are untested.
- **Playback** uses media elements, so it is frame-accurate when paused but
  not sample-accurate at loop points; scrubbing is silent.
- **Playback speed** is always 1× — there is no time-stretch.
- **Rendering** is H.264 + AAC in MP4, 8-bit; HDR sources are converted
  without tone-mapping. Long timelines render in segments. Plain footage
  goes through FFmpeg's filter graph; anything with text, generators,
  effects or keyframes is drawn by the compositor, which is slower
  (roughly 15–25 frames per second at 1080p on four cores).
- **Text** uses the bundled fonts only; you cannot add your own yet.
- **AI providers:** faster-whisper and all FFmpeg-based analysis are
  exercised for real in development; whisper.cpp, Ollama and
  OpenAI-compatible servers are tested against local fakes that speak
  their wire format. Reports from real setups are very welcome.
- Effects are built in; there is no plugin interface for third-party
  ones, and no audio effects.
- **Music** is one synth design and synthesised drums — basses, pads,
  plucks, leads, electronic kits — not pianos or orchestras (no sample
  playback yet). Its sounds were tuned by measurement, not by ear.
- **Web clips** need `chrome-headless-shell` and have been exercised on
  Linux against local pages; video and WebGL inside a page are not stepped
  with it, a link that opens a new tab is not followed, and a site
  reachable only through a system proxy cannot be recorded.

## Documentation

| Document | Covers |
| -------- | ------ |
| [App specification](docs/app-spec/README.md) | Projects, adaptations, sidecars, shortcuts |
| [Architecture](docs/app-spec/ARCHITECTURE.md) | Layers, state, pipelines, conventions |
| [EDL](docs/app-spec/EDL.md) | The timeline document and the editing rules |
| [Compositor](docs/app-spec/COMPOSITOR.md) | Generators, effects, keyframes and text; authoring from a shell |
| [Effects](docs/app-spec/EFFECTS.md), [Particles](docs/app-spec/PARTICLES.md) | Every effect and the particle system |
| [Web clips](docs/app-spec/WEBCLIP.md) | Scripted recordings of real web pages: steps, targets, the recorder, what it may load |
| [Music clips](docs/app-spec/MUSIC.md) | The song model, the synth engine, kits and presets, MIDI |
| [Vegas parity](docs/app-spec/VEGAS.md) | Commands, the two keymaps, selection and ripple behaviour |
| [API](docs/app-spec/API.md) | HTTP + WebSocket API |
| [Configuration](docs/app-spec/CONFIGURATION.md) | Environment variables, access and security |
| [Intelligence](docs/app-spec/INTELLIGENCE.md) | Transcription, tagging, beats, scenes |
| [Director](docs/app-spec/DIRECTOR.md), [motion pieces](docs/app-spec/DIRECTOR-MOTION.md), [site demos](docs/app-spec/DIRECTOR-WEB.md), [scores](docs/app-spec/DIRECTOR-SCORE.md) | Director actions, edit plans, base edit; generated sequences; demos of web pages; music for a timeline |
| [Render](docs/app-spec/RENDER.md) | How a timeline becomes a file: filter graph, canvas path, segments |
| [Clearstack](docs/clearstack/) | The no-build web-component conventions the code follows |

## Development

```bash
npm run dev        # server with reload
npm test           # Node tests + browser component tests
npm run spec all   # format, lint, types, size limits, markdown, audit
```

See [CONTRIBUTING.md](CONTRIBUTING.md). Built on the
[Clearstack](https://github.com/techninja/clearstack) specification:
[hybrids](https://hybrids.js.org) web components, Express, and FFmpeg.

## License

[MIT](LICENSE)
