#!/usr/bin/env python3
"""Person matte: read video frames, write for each one how much of every pixel is a person.

Used by NearEdit's person cutout (docs/app-spec/CUTOUT.md). The server pipes
the frames of a clip through this script and packs picture and matte into
one cutout file; any program that speaks the same protocol can take its
place (CUTOUT_COMMAND).

    python3 person_matte.py --model modnet.onnx --width 1280 --height 720
        [--fps 30] [--size 512] [--steady 0.6] [--threads 0] [--device auto]
    python3 person_matte.py --model modnet.onnx --check

stdin:  raw RGB frames, width x height x 3 bytes each
stdout: raw 8-bit mattes, width x height bytes each (255 = person), one per
        frame, in order, written as soon as each is ready
stderr: what went wrong, one line; at the end how many frames were done

Exit status: 0 done (the input ended on a frame boundary), 2 bad arguments,
3 onnxruntime or numpy is missing, 4 no model file, 5 the model does not
load or run, 6 the input ended in the middle of a frame.

--check loads everything, runs the model once on a blank picture and prints
one JSON line: {"onnxruntime", "numpy", "python", "model", "providers"}.

How it works: each frame is reduced to --size on its longer side (every
source pixel counted, sides rounded to multiples of 32), the network
(MODNet) gives a matte of that size, the matte is steadied against the
previous one where the picture did not change, and enlarged to the frame.

Requires: pip install onnxruntime numpy
"""

import argparse
import json
import os
import sys
import time

EXIT_DEPENDENCY = 3
EXIT_NO_MODEL = 4
EXIT_BAD_MODEL = 5
EXIT_SHORT_FRAME = 6

# Steadying (see `Steady`): sizes in pixels of the reduced picture, levels of 255.
CELL = 4          # change is averaged over cells this size, which takes the grain out of it
BLOCK = 16        # ...and judged per block this size: the largest of its cells
REACH = 2         # blocks around one that changed count as changed too
STILL = 4.0       # a block that changed by less than this above the grain is still
MOVING = 16.0     # ...and by more than this is moving: nothing of the old matte is kept
GRAIN_CAP = 8.0   # no more than this is ever taken for grain


def fail(code, message):
    """Say what is wrong on stderr and stop with an exit status that tells it apart."""
    sys.stderr.write("person_matte: %s\n" % message)
    sys.stderr.flush()
    sys.exit(code)


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--model", required=True, help="the ONNX matting model (MODNet)")
    parser.add_argument("--width", type=int, default=0, help="frame width in pixels")
    parser.add_argument("--height", type=int, default=0, help="frame height in pixels")
    parser.add_argument("--fps", type=float, default=30.0, help="frames per second of the input")
    parser.add_argument("--size", type=int, default=512,
                        help="longer side of the reduced picture the network sees (default 512)")
    parser.add_argument("--steady", type=float, default=0.6,
                        help="how much of the previous matte is kept where the picture stands "
                             "still, at 30 fps (0 = none, default 0.6)")
    parser.add_argument("--threads", type=int, default=0, help="CPU threads; 0 = all cores")
    parser.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda"])
    parser.add_argument("--check", action="store_true",
                        help="load everything, run once, print one JSON line and stop")
    args = parser.parse_args(argv)
    if not args.check and (args.width < 2 or args.height < 2):
        parser.error("--width and --height are required (2 or more)")
    if args.size < 32 or not 0 <= args.steady < 1 or args.fps <= 0 or args.threads < 0:
        parser.error("--size is 32 or more, --steady 0 to under 1, --fps above 0, --threads 0 or more")
    return args


def load_libraries():
    """numpy and onnxruntime, or exit 3 naming the one that is missing."""
    try:
        import numpy
    except ImportError as error:
        fail(EXIT_DEPENDENCY, "missing module numpy (%s): pip install onnxruntime numpy" % error)
    try:
        import onnxruntime
    except ImportError as error:
        fail(EXIT_DEPENDENCY, "missing module onnxruntime (%s): pip install onnxruntime numpy" % error)
    return numpy, onnxruntime


def open_model(ort, path, threads, device):
    """An inference session for the model, or exit 4 (no file) / 5 (not a model)."""
    try:
        with open(path, "rb") as handle:
            handle.read(1)
    except OSError as error:
        fail(EXIT_NO_MODEL, "no model at %s (%s)" % (path, error.strerror or error))
    options = ort.SessionOptions()
    options.log_severity_level = 3
    if threads:
        options.intra_op_num_threads = threads
    have = ort.get_available_providers()
    if device == "cuda" and "CUDAExecutionProvider" not in have:
        fail(2, "--device cuda, but this onnxruntime has no CUDA: pip install onnxruntime-gpu")
    wanted = [] if device == "cpu" else ["CUDAExecutionProvider"]
    providers = [name for name in wanted if name in have] + ["CPUExecutionProvider"]
    try:
        session = ort.InferenceSession(path, options, providers=providers)
        shape = session.get_inputs()[0].shape
    except Exception as error:  # onnxruntime raises its own family of errors
        fail(EXIT_BAD_MODEL, "the model at %s does not load: %s" % (path, str(error).split("\n")[0]))
    if len(shape) != 4 or shape[1] != 3:
        fail(EXIT_BAD_MODEL, "the model at %s takes %s, not pictures (batch, 3, height, width)" % (path, shape))
    return session


def working_size(width, height, side):
    """The size the network sees: `side` on the longer side at most, both multiples of 32."""
    scale = min(1.0, side / float(max(width, height)))
    return (max(32, int(round(width * scale / 32.0)) * 32),
            max(32, int(round(height * scale / 32.0)) * 32))


def taps(np, n_out, n_in):
    """For each of n_out samples the two of n_in around it, and how far it is towards the second."""
    at = (np.arange(n_out, dtype=np.float32) + 0.5) * n_in / n_out - 0.5
    low = np.clip(np.floor(at), 0, n_in - 1).astype(np.intp)
    return low, np.minimum(low + 1, n_in - 1), np.clip(at - low, 0, 1).astype(np.float32)


def make_reducer(np, width, height, small_w, small_h):
    """frame (height, width, 3) uint8 -> (3, small_h, small_w) float32, levels 0..255.

    Whole pixels first: every `step` x `step` square becomes its average, so
    no source pixel is skipped and grain is averaged away; the remaining,
    smaller reduction weighs the two nearest in each direction. Plain array
    slices on purpose: a matrix product would be shorter, and its threads
    fight the network's for the same cores (measured: 2.5 times slower).
    """
    step = max(1, min(width // small_w, height // small_h))
    box_w, box_h = width // step, height // step
    left, right, fx = taps(np, small_w, box_w)
    top, bottom, fy = taps(np, small_h, box_h)
    fx, fy = fx[None, :, None], fy[:, None, None]
    sums = np.uint16 if step <= 16 else np.uint32

    def reduce(frame):
        total = np.zeros((box_h, box_w, 3), sums)
        for dy in range(step):
            for dx in range(step):
                total += frame[dy:box_h * step:step, dx:box_w * step:step]
        upper = total[top]
        rows = upper + (total[bottom].astype(np.float32) - upper) * fy
        near = rows[:, left]
        mixed = (near + (rows[:, right] - near) * fx) * (1.0 / (step * step))
        return np.ascontiguousarray(mixed.transpose(2, 0, 1), dtype=np.float32)

    return reduce


def make_enlarger(np, small_w, small_h, width, height):
    """matte (small_h, small_w) float 0..1 -> (height, width) uint8, bilinear."""
    left, right, fx = taps(np, width, small_w)
    top, bottom, fy = taps(np, height, small_h)
    fy = np.rint(fy * 256).astype(np.uint16)[:, None]

    def enlarge(matte):
        wide = matte[:, left] * (1 - fx) + matte[:, right] * fx
        wide = np.rint(np.clip(wide, 0, 1) * 255).astype(np.uint16)
        return ((wide[top] * (256 - fy) + wide[bottom] * fy + 128) >> 8).astype(np.uint8)

    return enlarge


class Steady:
    """Keeps part of the previous matte where the picture stood still.

    The network decides every frame afresh, so on a still shot its edges
    shimmer. Blending each matte with the one before calms that, and smears
    whatever moves: a fast hand drags a ghost. So the blend is used only
    where the picture itself did not change — judged per block, with the
    blocks around a change counted as changed, so the flat inside of a
    moving thing moves with its edges — and what is taken for change is
    measured above the grain of the footage.
    """

    def __init__(self, np, strength, fps):
        self.np = np
        # The same settling time whatever the frame rate.
        self.strength = strength ** (30.0 / fps) if strength > 0 else 0.0
        self.picture = None
        self.matte = None

    def keep(self, change):
        """How much of the old matte each pixel keeps, from the picture's change per pixel."""
        np = self.np
        height, width = change.shape
        rows, cols = -(-height // BLOCK), -(-width // BLOCK)
        padded = np.zeros((rows * BLOCK, cols * BLOCK), np.float32)
        padded[:height, :width] = change
        per = BLOCK // CELL
        cells = padded.reshape(rows * per, CELL, cols * per, CELL).mean(axis=(1, 3))
        grain = min(float(np.median(cells)), GRAIN_CAP)
        blocks = cells.reshape(rows, per, cols, per).max(axis=(1, 3))
        for _ in range(REACH):
            around = np.pad(blocks, 1, mode="edge")
            blocks = np.max([around[y:y + rows, x:x + cols] for y in range(3) for x in range(3)], axis=0)
        still = np.clip((grain + MOVING - blocks) / (MOVING - STILL), 0, 1) * self.strength
        return np.repeat(np.repeat(still, BLOCK, axis=0), BLOCK, axis=1)[:height, :width]

    def __call__(self, picture, matte):
        """picture (3, h, w) levels 0..255, matte (h, w) 0..1 -> the matte to use."""
        if self.strength > 0 and self.matte is not None:
            change = self.np.abs(picture - self.picture).mean(axis=0)
            matte = matte + self.keep(change) * (self.matte - matte)
        self.picture, self.matte = picture, matte
        return matte


def read_frame(stream, buffer):
    """Fill `buffer` from the stream. Returns the bytes read: all of it, or less at the end."""
    view = memoryview(buffer)
    done = 0
    while done < len(view):
        count = stream.readinto(view[done:])
        if not count:
            break
        done += count
    return done


def run_check(np, ort, session, args):
    """Run the model once and say what was used, as one JSON line."""
    name = session.get_inputs()[0].name
    try:
        out = session.run(None, {name: np.zeros((1, 3, 64, 64), np.float32)})[0]
    except Exception as error:
        fail(EXIT_BAD_MODEL, "the model at %s does not run: %s" % (args.model, str(error).split("\n")[0]))
    if out.shape != (1, 1, 64, 64):
        fail(EXIT_BAD_MODEL, "the model at %s gives %s for a 64 x 64 picture, not a matte"
             % (args.model, list(out.shape)))
    facts = {"onnxruntime": ort.__version__, "numpy": np.__version__,
             "python": sys.version.split()[0], "model": args.model,
             "providers": session.get_providers()}
    sys.stdout.write(json.dumps(facts) + "\n")


def main(argv=None):
    args = parse_args(argv)
    np, ort = load_libraries()
    session = open_model(ort, args.model, args.threads, args.device)
    if args.check:
        return run_check(np, ort, session, args)
    width, height = args.width, args.height
    small_w, small_h = working_size(width, height, args.size)
    reduce = make_reducer(np, width, height, small_w, small_h)
    enlarge = make_enlarger(np, small_w, small_h, width, height)
    steady = Steady(np, args.steady, args.fps)
    name = session.get_inputs()[0].name
    source, sink = sys.stdin.buffer, sys.stdout.buffer
    buffer = bytearray(width * height * 3)
    frames, started = 0, time.time()
    try:
        while True:
            got = read_frame(source, buffer)
            if got == 0:
                break
            if got < len(buffer):
                fail(EXIT_SHORT_FRAME, "the input ended in the middle of frame %d (%d of %d bytes)"
                     % (frames + 1, got, len(buffer)))
            picture = reduce(np.frombuffer(buffer, np.uint8).reshape(height, width, 3))
            try:
                matte = session.run(None, {name: (picture * (1 / 127.5) - 1)[None]})[0][0, 0]
            except Exception as error:
                fail(EXIT_BAD_MODEL, "the model failed on frame %d: %s"
                     % (frames + 1, str(error).split("\n")[0]))
            sink.write(enlarge(steady(picture, matte)).data)
            sink.flush()
            frames += 1
    except BrokenPipeError:
        # Whoever was reading the mattes has gone. Point stdout somewhere that
        # takes the rest, so Python does not complain again while it exits.
        os.dup2(os.open(os.devnull, os.O_WRONLY), sys.stdout.fileno())
        return
    spent = (time.time() - started) * 1000 / max(1, frames)
    sys.stderr.write("person_matte: %d frames at %d x %d (network at %d x %d), %.0f ms each\n"
                     % (frames, width, height, small_w, small_h, spent))


if __name__ == "__main__":
    main()
