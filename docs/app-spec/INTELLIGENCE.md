# Media Intelligence

NearEdit analyses every media file once and stores what it learns in the
file's sidecar (`<file>.nearedit.json`). The AI director and the editor UI
read those sidecars; nothing here ever modifies source media.

Everything works with FFmpeg alone. Transcription and visual tagging are
optional and pluggable — run them locally, on another machine, or through
any OpenAI-compatible service.

Code: `src/api/intelligence/` (steps, providers, pipeline),
`src/api/intelligence.js` and `src/api/indexer.js` (routes),
`workers/` (helper scripts that run outside Node).
Routes and wire formats: [API.md](./API.md#intelligence).
Environment variables: [CONFIGURATION.md](./CONFIGURATION.md).

## Steps

| Step | Applies to | Needs | Writes to the sidecar |
| ---- | ---------- | ----- | --------------------- |
| `probe` | everything | FFmpeg (ffprobe) | `type`, `filename`, `size`, `duration`, `width`, `height`, `fps`, `codec`, `rotation`, `hasVideo`, `hasAudio`, `audioCodec`, `sampleRate`, `channels`, `bitrate`; text files: `content`, `sections`, `wordCount` |
| `silence` | audio, video with sound | FFmpeg | `silences: [{ start, end }]` |
| `scenes` | video | FFmpeg | `scenes: [{ start, end }]` |
| `beats` | audio, video with sound | FFmpeg (decode only) | `beats: number[]`, `bpm` |
| `transcribe` | audio, video with sound | a transcription provider | `transcript`, `segments`, `language`, `transcriptProvider` |
| `tags` | video, images | a vision provider | `tags`, `description`, `keyframes` |

Rules that hold for every step:

- **Independent.** A step that fails or is skipped never stops the others.
- **Idempotent.** A step whose result is already in a *fresh* sidecar is
  skipped. A sidecar is fresh while the source file's modification time has
  not changed; when the file changes, all old analysis is discarded.
- **`force: true`** runs the step again regardless.
- **Explicit options re-run a step** when they differ from what the sidecar
  was built with: asking for `threshold: 0.5` after scenes were detected at
  `0.3` runs detection again, no `force` needed. The same goes for
  `noiseDb`, `minDuration` and the transcription `language`.
- **Cancellable.** Cancelling the job kills the running FFmpeg/model process
  or aborts the HTTP request. Steps that already finished keep their result.
- **Probe first.** Any step run on a file that was never probed probes it
  first, because the other steps rely on `duration` and `hasAudio`.

Execution order is `probe → silence → scenes → beats → transcribe → tags`:
the cheap FFmpeg steps go first and feed the model-backed ones (scene starts
choose the frames to tag; silences choose where long audio is split for
upload).

### Outcomes

An `analyze` job reports one outcome per file and step:

| Outcome | Meaning |
| ------- | ------- |
| `ok` | Ran, sidecar updated |
| `skipped` | Result already present and fresh |
| `skipped: <reason>` | Not run: provider unusable, or (only when `steps` were named in the request) the step does not suit the file type |
| `error: <message>` | Ran and failed; other steps and files continue |

With the default step list, steps that do not suit a file (beats on an
image) are simply left out of its entry. The full explanation of an unusable
provider is written once to the job log; `GET /intelligence/status` shows it
at any time.

Single-step routes (`/intelligence/beats` …) answer `400` when the step does
not suit the file and `503` when its provider is unusable, before any job is
created. Their job result is `{ path, step, outcome, …summary }` — for
example `{ outcome: "ok", beats: 212, bpm: 128 }` — and the job itself fails
when the step fails.

`POST /index` (probe only) runs outside the analysis queue so the media bin
never waits behind a long transcription.

## Probe

Video, audio and images are read with ffprobe. `width` and `height` are the
stored (coded) dimensions and `rotation` the display rotation flag;
`displayWidth` / `displayHeight` are what a player shows after rotation.
Still images get dimensions but `duration: null` and `hasVideo: false`.

Text files are parsed instead:

| Extension | `subtype` | `sections` |
| --------- | --------- | ---------- |
| `.srt`, `.vtt` | `subtitle` | `[{ start, end, text }]` cues |
| `.ass` | `subtitle` | cues from `Dialogue:` lines |
| `.md` | `script` | `[{ heading, level, text }]` |
| `.txt` | `notes` | `[{ index, text }]` paragraphs |

`wordCount` counts spoken words (cue text only for subtitles),
`estimatedDuration` is the narration time at 150 words per minute, and
`content` is the file text (first 500,000 characters).

## Silence

FFmpeg `silencedetect`. Defaults: quieter than **-30 dB** for at least
**0.4 s** — on ordinary speech recordings that marks the pauses between
sentences. Override per request with `noiseDb` (lower, e.g. `-40`, for clean
studio audio; higher, e.g. `-25`, for noisy rooms) and `minDuration`; the
values used are stored as `silenceNoiseDb` and `silenceMinDuration`. A
silence that runs to the end of the file is closed at the file's duration.

## Scenes

FFmpeg's scene-change score on a 320-pixel-wide copy of the picture; a frame
scoring above `threshold` (default **0.3**, stored as `sceneThreshold`)
starts a new scene. Cuts closer than 0.3 s to the previous cut or to either
end of the file are ignored. `scenes` always covers the whole file, so a
video with no cuts has exactly one scene. Hard cuts are found to the frame;
slow dissolves may not be detected at all.

## Beats

No external tool or model: the audio is decoded to 22.05 kHz mono PCM by
FFmpeg and streamed through plain-JS DSP, so memory use does not grow with
the length of the file (one number per 11.6 ms of audio).

1. **Onset strength** — 1024-sample Hann frames every 256 samples, magnitude
   spectrum grouped into 32 logarithmic bands, log-compressed, and the
   positive change per band summed (spectral flux). The local average is
   removed so only peaks remain.
2. **Tempo** — autocorrelation of that envelope, scored for every tempo from
   40 to 200 BPM (reinforced by the peaks at twice and four times the
   period, weighted by a log-normal preference centred on 120 BPM).
3. **Beat tracking** — dynamic programming (Ellis, 2007) picks the beat
   sequence that best follows the onsets while staying near the tempo, so
   small tempo drift is tracked. Each beat is then refined to the nearest
   onset peak with sub-frame interpolation.

`bpm` is the median beat spacing of the tracked beats, rounded to 0.1.

**Octave policy.** Tempo is ambiguous by factors of two; NearEdit resolves it
the same way every time:

- among octave-related tempi in range, the one nearest 120 BPM wins;
- unless the faster one's off-beats are about as strong as its on-beats
  (autocorrelation at least 0.9 of the slower pulse) — then the faster wins.

So a 174 BPM metronome or drum pattern reads 174, drum-and-bass with a weak
backbeat reads 87, and a pulse above 200 BPM is reported at half speed.
Beats land on real onsets either way.

**No beat.** Silence, noise and speech have no stable pulse (periodicity
below 0.15): the result is `beats: []`, `bpm: null`. A tempo needs at least
about three beat periods of audio.

**Limits.** One tempo is estimated per file; a recording that changes tempo
substantially is tracked with the dominant one. Downbeats and bars are not
detected.

Accuracy measured in the test suite: tempo within 1 % and beats within 15 ms
on click tracks (90, 120, 128, 174 BPM); within 1.5 % and 20 ms on synthetic
kick/snare/hi-hat patterns; within 35 ms after an AAC round trip.

## Transcription

`transcript` holds one entry per word, `segments` the phrases:

```json
{
  "transcript": [{ "word": "Hello", "start": 0.52, "end": 0.84, "probability": 0.98 }],
  "segments": [{ "id": 0, "start": 0.52, "end": 3.1, "text": "Hello and welcome." }],
  "language": "en",
  "transcriptProvider": "faster-whisper"
}
```

`probability` is omitted when a provider does not report it. If a provider
returns no word timestamps at all, `transcript` is `[]` and `segments` still
carries the text — NearEdit never invents word timings.

Every provider receives 16 kHz mono audio extracted by NearEdit's own
FFmpeg, so anything the editor can play can be transcribed.

`TRANSCRIBE_PROVIDER` selects the provider. `auto` (the default) uses the
first one that is actually usable, in this order: `whisper-cpp`,
`faster-whisper`, `openai`, `ssh`. `none` turns transcription off.
`TRANSCRIBE_LANGUAGE` (or `language` in a request) forces a language;
otherwise it is detected.

### whisper-cpp

Local, CPU-friendly, no Python. Install
[whisper.cpp](https://github.com/ggml-org/whisper.cpp) so that `whisper-cli`
is on `PATH`, and download a model:

```bash
# from a whisper.cpp checkout
cmake -B build && cmake --build build -j --config Release
sh ./models/download-ggml-model.sh base
```

```ini
TRANSCRIBE_PROVIDER=whisper-cpp
WHISPER_CPP_BIN=/opt/whisper.cpp/build/bin/whisper-cli   # default: whisper-cli
WHISPER_CPP_MODEL_PATH=/opt/whisper.cpp/models/ggml-base.bin
```

`WHISPER_CPP_MODEL_PATH` may also be a directory: NearEdit then looks for
`ggml-<WHISPER_MODEL>.bin` in it. With the variable unset it looks in
`<NEAREDIT_DATA_DIR>/models/`.

NearEdit runs `whisper-cli -m <model> -f <wav> -l <lang|auto> -ojf -of <tmp>
-np -pp` and reads the full JSON file, merging whisper.cpp's sub-word tokens
into words (`Amer` + `icans` + `,` → `Americans,`). Word times come from
whisper.cpp's token timestamps, which are approximate; faster-whisper is
tighter if frame-accurate word cuts matter.

### faster-whisper

Local; uses a CUDA GPU when one is available.

```bash
python3 -m venv ~/nearedit-env
~/nearedit-env/bin/pip install faster-whisper
```

```ini
TRANSCRIBE_PROVIDER=faster-whisper
FASTER_WHISPER_PYTHON=/home/me/nearedit-env/bin/python3
WHISPER_MODEL=small                 # tiny, base, small, medium, large-v3, a HF repo or a local path
FASTER_WHISPER_DEVICE=auto          # auto | cpu | cuda
FASTER_WHISPER_COMPUTE_TYPE=default # e.g. int8 on CPU, float16 on GPU
```

NearEdit runs `workers/faster_whisper_transcribe.py` (see
[workers/README.md](../../workers/README.md)). The model is downloaded from
Hugging Face on first use.

### openai

Any server that implements `POST /v1/audio/transcriptions` with
`response_format=verbose_json` and word + segment timestamps: OpenAI, Groq,
LocalAI, speaches (faster-whisper-server) and similar.

```ini
TRANSCRIBE_PROVIDER=openai
TRANSCRIBE_URL=https://api.openai.com      # with or without /v1
TRANSCRIBE_API_KEY=sk-...
TRANSCRIBE_MODEL=whisper-1
```

| Service | `TRANSCRIBE_URL` | `TRANSCRIBE_MODEL` |
| ------- | ---------------- | ------------------ |
| OpenAI | `https://api.openai.com` | `whisper-1` (the model with word timestamps) |
| Groq | `https://api.groq.com/openai/v1` | `whisper-large-v3` |
| speaches | `http://localhost:8000` | `Systran/faster-whisper-small` |
| LocalAI | `http://localhost:8080` | the name of your whisper model |

Without `TRANSCRIBE_MODEL`, `WHISPER_MODEL` is sent — unless it is a local
size name such as `base`, which becomes `whisper-1`. With only
`TRANSCRIBE_API_KEY` set, the URL defaults to OpenAI.

Audio is uploaded as 16 kHz mono FLAC in pieces of at most
`TRANSCRIBE_CHUNK_SECONDS` (default 600 s, about 10 MB), so upload limits
are never hit; timestamps are shifted back to file time. When the file's
silences are known, each piece ends in the middle of a silence within the
last minute before the limit, so no word is cut in half — run the `silence`
step first (the default order does). Rate limits (429) and gateway errors
are retried twice.

This provider sends your audio to the configured server. `auto` only
considers it when `TRANSCRIBE_URL` or `TRANSCRIBE_API_KEY` is set.

### ssh

Run the transcription on another machine (a GPU box) over SSH. The remote
command downloads the media from this NearEdit server over HTTP
(`GET /api/media/file?path=…`) and prints transcript JSON on stdout.

```ini
TRANSCRIBE_PROVIDER=ssh
HYDRA_HOST=gpu@hydra                # anything `ssh` accepts; use ~/.ssh/config for ports and keys
SERVER_HOST=192.168.1.20            # how the remote machine reaches this server (PORT is appended)
TRANSCRIBE_SSH_COMMAND=~/nearedit-env/bin/python3 ~/nearedit/workers/faster_whisper_transcribe.py
```

The remote command line is
`<TRANSCRIBE_SSH_COMMAND> '<media url>' --model '<WHISPER_MODEL>' [--language '<code>']`.
For a different argument layout use placeholders — and do not put quotes
around them, NearEdit quotes each value itself:

```ini
TRANSCRIBE_SSH_COMMAND=docker exec whisper transcribe --input {url} --size {model} --lang {language}
```

The command must print one JSON document: `{ language, segments: [{ start,
end, text, words: [{ word, start, end, probability }] }] }` (a flat top-level
`words` list is accepted too). Lines printed before the JSON are ignored.

Security: `ssh` is started without a local shell, in batch mode (keys only,
it never prompts). `TRANSCRIBE_SSH_COMMAND` is your own configuration and is
passed to the remote shell as written; every other value is single-quoted
for a POSIX shell, and the media URL is percent-encoded. `HYDRA_HOST` may
not start with `-`. Cancelling a job closes the SSH connection; whether the
remote process stops depends on the remote command.

## Visual tagging

A vision model looks at a handful of frames (default 5, `frames` in the
request, at most 12; one for a still image) and answers with a description
and tags per frame. Frames are taken just after the start of each detected
scene — the longest scenes when there are more scenes than frames — and
spread evenly when scenes are unknown. Frames are sent as JPEGs no larger
than 768 pixels.

```json
{
  "tags": ["dog", "park", "wide shot"],
  "description": "A dog runs across a sunny park. Two children throw a ball.",
  "keyframes": [{ "time": 0.5, "tags": ["dog", "park"], "description": "A dog runs across a sunny park." }]
}
```

File-level `tags` are ordered by how many frames mention them; `description`
joins the distinct frame descriptions. Replies are parsed defensively (code
fences, prose around the JSON, broken JSON, tags as one comma-separated
string); a reply with no JSON at all is kept as the description. A frame
that fails is logged and skipped; the step only fails when every frame does.
Re-running `tags` replaces `tags`, including any edited by hand.

### ollama

```bash
ollama pull llava:7b
```

```ini
VISION_PROVIDER=ollama
VISION_URL=http://127.0.0.1:11434   # default: OLLAMA_URL
VISION_MODEL=llava:7b               # any vision-capable model: moondream, qwen2.5vl, llama3.2-vision…
```

Uses `POST /api/chat` with base64 images and `format: "json"`. The provider
counts as available only when the server answers and the model is pulled.

### openai (vision)

Any server with `POST /v1/chat/completions` that accepts image data URLs:
OpenAI, vLLM, llama.cpp server, LM Studio, LocalAI.

```ini
VISION_PROVIDER=openai
VISION_URL=https://api.openai.com
VISION_API_KEY=sk-...
VISION_MODEL=gpt-4o-mini
```

Only `model` and `messages` are sent, so servers that reject optional
parameters still work. This provider sends frames to the configured server.

## Status

`GET /intelligence/status` checks FFmpeg, the transcription provider, the
vision provider and the director's LLM in parallel, each with a short
timeout (1.5 s for HTTP checks, a few seconds for local programs), and
answers in well under a second when nothing is installed. `detail` says what
was found or what is missing. With `TRANSCRIBE_PROVIDER=auto`,
`transcription.provider` is the provider that was picked, or `auto` with the
reason each candidate was rejected.

## Transcript export and search

`GET /intelligence/transcript?path=&format=` returns `json` (words,
segments, text), `srt`, `vtt` or `txt`; add `download=1` for a
`Content-Disposition: attachment` header. Subtitle cues are the transcript's
segments; a transcript that has only words is grouped into cues of at most
10 words or 5 seconds, split at pauses of 0.8 s.

`GET /index/search?q=&projectId=&limit=` looks for every query word in a
file's name, tags, description, keyframes, transcript and (text files)
content. A file matches when each word is found somewhere. Results are
ranked and carry match information instead of sidecars:

```json
{
  "filename": "park.mp4", "filePath": "/abs/park.mp4", "relativePath": "day1/park.mp4",
  "type": "video", "global": false, "duration": 14.08, "score": 7, "matchCount": 3,
  "matches": [
    { "field": "tag", "text": "dog" },
    { "field": "keyframe", "text": "A dog jumps for a ball., dog, ball", "time": 2 },
    { "field": "transcript", "text": "Look at the dog!", "start": 4, "end": 5, "time": 4.6 }
  ]
}
```

`time` on a transcript match is where the first matching word is spoken. At
most five matches per field are listed; `matchCount` is the total. Files
that were never indexed still match on their name.

## Adding a provider or a step

A transcription provider is an object `{ name, available(), transcribe(filePath,
options) }` registered in `src/api/intelligence/transcription/index.js`;
`available()` must be cheap, time-limited and never throw. A vision provider
is `{ name, available(), describe(jpeg, options) }` in
`src/api/intelligence/vision/index.js`. A step is one object (see
`steps/types.js`) added to `steps/index.js`. Providers receive their process
runner and `fetch` as arguments, which is how the tests drive them without
the real tools.
