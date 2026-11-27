# Contributing to NearEdit

Thanks for helping. NearEdit is a no-build project: the files in `src/` are
exactly what the browser and Node run, so getting started takes a minute.

## Setup

You need **Node 22.9+** and **FFmpeg 6.1+** (`ffmpeg` and `ffprobe` on your
`PATH`). Nothing else is required to run the editor or the tests.

```bash
git clone https://github.com/techninja/nearedit.git
cd nearedit
npm install        # also vendors hybrids and builds the icon sprite
npm run dev        # http://localhost:6556, restarts on change
```

Put local settings in `.env.local` (git-ignored); see
[docs/app-spec/CONFIGURATION.md](docs/app-spec/CONFIGURATION.md).

## Before you open a pull request

```bash
npm run spec all   # format, lint, types, file-size limits, markdown, audit
npm test           # Node tests, then browser component tests
```

Both must pass. `npm run spec` auto-fixes formatting and lint where it can.
The browser tests need Chromium: run `npx playwright install chromium` once,
or point `CHROMIUM_PATH` at an installed one.

## How the code is organised

Start with [docs/app-spec/ARCHITECTURE.md](docs/app-spec/ARCHITECTURE.md).
The short version:

| You want to change… | Look in | Reference |
| ------------------- | ------- | --------- |
| What an edit does (move, trim, ripple, cross-fade) | `src/utils/edl/` | [EDL.md](docs/app-spec/EDL.md) |
| The timeline, panels, pages | `src/components/`, `src/pages/`, `src/utils/timeline/` | Clearstack docs in `docs/clearstack/` |
| What a frame looks like: text, generators, effects, keyframes | `src/utils/compose/` | [COMPOSITOR.md](docs/app-spec/COMPOSITOR.md) |
| Preview and audio playback | `src/utils/playback/` | ARCHITECTURE.md § Playback |
| A command or a shortcut | `src/utils/commands/`, `src/utils/keyboard/` | [VEGAS.md](docs/app-spec/VEGAS.md) |
| A server route | `src/api/` | [API.md](docs/app-spec/API.md) |
| Transcription, tagging, beats, scenes | `src/api/intelligence/` | [INTELLIGENCE.md](docs/app-spec/INTELLIGENCE.md) |
| The AI director or base edit | `src/api/director/`, `src/utils/director/` | [DIRECTOR.md](docs/app-spec/DIRECTOR.md) |
| Rendering | `src/api/render/` | [RENDER.md](docs/app-spec/RENDER.md) |
| The `nearedit` command line tool | `bin/` | COMPOSITOR.md § Authoring without the UI |

## House rules

The project follows the [Clearstack](docs/clearstack/CONVENTIONS.md)
conventions, enforced by `npm run spec`:

- **Small files.** Code files stay under 150 lines, tests under 300, docs
  under 500. When a file gets close, split it by responsibility — do not
  compress it.
- **No build step.** Plain ES modules and JSDoc types. No TypeScript, no
  bundler, no transpiler.
- **No `../` imports in frontend code.** Use the aliases (`#utils/…`,
  `#store/…`, `#atoms/…`, `#organisms/…`, `#pages/…`).
- **Think twice before adding a dependency.** The whole server runs on
  Express, `ws`, `ajv` and `jsonrepair`; the browser on hybrids.

And a few that are specific to NearEdit:

- **The EDL is the only truth.** Preview, render and director all read the
  same document. If you add a field, add it to the factories in
  `src/utils/edl/`, the normaliser, and EDL.md.
- **Edits are pure functions.** Operations in `src/utils/edl/` take a
  document and return a new one. In the browser, every change goes through
  the edit session (`src/utils/editor/session.js`) so it is undoable.
- **Preview and render must agree.** Both use `src/utils/edl/geometry.js`
  and `levels.js`. Change the maths there, never in one consumer.
- **The AI proposes, code disposes.** An LLM may choose what to use; it
  never writes timing or file paths into a timeline. Deterministic code does.
- **Local first.** A feature must degrade gracefully when no AI provider is
  configured. Never make a network service a hard requirement.
- **Paths are untrusted.** Any path that arrives in a request goes through
  `src/api/lib/paths.js`.

## Tests

- Pure logic and server code: `node:test`, in a `*.test.js` next to the code
  or under `tests/`. Server tests start the real routers on an ephemeral
  port and generate their own small media with FFmpeg.
- Components: web-test-runner, in a `*.test.js` next to the component.
- Prefer asserting on numbers — pixels, sample levels, frame counts, the
  resulting document — over "it did not throw".
- AI-backed code is tested against local fakes that speak the real wire
  format. If you can run it against a real provider, say so in the PR.

## Adding things

- **A transcription or vision provider:** implement the provider interface
  in `src/api/intelligence/transcription/` or `vision/`, register it, add an
  availability check, and document its settings in CONFIGURATION.md and
  INTELLIGENCE.md.
- **A director action:** add its schema in `src/utils/director/`, its
  implementation in `src/api/director/actions/`, and describe it in
  DIRECTOR.md. It must return a DirectorResult that passes the invariant
  checks in the director tests.
- **A generator or an effect:** one module in
  `src/utils/compose/generators/` or `effects/` — a parameter schema and a
  draw function — registered in that folder's `index.js`. The editor's
  controls, the keyframe buttons, the catalog and the render all follow
  from the schema. It must be deterministic: no `Math.random`, no clocks,
  no state kept between frames; lengths in output pixels times
  `frame.scale`. Add a case to `tests/compose/cases/` so the server canvas
  and the browser are compared pixel by pixel, and describe it in
  EFFECTS.md or COMPOSITOR.md.
- **An icon:** add the lucide name to `scripts/icon-map.js` and run
  `node scripts/build-icons.js`.

## Reporting bugs

Use the issue templates. For a render or playback problem, the saved EDL
(`.nearedit/project.json` in your project folder) and the output of
`POST /api/render/plan` are the most useful things to attach.
