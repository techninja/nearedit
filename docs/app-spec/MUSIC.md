# Music Clips — a Drum Machine and a Synth in the Timeline

A **music clip** is a clip whose sound is written, not recorded: a tempo, a
few parts — drum patterns on a step grid, synth lines as notes — and the
settings of the instruments that play them. NearEdit's own synth turns that
into audio. It is to sound what generators are to the picture: nothing to
import, everything editable afterwards, and something the director can
write directly when a piece needs a score.

```text
song (in the clip) ─► engine (pure JavaScript: voices, filters, effects, mix) ─► .wav
            the same code in the browser (audition while editing) and on the
            server (the file the preview plays and the render mixes)
```

**Why its own engine.** The preview and the render must sound the same. The
usual browser libraries need Web Audio, which the server does not have;
native synthesisers would be a second implementation with a second sound.
One engine written in plain JavaScript runs in both places and, because
both run the same arithmetic, produces **the same samples**:
`tests/music/parity.test.js` renders five songs in Node and in Chromium
and compares their hashes. An eight-part song renders about 30 times
faster than real time in Node; typical songs 40 to 50 times.

## The song

Stored in the clip as `clip.music.song`. The smallest song is `{}` — four
empty bars at 120 BPM.

| Field | Type | Default | Notes |
| ----- | ---- | ------- | ----- |
| `bpm` | number | 120 | 40..240 |
| `beatsPerBar` | integer | 4 | 2..12 |
| `bars` | integer | 4 | Length of the song, 1..512 (and at most 20 minutes) |
| `swing` | number | 0 | 0..0.75: how late every second 16th falls, as a share of a 16th |
| `key`, `scale` | string | `C`, `minor` | For the editor's helpers and the director; the engine plays the notes it is given |
| `tail` | seconds | 2 | Ring-out rendered after the last bar, 0..30 |
| `master` | object | below | The mix bus |
| `parts` | part[] | `[]` | At most 16 |

`master`: `{ volume: 0.8, reverb: { size: 0.5, decay: 0.5 }, delay: { beats:
0.75, feedback: 0.35 } }`. A limiter with a ceiling of −1 dBFS always sits
last: a song cannot clip.

### Parts

Every part has `id`, `name`, `kind` (`drums` or `synth`), `mute`, `volume`
(0..1.5), `pan` (−1..1), `reverb` and `delay` (send amounts, 0..1),
**`bars`** — the length of the part's own loop — and **`play`**, the bar
ranges where it sounds (`[[0, 8], [12, 16]]`; empty = everywhere; its loop
starts again at the start of every range). A part shorter than the song
repeats: a one-bar drum pattern under a four-bar chord progression is two
parts with `bars` 1 and 4. Without `bars`, a part is as long as its
longest lane or its last note.

**Drums** add `kit` and `steps` (per bar: 8, 12, 16, 24 or 32) and
`lanes`, one string per drum, one character per step:

```json
{ "kind": "drums", "kit": "808", "steps": 16, "bars": 1,
  "lanes": { "kick":  "X...x...X...x...",
             "snare": "....X.......X..o",
             "hat":   "x.x.x.x.x.x.x.xx" } }
```

`.` rest, `o` soft, `x` normal, `X` accent; spaces and bar lines may be
written for the eye. The drums of a kit are data (`KITS`), thirteen lanes:
`kick`, `snare`, `clap`, `rim`, `hat`, `openHat`, `tomLow`, `tomMid`,
`tomHigh`, `crash`, `ride`, `cowbell`, `shaker`. An open hat is cut off by
the next closed one.

**Synths** add `preset`, `params` (what differs from the preset),
`transpose` (semitones) and `notes`:

```json
{ "kind": "synth", "preset": "bass", "bars": 4,
  "notes": [[0, 0.5, 33, 0.9], [1, 0.5, 33, 0.7], [2.5, 1, 36, 0.8]] }
```

A note is `[beat, length, pitch, velocity]`: beats from the start of the
part's loop, length in beats, pitch as a MIDI note number (60 = middle C;
a name such as `"C4"` is accepted and stored as its number), velocity
0..1. At most 4000 notes per part. Swing moves every note that falls on an
off-beat 16th, not only drum steps.

### Instruments

One synth design plays every preset — two oscillators (sine, triangle,
saw, pulse, noise) with detune, unison and a sub, optional FM between
them, a resonant filter (12 or 24 dB low-pass, band- or high-pass) with
its own envelope and key tracking, an amplitude envelope, an LFO for
vibrato, filter movement or pulse width, glide, drive. Its parameters are a
schema (`SYNTH_PARAMS`), like a generator's, so the editor's controls and
the director's vocabulary come from one table. `PRESETS` name useful
corners of it: `bass`, `sub`, `acid`, `pluck`, `keys`, `organ`, `pad`,
`strings`, `lead`, `bell`, `arp`.

Drums are synthesised too — a sine with a falling pitch for a kick, noise
through filters for snares and hats — so no samples are shipped. `KITS`:
`808`, `909`, `acoustic`, `lofi`.

## The engine

`src/utils/music/` — isomorphic, pure, no dependencies.

- `normalizeSong(raw)`, `validateSong(song)` — like a web clip's recipe:
  never throws, bounds everything, problems come with their path.
- `songSeconds(song)` — bars × beats × 60 / bpm, plus the tail
  (`musicSeconds` without it).
- `beatTimes(song)` / `barTimes(song)` / `stepTimes(song)` — for the
  timeline's snapping.
- `createRenderer(song, { sampleRate: 48000 })` → `{ frames, sampleRate,
  position, render(count) }`: interleaved stereo `Float32Array` chunks, so
  a long song never sits in memory at once; `renderSong(song)` for short
  ones. Chunked and whole renders give the same samples.
- `encodeWav(chunks, sampleRate)` — 16-bit PCM; `wavHeader` and `pcm16`
  for streaming.
- `songKey(song)` — 20 hex digits of the SHA-256 of the engine's version
  and the canonical song (names and the `key` / `scale` hints left out),
  as for web clips.

Speed depends on what is asked: drums alone render hundreds of times
faster than real time, but sixteen parts of sixteen seven-voice unison
notes each render slower than real time. Rendering therefore runs off the
server's main thread and can be cancelled.

**Deterministic:** no `Math.random`, no clocks; noise comes from a seeded
generator; the same song gives the same samples in every run, in Node and
in the browser. `tests/music/parity.test.js` proves the last part.

**Theory helpers** (`src/utils/music/theory/`) write notes; they are tools
for the editor and the director, not part of what a song stores:
`chord('Am7')`, `scaleNotes(key, scale)`, `progression(key, scale,
'i-VI-III-VII')`, `voiceLead`, and builders that turn a chord sequence
into parts — `bassLine`, `padNotes`, `arpeggio`, `melody` — all seeded;
`BEATS` and `drumPart(name)` — named drum patterns with a fill (four on
the floor, backbeat, boom-bap, half-time, breakbeat, trap, bossa).

**MIDI.** `parseMidi(bytes)` reads a Standard MIDI File; `songFromMidi`
turns it into `{ song, warnings }` (channel 10 onto the kit by the General
MIDI drum map, programs onto the nearest preset; tempo changes,
controllers and pitch bend are ignored, and it says so); `songToMidi(song)`
writes one.

## In the document

```json
{ "sourceFile": "/project/.nearedit/music/9be1c4….wav", "sourceIn": 0, "sourceOut": 10,
  "music": { "song": { "bpm": 120, "bars": 4, "parts": [] }, "key": "9be1c4…" } }
```

Exactly the shape of a [web clip](./WEBCLIP.md#in-the-document): the song
is the source of truth, `key` names the rendering `sourceFile` points at,
a clip is stale when `key !== songKey(song)`, and until it is rendered it
is a placeholder with a length. A music clip sits on an audio track; its
source is the song (`0 … songSeconds`, the whole frames that fit). A clip
is never both a web clip and a music clip. Operations
(`src/utils/edl/musicClip.js`): `insertMusicClip`, `updateSong`,
`setMusicRendering`, `musicClips`, `staleMusicClips`.

Rendered, it is an ordinary audio clip: volume, fades, volume keyframes,
the mixer and the render treat it like any file.

## Server and command line

| Method | Route | Purpose |
| ------ | ----- | ------- |
| POST | `/music/render` | `{ projectId, song }` → `{ file, key, duration, cached }`: renders `<project>/.nearedit/music/<key>.wav` unless it exists |
| POST | `/music/import` | `{ projectId, path }` (a `.mid` in the project) → `{ song, warnings }` |

```bash
nearedit music song.json -o song.wav
```

`nearedit render` renders a document's missing music clips first, like its
web clips.

## Limits

- One synth design and synthesised drums: it does basses, pads, plucks,
  leads and electronic kits well, and does not pretend to be a piano or an
  orchestra. Sample playback (SoundFonts) is not built.
- No audio effects on tracks or on other clips; reverb and delay exist
  inside a song only.
- No tempo changes inside a song, and no time signatures that change.
- The sounds were tuned by measurement — loudness, spectra, envelopes —
  and by looking at spectrograms.
