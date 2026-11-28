# Configuration

NearEdit is configured with environment variables. Defaults live in the
committed `.env`; put your own values in `.env.local` (git-ignored), which
`npm run dev` loads on top. Variables are read in `src/api/lib/config.js`;
a few provider-specific ones (marked †) are read in
`src/api/intelligence/settings.js`. Both are read when used, not at start-up.

## Server

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `PORT` | `3000` (`6556` in `.env`) | HTTP + WebSocket port |
| `HOST` | every interface | Address to bind. Set `127.0.0.1` to accept connections from this machine only |
| `NEAREDIT_PASSWORD` | empty (no login) | When set, every page, API route, media file and WebSocket requires it (HTTP Basic) |
| `NEAREDIT_USER` | `nearedit` | User name that goes with the password |
| `NEAREDIT_DATA_DIR` | `./data` | Registry, renders, preview and transcode caches |
| `NEAREDIT_MEDIA_DIR` | `./media` | Fallback media folder when a project has none |
| `GLOBAL_MEDIA_PATHS` | empty | Comma-separated folders shared by every project (logos, stings, music) |
| `BROWSE_ROOTS` | home directory | Comma-separated folders the in-app folder browser may list |
| `RENDER_CONCURRENCY` | `1` | Simultaneous render jobs |
| `RENDER_ENGINE` | `auto` | `auto` uses the FFmpeg filter graph for plain footage and the canvas compositor for titles, generators, effects, keyframes and blend modes; `canvas` draws everything with the compositor; `ffmpeg` refuses (422) a timeline the filter graph cannot draw. See [RENDER.md](./RENDER.md) |
| `RENDER_WORKERS` | half the cores, 1–4 | Segments of one render drawn at once. Each worker at 1080p needs about 1 GB; set `1` on a small machine |
| `ANALYSIS_CONCURRENCY` | `1` | Simultaneous analysis jobs |
| `WEB_CAPTURE_CONCURRENCY` | `1` | Simultaneous web-clip recordings (each is a browser) |
| `MUSIC_RENDER_CONCURRENCY` | `2` | Songs of music clips rendered at once, each in a thread of its own; further requests wait. See [MUSIC.md](./MUSIC.md) |
| `CUTOUT_CONCURRENCY` | `1` | Person cutouts made at once. Each uses every core for its matting network, so more than one is rarely faster |

### Access and security

NearEdit is built to run on a machine you trust, next to your footage, and
to be opened from other devices on your network. Out of the box it listens
on every interface with no login, so anyone who can reach the port can
browse the allowed media folders, start renders and edit projects.

- On a shared or untrusted network, set `NEAREDIT_PASSWORD`. The browser
  asks once; a session cookie then covers media requests and the WebSocket.
- To keep it private to one machine, set `HOST=127.0.0.1`.
- For access over the internet, put it behind a reverse proxy that
  terminates HTTPS. Basic credentials are only as private as the connection.
- The server only ever reads inside registered project folders, their extra
  media folders, `GLOBAL_MEDIA_PATHS` and its own data directory, and the
  folder browser only lists directories under `BROWSE_ROOTS`.
- The `ssh` transcription provider has the remote machine fetch media back
  over HTTP. With a password set, the remote command must send it too.

## Web clips

Recording web pages ([WEBCLIP.md](./WEBCLIP.md)) needs
**chrome-headless-shell** — ordinary Chrome cannot be stepped frame by
frame. `npm run install-browser` downloads the current stable build from
Chrome for Testing into `<NEAREDIT_DATA_DIR>/browsers/` (about 280 MB) and
checks that it starts; nothing is downloaded otherwise. One installed by
Playwright (`npx playwright install chromium-headless-shell`, also for
Linux on ARM, which Chrome for Testing does not build) or Puppeteer is
found too. `GET /api/web/status` says what was found.

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `WEB_CAPTURE_BROWSER` | found automatically | Path of a chrome-headless-shell. When set, only this one is used. Otherwise: the installed copy, then Playwright's cache (`PLAYWRIGHT_BROWSERS_PATH`), then Puppeteer's (`PUPPETEER_CACHE_DIR`) |
| `WEB_CAPTURE_ALLOW` | empty | Private addresses the recording browser may load, comma-separated: `localhost:5173`, `intranet.example`, `*.staging.example.com`, `192.168.1.*:8080`, `[::1]:3000`. A pattern is compared with the host (and port, when given) as the page's address names it |
| `WEB_CAPTURE_NO_SANDBOX` | off | `1` starts Chrome without its sandbox. Needed when the server runs as root or in a container without user namespaces; leave it off elsewhere |

The recording browser reaches the network only through a filter inside
the server: every connection it asks for — the page, frames, scripts,
requests, web sockets, workers — is resolved there and refused when the
address is loopback, private (RFC 1918), link-local (cloud metadata
included), carrier-grade NAT, unique-local IPv6 or otherwise not public,
unless `WEB_CAPTURE_ALLOW` names the host. System proxy settings are not
used. Each recording has a fresh profile, removed afterwards; downloads,
permission requests and service workers are refused.

## Person cutout

Cutting a person out of a clip ([CUTOUT.md](./CUTOUT.md)) needs a **matte
program**. The built-in one is `workers/person_matte.py`: Python 3 with
`onnxruntime` and `numpy`, and a matting model. `npm run install-cutout`
downloads the model (MODNet as ONNX, Apache 2.0, 26 MB) into
`<NEAREDIT_DATA_DIR>/models/modnet.onnx`, loads it once, and says what the
Python side still lacks, with the `pip` command; nothing is downloaded
otherwise. `GET /api/cutout/status` says what was found. Setting it up:
[INTELLIGENCE.md](./INTELLIGENCE.md#person-cutout).

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `CUTOUT_PYTHON` | `FASTER_WHISPER_PYTHON`, else `python3` | Python with `onnxruntime` and `numpy` (name on `PATH` or full path) |
| `CUTOUT_MODEL` | `<NEAREDIT_DATA_DIR>/models/modnet.onnx` | The ONNX matting model. When set, only this file is used; otherwise the installed one, then the one in NearEdit's own `data/` (for the command line) |
| `CUTOUT_COMMAND` | empty | A matte program of your own, used instead of the built-in one: a command line, split into words without a shell (quote a path that has blanks), to which `--width W --height H --fps F` are added. It reads raw RGB frames on stdin and writes one 8-bit matte per frame on stdout |

## Director LLM

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `LLM_PROVIDER` | `ollama` | `ollama`, `openai` (any OpenAI-compatible chat API) or `none` |
| `LLM_URL` | `OLLAMA_URL` | Base URL of the service |
| `LLM_MODEL` | `OLLAMA_MODEL` or `qwen3:14b` | Model name |
| `LLM_API_KEY` | empty | Bearer token for `openai` providers |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Ollama base URL (shared default for LLM and vision) |
| `OLLAMA_MODEL` | `qwen3:14b` | Legacy alias of `LLM_MODEL` |

With `LLM_PROVIDER=none` (or an unreachable server) the deterministic
actions — base edit, silence removal, beat sync, captions — still work.

## Transcription

Setup guides for each provider: [INTELLIGENCE.md](./INTELLIGENCE.md#transcription).

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `TRANSCRIBE_PROVIDER` | `auto` | `auto`, `whisper-cpp`, `faster-whisper`, `openai`, `ssh`, `none` |
| `WHISPER_MODEL` | `base` | Model size/name: `tiny`, `base`, `small`, `medium`, `large-v3`… |
| `TRANSCRIBE_LANGUAGE` | auto-detect | Force a language code such as `en` |
| `WHISPER_CPP_BIN` | `whisper-cli` | whisper.cpp executable (name on `PATH` or full path) |
| `WHISPER_CPP_MODEL_PATH` | empty | A `ggml-*.bin` model file, or a directory holding `ggml-<WHISPER_MODEL>.bin`. Empty: `<NEAREDIT_DATA_DIR>/models/` is searched |
| `FASTER_WHISPER_PYTHON` | `python3` | Python with `faster-whisper` installed |
| `FASTER_WHISPER_DEVICE` † | `auto` | `auto`, `cpu` or `cuda` |
| `FASTER_WHISPER_COMPUTE_TYPE` † | `default` | CTranslate2 compute type, e.g. `int8` (CPU) or `float16` (GPU) |
| `TRANSCRIBE_URL` | empty | Base URL for the `openai` provider, with or without `/v1`. Empty with an API key set: `https://api.openai.com` |
| `TRANSCRIBE_API_KEY` | empty | Bearer token for the `openai` provider |
| `TRANSCRIBE_MODEL` † | see purpose | Model name sent by the `openai` provider. Default: `WHISPER_MODEL`, or `whisper-1` when that is a local size name such as `base` |
| `TRANSCRIBE_CHUNK_SECONDS` † | `600` | Longest piece of audio the `openai` provider uploads in one request (minimum 30) |
| `HYDRA_HOST` | empty | SSH destination for the `ssh` provider (`host`, `user@host` or an `~/.ssh/config` alias) |
| `TRANSCRIBE_SSH_COMMAND` | empty | Remote command for the `ssh` provider; may use `{url}`, `{model}`, `{language}` |
| `SERVER_HOST` | empty | Address the SSH host uses to fetch media back from this server (`http://SERVER_HOST:PORT`) |

`auto` picks the first provider that is actually usable, in the order
whisper-cpp, faster-whisper, openai, ssh — a provider counts as usable only
when its program, model or server is really there. The `openai` provider is
only considered when `TRANSCRIBE_URL` or `TRANSCRIBE_API_KEY` is set, and
`ssh` only when its three variables are. `GET /api/intelligence/status`
reports what was found.

## Vision tagging

Setup guides: [INTELLIGENCE.md](./INTELLIGENCE.md#visual-tagging).

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `VISION_PROVIDER` | `ollama` | `ollama`, `openai` (any OpenAI-compatible chat API that accepts images) or `none` |
| `VISION_URL` | `OLLAMA_URL` | Base URL of the service |
| `VISION_MODEL` | `llava:7b` | Vision-capable model |
| `VISION_API_KEY` | empty | Bearer token for `openai` providers |

Beat, scene and silence detection need no configuration: they use FFmpeg
and built-in DSP.

## Spec enforcement

`SPEC_CODE_MAX_LINES`, `SPEC_DOCS_MAX_LINES`, `SPEC_CODE_EXTENSIONS`,
`SPEC_DOCS_EXTENSIONS` and `SPEC_IGNORE_DIRS` configure `npm run spec`
(see `docs/clearstack/CONVENTIONS.md`).

## Tests

| Variable | Purpose |
| -------- | ------- |
| `CHROMIUM_PATH` | Use a system Chromium for browser tests instead of the Playwright download |
