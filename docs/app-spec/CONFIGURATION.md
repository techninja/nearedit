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
| `NEAREDIT_DATA_DIR` | `./data` | Registry, renders, preview and transcode caches |
| `NEAREDIT_MEDIA_DIR` | `./media` | Fallback media folder when a project has none |
| `GLOBAL_MEDIA_PATHS` | empty | Comma-separated folders shared by every project (logos, stings, music) |
| `BROWSE_ROOTS` | home directory | Comma-separated folders the in-app folder browser may list |
| `RENDER_CONCURRENCY` | `1` | Simultaneous FFmpeg renders |
| `ANALYSIS_CONCURRENCY` | `1` | Simultaneous analysis jobs |

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
