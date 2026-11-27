# Workers

Helper scripts that run outside Node. NearEdit's server starts them as child
processes (always with an argument array, never through a shell); they can
also be run by hand or on another machine.

## faster_whisper_transcribe.py

Speech-to-text with word-level timestamps through
[faster-whisper](https://github.com/SYSTRAN/faster-whisper). Used by the
`faster-whisper` transcription provider and usable as the remote command of
the `ssh` provider.

### Setup

```bash
python3 -m venv ~/nearedit-env
~/nearedit-env/bin/pip install faster-whisper
```

Point NearEdit at that interpreter:

```ini
TRANSCRIBE_PROVIDER=faster-whisper
FASTER_WHISPER_PYTHON=/home/me/nearedit-env/bin/python3
WHISPER_MODEL=small
```

The model is downloaded from Hugging Face the first time it is used (set
`HF_HOME` to choose where it is cached). A CUDA GPU is used automatically
when CTranslate2 can see one; force the choice with `FASTER_WHISPER_DEVICE`
and `FASTER_WHISPER_COMPUTE_TYPE` (`int8` is a good CPU setting, `float16`
a good GPU one).

### Usage

```bash
python3 workers/faster_whisper_transcribe.py INPUT \
  [--model base] [--language en] [--device auto] [--compute-type default] [--beam-size 5]
```

`INPUT` is a media file or an `http(s)` URL (downloaded to a temporary
directory first). A 16 kHz mono 16-bit WAV — what NearEdit sends — is read
directly; anything else is converted with `ffmpeg` when it is installed, and
otherwise handed to faster-whisper's own decoder.

Output on stdout is one JSON document:

```json
{
  "language": "en",
  "language_probability": 0.96,
  "duration": 11.0,
  "segments": [
    {
      "id": 0, "start": 0.0, "end": 10.48,
      "text": "And so, my fellow Americans, ask not what your country can do for you.",
      "words": [{ "word": "And", "start": 0.0, "end": 0.74, "probability": 0.745 }]
    }
  ]
}
```

`PROGRESS <0..1>` lines and any library logging go to stderr. Exit status is
`0` on success, `2` when the input does not exist, non-zero otherwise.

### On a remote GPU machine (ssh provider)

Copy this folder to the machine, create the virtual environment there, and
configure the NearEdit server:

```ini
TRANSCRIBE_PROVIDER=ssh
HYDRA_HOST=gpu@hydra
SERVER_HOST=192.168.1.20
TRANSCRIBE_SSH_COMMAND=~/nearedit-env/bin/python3 ~/nearedit/workers/faster_whisper_transcribe.py
```

NearEdit then runs
`ssh gpu@hydra <command> '<media url>' --model '<WHISPER_MODEL>'` and the
script fetches the media from `http://SERVER_HOST:PORT/api/media/file`.
The remote machine needs key-based SSH access (no password prompt) and must
be able to reach the NearEdit server over HTTP.

## Other providers

whisper.cpp, Ollama and OpenAI-compatible services need no script from this
folder — see [docs/app-spec/INTELLIGENCE.md](../docs/app-spec/INTELLIGENCE.md).
