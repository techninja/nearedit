# NearEdit Architecture

NearEdit is a browser-based, Vegas-style non-linear editor with an AI
assistant editor. A Node server next to your media does the heavy lifting
(FFmpeg, transcription, LLM calls); the browser is a fast canvas timeline.

```text
State (JSON EDL)  →  UI (canvas timeline + preview)  →  headless render (canvas + FFmpeg)
        ↑
  AI director / base edit  (only ever mutates the EDL)
```

Three rules hold the design together:

1. **The EDL is the only truth.** Preview, render and director all consume
   the same document ([EDL.md](./EDL.md)). Source media is never modified.
2. **Automation proposes, the editor disposes.** Every automated action
   yields an ordinary, undoable EDL change that can be hand-tuned.
3. **Local first.** Everything works with FFmpeg alone. Transcription,
   vision tagging and the LLM are optional, pluggable providers.

## Layers

| Layer | Location | Runs in | Notes |
| ----- | -------- | ------- | ----- |
| EDL core | `src/utils/edl/` | browser + Node | Pure functions, no DOM, Node-tested |
| Director core | `src/utils/director/` | browser + Node | Action schemas, plan schema, shared helpers |
| Compositor | `src/utils/compose/` | browser + Node | Draws one frame of a document on a Canvas 2D context: footage, text, generators, effects, keyframes. Deterministic; the preview and the render both call it |
| Timeline UI | `src/utils/timeline/`, `organisms/timeline-*` | browser | Canvas drawing + pointer/keyboard interaction |
| Commands | `src/utils/commands/`, `src/utils/keyboard/` | browser | Every action as a named command; two keymap presets (NearEdit, Vegas) |
| Playback | `src/utils/playback/`, `organisms/video-preview` | browser | Hosts the compositor for the preview; Web Audio mixer; transport |
| Panels | `src/components/`, `src/pages/` | browser | Media bin, inspector, transcript, director, export |
| Edit session | `src/utils/editor/` | browser | Holds the document; the one door for changes: commit, undo, gestures, autosave |
| Stores | `src/store/` | browser | `TimelineState` (change signal), `ViewState` (transient), `ProjectState`, `AppState` |
| Server lib | `src/api/lib/` | Node | Config, registry, sidecars, scanning, path safety, FFmpeg, jobs |
| Compositor host | `src/api/compose/` | Node | The same compositor on `@napi-rs/canvas`, with the bundled fonts |
| Render | `src/api/render/` | Node | EDL → segments → FFmpeg filter graph (plain footage) or canvas frames piped to FFmpeg (everything else) |
| CLI | `bin/` | Node | `nearedit render / frame / validate / catalog` — the renderer without the server |
| Intelligence | `src/api/intelligence/` | Node | Providers + analysis steps → sidecars |
| Director | `src/api/director/` | Node | LLM client, prompts, plan → fragment, base edit |
| Routers | `src/api/*.js` | Node | Thin Express routers, one per domain |

Isomorphic code (`src/utils/edl`, `src/utils/compose`, `src/utils/director`) is imported by the
browser through the import map (`#utils/…`) and by Node through the
`imports` field of `package.json` — the same specifier works in both.

## State

- **The document** — `fps`, `resolution`, `tracks`, `markers` and whatever
  tracks and clips carry — is a plain object held by the **edit session**
  (`src/utils/editor/session.js`), in memory, and nowhere else. Read it with
  `getDoc()`. The editor page loads it from, and debounce-saves it to,
  `PUT /api/projects/:id/edl/:aid`. Only document changes enter the undo
  history.
- **`TimelineState`** — a change signal, not the document: `revision`,
  `fps`, `resolution`, `duration`, `trackCount`, `clipCount`. The session
  writes this summary after every document change, raising `revision` by
  one; nothing else writes it.
- **`ViewState`** — playhead, cursor, zoom, scroll, selection, snapping,
  ripple, loop. Never undoable. Playback ticks touch only this small model.
- **`AppState`** — theme and panel layout, persisted to `localStorage`.

The document stays out of the store on purpose. A hybrids model silently
drops every property it does not declare, and tracks and clips carry
open-ended data (effect stacks, generator parameters, keyframe maps).
Copying a large document into a model also costs milliseconds per edit, and
`store.set` lands a microtask later while a drag edits on every pointer
move.

Whoever needs the document reads the session's. What differs is how each
reader learns that it changed:

- A component that draws tracks, clips or markers declares
  `doc: liveDoc()` (`src/utils/editor/liveDoc.js`): the current document,
  re-read and re-rendered whenever `TimelineState` is written. One that
  shows only what the summary holds declares
  `timeline: store(TimelineState)`.
- Canvas code and controllers subscribe with `onDocChange()`, which is
  called synchronously on every change, and schedule their own redraw.
- Playback calls `getDoc()` on every frame, so an edit made while playing —
  a drag still in progress included — is seen and heard on the next frame.
- Event handlers call `getDoc()` at the moment they act. Nobody keeps a
  document: operations never mutate, so every change is a new object.

During a drag `TimelineState` is written once per animation frame, not once
per pointer move; every other change is written at once.

An edit is always `edit(doc => operation(doc, …))`: the session pushes the
current document to undo history, stores the result of a pure operation
from `src/utils/edl/`, and notifies autosave. A drag wraps its moves in
`beginGesture()` … `endGesture()`, so it previews live and undoes as one
step. `src/utils/editor/project.js` opens an adaptation, debounce-saves it
and reports dirty / error state through `ProjectState`.

## Playback

The transport (`src/utils/playback/transport.js`) owns the clock. While
playing, a Web Audio `AudioContext` is the master clock; the compositor
draws whichever frame the clock points at and video elements are kept
within a frame of it. All audible audio clips are mixed through gain nodes
(`track.volume × clip.volume × fade`). When paused, moving the playhead
seeks ("scrub") and composites exact frames.

Preview and render agree because they are the same code: both call
`drawFrame` of the compositor ([COMPOSITOR.md](./COMPOSITOR.md)), which
implements the placement algorithm in [EDL.md](./EDL.md#transform).

## Server pipelines

**Jobs.** `lib/jobRunner.js` `runJob(type, params, meta, worker)` runs
workers in concurrency lanes (`render`, `analysis`, `llm`), gives each an
`AbortSignal`, and broadcasts every status change over `/ws`.

**Analysis.** `probe → silence → scenes → beats → transcribe → tags`
(scenes feed frame selection for tagging, silences feed upload chunking).
Each step is independent, idempotent, and merges its output into the file's
sidecar with `lib/sidecar.js` `updateSidecar`. A step whose provider is
missing is skipped, never fatal. See [INTELLIGENCE.md](./INTELLIGENCE.md).

**Director.** `directive → gather sidecar context → (LLM edit plan |
heuristic plan) → validate → align to word / scene / beat boundaries →
DirectorResult fragment`. The LLM only ever chooses *what* to use; all
timing maths is deterministic code. See [DIRECTOR.md](./DIRECTOR.md).

**Render.** `EDL → normalise → segments at clip boundaries → file in
data/renders/`. A segment of plain footage becomes an FFmpeg filter graph
(per-clip trim, scale, crop, fade, overlay). A segment with text,
generators, effects, keyframes or blend modes is drawn frame by frame by
the compositor in worker processes and piped into the same encoder. Audio
is always an FFmpeg graph (delay, gain, fade curves, volume envelopes,
mix). Segments are joined without re-encoding. See [RENDER.md](./RENDER.md).

**Safety.** Every path from a request passes `lib/paths.js` (allowed media
roots only; symlinks resolved). `lib/auth.js` optionally puts the whole
server behind a password. See
[CONFIGURATION.md](./CONFIGURATION.md#access-and-security).

## Providers

| Capability | Providers | Config |
| ---------- | --------- | ------ |
| Transcription | `whisper-cpp`, `faster-whisper`, `openai` (any compatible server), `ssh`, `none` | `TRANSCRIBE_PROVIDER` |
| Vision tags | `ollama`, `openai`, `none` | `VISION_PROVIDER` |
| Director LLM | `ollama`, `openai`, `none` | `LLM_PROVIDER` |
| Beats, scenes, silence, waveforms, thumbnails | built in (FFmpeg + JS DSP) | — |

See [CONFIGURATION.md](./CONFIGURATION.md).

## Conventions

The project follows the Clearstack specification in `docs/clearstack/`.
`npm run spec` must pass: files ≤ 150 lines (tests ≤ 300, docs ≤ 500),
ESLint, Prettier, Stylelint, type-check (JSDoc + `tsc`), no `../` imports in
frontend code, markdown lint, `npm audit`.

- One job per file. When a file nears 150 lines, split by responsibility.
- Components: light DOM (`shadow: false`), co-located CSS, atomic tiers
  (`atoms → molecules → organisms → pages`), design tokens from
  `src/styles/tokens.css`.
- Utilities never touch the store unless they are explicitly controllers.
- Server routers stay thin; logic lives in the domain folder beside them.
- No build step and no new runtime dependencies without a strong reason.
- Tests: pure logic and server code run under `node --test`
  (`*.test.js` beside the code, or `tests/`); components run in the browser
  via web-test-runner.
