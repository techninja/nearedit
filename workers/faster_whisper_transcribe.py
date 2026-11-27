#!/usr/bin/env python3
"""Transcribe one audio/video file with faster-whisper and print JSON.

Used by NearEdit's `faster-whisper` transcription provider, and usable as the
remote command of the `ssh` provider (the input may be an http(s) URL, which
is downloaded first).

    python3 faster_whisper_transcribe.py INPUT [--model base] [--language en]
        [--device auto] [--compute-type default] [--beam-size 5]

stdout: one JSON document
    {"language": "en", "language_probability": 0.99, "duration": 11.0,
     "segments": [{"id": 0, "start": 0.0, "end": 3.2, "text": "...",
                   "words": [{"word": "And", "start": 0.0, "end": 0.3,
                              "probability": 0.98}]}]}
stderr: "PROGRESS <0..1>" lines while decoding, and any library logging.

Requires: pip install faster-whisper
"""

import argparse
import json
import os
import shutil
import sys
import tempfile
import urllib.request


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("input", help="media file path or http(s) URL")
    parser.add_argument("--model", default="base", help="model size, name or local path")
    parser.add_argument("--language", default="", help="language code; empty = auto-detect")
    parser.add_argument("--device", default="auto", help="auto, cpu or cuda")
    parser.add_argument("--compute-type", default="default", help="e.g. int8, float16")
    parser.add_argument("--beam-size", type=int, default=5)
    return parser.parse_args(argv)


def fetch(url, directory):
    """Download a URL into `directory` and return the local path."""
    target = os.path.join(directory, "input.media")
    with urllib.request.urlopen(url) as response, open(target, "wb") as out:
        shutil.copyfileobj(response, out)
    return target


def transcribe(path, args):
    from faster_whisper import WhisperModel

    model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)
    segments, info = model.transcribe(
        path,
        language=args.language or None,
        beam_size=args.beam_size,
        word_timestamps=True,
    )
    duration = float(getattr(info, "duration", 0) or 0)
    out = []
    for segment in segments:  # a generator: decoding happens as we iterate
        words = [
            {
                "word": word.word.strip(),
                "start": round(word.start, 3),
                "end": round(word.end, 3),
                "probability": round(word.probability, 3),
            }
            for word in (segment.words or [])
        ]
        out.append(
            {
                "id": len(out),
                "start": round(segment.start, 3),
                "end": round(segment.end, 3),
                "text": segment.text.strip(),
                "words": words,
            }
        )
        if duration > 0:
            print(f"PROGRESS {min(1.0, segment.end / duration):.4f}", file=sys.stderr, flush=True)
    return {
        "language": info.language,
        "language_probability": round(float(info.language_probability), 4),
        "duration": round(duration, 3),
        "segments": out,
    }


def main(argv=None):
    args = parse_args(argv)
    is_url = args.input.startswith(("http://", "https://"))
    with tempfile.TemporaryDirectory(prefix="nearedit-fw-") as directory:
        path = fetch(args.input, directory) if is_url else args.input
        if not os.path.exists(path):
            print(f"input not found: {path}", file=sys.stderr)
            return 2
        result = transcribe(path, args)
    json.dump(result, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
