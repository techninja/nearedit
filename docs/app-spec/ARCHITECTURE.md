# NearEdit Architecture

NearEdit is a browser-based, Vegas-style non-linear editor with an AI
assistant editor. A Node server next to your media does the heavy lifting
(FFmpeg, transcription, LLM calls); the browser is a fast canvas timeline.

```text
State (JSON EDL)  →  UI (canvas timeline + preview)  →  FFmpeg (headless render)
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
| Timeline UI | `src/utils/timeline/`, `organisms/timeline-*` | browser | Canvas drawing + pointer/keyboard interaction |
| Playback | `src/utils/playback/`, `organisms/video-preview` | browser | Compositor, Web Audio mixer, transport |
| Panels | `src/components/`, `src/pages/` | browser | Media bin, inspector, transcript, director, export |
| Edit session | `src/utils/editor/` | browser | The one door for document changes: commit, undo, gestures, autosave |
| Stores | `src/store/` | browser | `TimelineState` (document), `ViewState` (transient), `ProjectState`, `AppState` |
| Server lib | `src/api/lib/` | Node | Config, registry, sidecars, scanning, path safety, FFmpeg, jobs |
| Render | `src/api/render/` | Node | EDL → `filter_complex` → FFmpeg job |
| Intelligence | `src/api/intelligence/` | Node | Providers + analysis steps → sidecars |
| Director | `src/api/director/` | Node | LLM client, prompts, plan → fragment, base edit |
| Routers | `src/api/*.js` | Node | Thin Express routers, one per domain |

Isomorphic code (`src/utils/edl`, `src/utils/director`) is imported by the
browser through the import map (`#utils/…`) and by Node through the
`imports` field of `package.json` — the same specifier works in both.

## State

- **`TimelineState`** — the document: `fps`, `resolution`, `tracks`,
  `markers`. In memory; the editor page loads it from, and debounce-saves it
  to, `PUT /api/projects/:id/edl/:aid`. Only document changes enter the undo
  history.
- **`ViewState`** — playhead, cursor, zoom, scroll, selection, snapping,
  ripple, loop. Never undoable. Playback ticks touch only this small model.
- **`AppState`** — theme and panel layout, persisted to `localStorage`.

`store.set` is asynchronous (the new value is visible a microtask later),
and editing is faster than that. So the **edit session**
(`src/utils/editor/session.js`) holds the authoritative document as a plain
object and mirrors it into `TimelineState` for rendering. Nothing else
writes `TimelineState`.

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

Preview and render must agree on geometry — both implement the placement
algorithm in [EDL.md](./EDL.md#transform).

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

**Render.** `EDL → normalise → filter graph (per-clip trim, scale, crop,
fade, overlay; audio delay, gain, mix) → FFmpeg with -progress → file in
data/renders/`. Long timelines are cut into segments at clip boundaries and
joined without re-encoding. See [RENDER.md](./RENDER.md).

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
