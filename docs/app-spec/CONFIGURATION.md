# Configuration

NearEdit is configured with environment variables. Defaults live in the
committed `.env`; put your own values in `.env.local` (git-ignored), which
`npm run dev` loads on top. Every variable is read in one place:
`src/api/lib/config.js`.

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

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `TRANSCRIBE_PROVIDER` | `auto` | `auto`, `whisper-cpp`, `faster-whisper`, `openai`, `ssh`, `none` |
| `WHISPER_MODEL` | `base` | Model size/name passed to the provider |
| `TRANSCRIBE_LANGUAGE` | auto-detect | Force a language code such as `en` |
| `WHISPER_CPP_BIN` | `whisper-cli` | whisper.cpp executable |
| `WHISPER_CPP_MODEL_PATH` | empty | Path to a `ggml-*.bin` model file |
| `FASTER_WHISPER_PYTHON` | `python3` | Python with `faster-whisper` installed |
| `TRANSCRIBE_URL` | empty | Base URL for the `openai` provider (`/v1/audio/transcriptions`) |
| `TRANSCRIBE_API_KEY` | empty | Bearer token for the `openai` provider |
| `HYDRA_HOST` | empty | SSH host for the `ssh` provider |
| `TRANSCRIBE_SSH_COMMAND` | empty | Remote command for the `ssh` provider |
| `SERVER_HOST` | empty | Address the SSH host uses to fetch media back from this server |

`auto` picks the first provider that is actually usable, in the order
whisper-cpp, faster-whisper, openai, ssh.

## Vision tagging

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `VISION_PROVIDER` | `ollama` | `ollama`, `openai` or `none` |
| `VISION_URL` | `OLLAMA_URL` | Base URL of the service |
| `VISION_MODEL` | `llava:7b` | Vision-capable model |
| `VISION_API_KEY` | empty | Bearer token for `openai` providers |

## Spec enforcement

`SPEC_CODE_MAX_LINES`, `SPEC_DOCS_MAX_LINES`, `SPEC_CODE_EXTENSIONS`,
`SPEC_DOCS_EXTENSIONS` and `SPEC_IGNORE_DIRS` configure `npm run spec`
(see `docs/clearstack/CONVENTIONS.md`).

## Tests

| Variable | Purpose |
| -------- | ------- |
| `CHROMIUM_PATH` | Use a system Chromium for browser tests instead of the Playwright download |
