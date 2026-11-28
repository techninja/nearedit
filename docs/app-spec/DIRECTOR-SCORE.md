# The Director's Score

`score` writes music for the timeline: a song in a style, exactly as long
as the picture, that changes where the picture changes and steps back
while someone speaks. It arrives as one [music clip](./MUSIC.md) on an
audio track of its own — rendered, so it plays the moment it is merged —
and nothing in it is baked: the clip carries the song, every part of which
can be opened and changed note by note; the ducking is volume keyframes.

It follows the director's one design rule ([DIRECTOR.md](./DIRECTOR.md)): a
plan says *what*; deterministic code does everything else. A language
model never writes a note, a chord, a time or a parameter.

```text
timeline ─► span, turning points, ─► score plan ─► tempo ─► sections ─► song ─► render ─► music clip
            pace, speech              ▲    ▲      (whole    (on the     (every   (the      (+ volume
                              form and     LLM     bars)     turning     note by  server's   keyframes
                              timeline  (optional)           points)     rule)    renderer)  under speech)
```

## The action

| Field | Value |
| ----- | ----- |
| `action` | `score` |
| LLM | optional (`params.useLlm`) |
| Modes | `replace` (default), `range` — a *scope*, as for the in-place actions |
| `prompt` | The brief, optional: mood words, a style ("calm, hopeful — something lo-fi") |
| Needs | The current `edl` in the request |

| Param | Values | Meaning |
| ----- | ------ | ------- |
| `style` | `brand` (default), `auto`, or a [style](#styles) | `brand` is the style of the project's brand kit ([DIRECTOR-BRAND.md](./DIRECTOR-BRAND.md)) unless the brief names one; `auto` chooses from the timeline ([Without a model](#without-a-model)) |
| `energy` | 0–1, default 0.5 | How much happens: 0 a quiet bed, 1 everything the style has ([Sections](#sections)) |
| `key` | `brand` (default), `auto`, `C`, `Db` … `B` | `brand`: the kit's key; `auto`: one the style sits well in, by the seed. Major or minor follows from the style |
| `bpm` | 0–240, default 0 | 0 fits a tempo of the style to the length ([Tempo](#tempo)) |
| `duck` | 0–24 dB, default 12 | How far the music drops under speech; 0 = never |
| `volume` | 0.05–1.5, default 0.7 | The clip's level where nobody speaks |
| `seed` | 1–99, default 1 | The same timeline, parameters and seed always give the same song; another seed, another take |
| `useLlm` | toggle, default off | Let the language model write the [plan](#the-plan) |

```json
{
  "action": "score",
  "prompt": "calm, hopeful",
  "params": { "style": "lofi", "energy": 0.4, "duck": 12 }
}
```

A timeline with nothing on it (and no range), or a span shorter than a
second, is answered with `422` and `fields.edl` before a job starts.

## The timeline

`src/api/director/score/timeline.js` reads the posted document.

**The span** is `context.range` in mode `range`; otherwise from the first
to the last selected clip (`context.selection`); otherwise the whole
timeline. It is put on the frame grid.

**Turning points** are where the music should change, each with a weight:

| Weight | What |
| ------ | ---- |
| 3 | A marker; the start of a region |
| 2 | The start of a title clip or of a generated scene (a generator clip) on a visible video track |
| 1 | The start of a shot — footage or a still — that lasts four seconds or more |

Points within half a second of either end of the span are left out; points
within a tenth of a second of each other are one, the weightiest.

**The pace** is the number of moments at which a shot begins inside the
span, per minute (titles are not cuts). It only helps `auto` choose a style.

## Styles

`src/utils/director/score/styles/` — one file of data per style
(`style.js` says what a style is). Tempo in BPM; the number after a drum
layer or an instrument is the energy at which it joins.

| Style | Tempo | Metre | Scale | Drums (kit: layers) | Instruments (preset) |
| ----- | ----- | ----- | ----- | ------------------- | -------------------- |
| `ambient` Ambient | 60–80 | 4/4 | major | none | Pad 0, Sub 0.4, Bells (bell arpeggio) 0.4, Strings 0.5, Glass (keys melody) 0.75 |
| `lofi` Lo-fi | 70–90 | 4/4, swing 0.3 | dorian | lofi: kick and hats 0.4, snare 0.65, shaker 0.85 | Keys 0, Dust (pad) 0.25, Sub 0.4, Bell (melody) 0.75 |
| `bossa` Bossa nova | 104–132 | 4/4 | major | acoustic: clave 0.4, hats 0.65, shaker 0.85 | Keys (struck) 0, Bass 0.4, Strings 0.5, Pluck (melody) 0.75 |
| `waltz` Waltz | 90–132 | 3/4 | major | acoustic: kit 0.4, ride 0.65 | Plucks (struck on two and three) 0, Bass 0.25, Strings 0.4, Bells (arpeggio) 0.5, Melody (lead) 0.75 |
| `cinematic` Cinematic | 72–96 | 4/4 | minor | acoustic: low drums 0.4, snare 0.65, toms 0.85 | Strings 0, Pad 0.25, Sub 0.4, Bells (arpeggio) 0.5, Melody (lead) 0.75 |
| `corporate` Upbeat | 104–124 | 4/4 | major | acoustic: kick 0.4, claps and hats 0.65, shaker 0.85 | Pad 0, Plucks (arpeggio) 0.25, Bass 0.4, Keys (struck) 0.5, Bell (melody) 0.75 |
| `synthwave` Synthwave | 88–112 | 4/4 | minor | 909: kick and hats 0.4, snare 0.65, tops 0.85 | Strings 0, Arp 0.25, Bass (octaves) 0.4, Lead 0.75 |
| `hiphop` Hip-hop | 128–148 | 4/4 | minor | 808, 32 steps: kick and hats 0.4, clap 0.65, tops 0.85 | Pad 0, Keys (arpeggio) 0.25, 808 (sub) 0.4, Bell (melody) 0.75 |
| `house` House | 116–130 | 4/4 | minor | 909: kick 0.4, claps and hats 0.65, tops 0.85 | Pad 0, Pluck (arpeggio) 0.25, Bass 0.4, Stab (keys) 0.5, Lead 0.75 |
| `breakbeat` Breakbeat | 150–172 | 4/4, swing 0.1 | minor | 909: kick and hats 0.4, snare 0.65, ride 0.85 | Pad 0, Arp 0.25, Sub 0.4, Stab (keys) 0.5, Lead (bell) 0.75 |

A style also holds four chord progressions of one chord per bar, as Roman
numerals (`i-VI-III-VII`); the chord of a turnaround (`V`, `V7`, `VII`,
`IV`); the keys it sits well in; a fill and the downbeat a fill lands on;
the mix of every instrument and its mix bus. Everything is the engine's
own vocabulary — presets, kits, lanes, scales — and the tests hold every
style to it, so adding a style is adding a file and a line in `styles.js`.
No chord of any progression has two notes a semitone apart (no major
sevenths): whatever doubles a chord in another octave cannot clash with it.

## Tempo

`fit.js`. Among the tempos of the style's range, those are candidates at
which the span is a **whole number of bars**. The one with the lowest cost
is taken:

- how far it is from the style's usual tempo — a quarter into its range
  for energy 0, three quarters for energy 1;
- three times how far the turning points lie from its bar lines, weighted
  (0 = all on bar lines, 1 = all half a bar off) — where the bars fall
  matters most, because that is where the music can change;
- a little for an odd number of bars.

So 60 s of house (116–130 BPM) is 31 bars at 124 BPM; with a marker at
14 s it is 30 bars at 120 (the marker is bar 7), with one at 15 s 32 bars
at 128 (bar 8). The tempo is whatever number that takes — 121.59 BPM is a
tempo — and the song's beat and bar lines are the timeline's snap grid.

| When | Then |
| ---- | ---- |
| No whole number of bars fits the range (a span shorter than `60 × beats per bar / (fastest − slowest)` seconds may not) | A whole number of **beats**: the music is the whole bars of that, and the last chord rings through the beats left |
| Not even a beat fits (under half a second or so) | The style's usual tempo; one bar, cut by the clip |
| `bpm` was asked for | That tempo exactly; the music ends on the last whole bar inside the span and rings out to its end |
| The span is longer than a song can be | The first 19½ minutes of it — or 512 bars at the style's slowest tempo, when that is less; a note says how much has no music |

## Sections

`cuts.js`, `arc.js`, `sections.js`. A section is `intro`, `verse`, `lift`,
`break` or `outro`, a range of bars, and an **energy** from 0 to 1.

**Where they begin.**

1. Every turning point is moved to its nearest bar line, the weightiest
   first. A marker begins a section wherever it is — unless that is within
   four seconds (and two bars) of another section line or of the start, or
   within three bars of the end. Titles, scenes and long shots begin one
   only a *phrase* away from every other line: a run of captions or a
   montage does not make a section per clip.
2. A **phrase** is four bars — eight, sixteen… at a faster tempo: the
   first of those to last eleven seconds. A stretch longer than a phrase
   and a half is divided into phrases, so the music has a form where the
   picture gives none. With no turning point at all, a song that would
   have fewer than three sections gets phrases half as long.
3. At most 24 sections; a long song gets longer phrases instead.

**What they are.** In order: an intro, then verse, lift and break taking
turns so that the last section before the outro is a lift, and an outro
(one section: a verse; two: intro, lift). An opening longer than a phrase
is a verse — an intro that long would be a wait. When sections begin on
markers, the one nearest the arc's last lift **is** the peak, and a lift
right before it becomes a break: the music lifts where the editor marked
the picture.

| Kind | Level | With `energy` 0.5, about |
| ---- | ----- | ------------------------ |
| `intro`, `break` | 0.3 | Chords and one colour: no bass, no drums |
| `outro` | 0.45 | Chords, colour, bass and the first drum layer |
| `verse` | 0.55 | The same, and the second chord instrument |
| `lift` | 0.9 (1 for the peak, when there are several) | Everything: the full beat, the melody, the top layer |

A section's energy is its level × (0.5 + `energy`), kept within 0.05–1:
`energy` moves the whole arc. A part plays in the sections whose energy
reaches the number it joins at (the [styles](#styles) table), so at
`energy` 0 even a lift has no more than bass and a first drum layer, and
at 1 an intro already has them.

## The song

`generate.js` turns style, tempo, sections and seed into a
[song](./MUSIC.md#the-song). The seed chooses the key (unless one was
asked for) and the progression, and gives every instrument its own seed.

**Parts are loops, and the arrangement is their `play` ranges.** Every
instrument is one part: a loop as long as the progression (the melody
twice that), written by the engine's theory helpers — `bassLine`,
`padNotes` or struck chords voiced by `voiceLead`, `arpeggio`, `melody` —
and playing in the sections that reach its energy. Drums are one-bar
parts, one per layer. So the song is short, and editing a loop changes it
everywhere it plays.

**Every section ends with a turnaround.** A loop starts again wherever it
comes in. To have every part at the top of the progression when a section
begins, all loops stop one bar before the section ends (`arrange.js`).
That bar is the turnaround: the **cadence** parts play its chord — the
style's first chord instrument holds it, the bass pushes towards the bar
line in eighths — and the **fill** part plays the style's fill when drums
follow. On the next bar line everything enters together, with the fill's
downbeat (a crash). The fill and the cadence parts are two-bar loops:
turnaround, then the downbeat or the final chord.

**The ending** is the last two bars: the turnaround, then the tonic chord
— the key note in the bass — struck once, held for 60% of the bar and
left to ring. A song of two bars is only that; a song of one bar is the
final chord.

**Tidying** (`tidy.js`), whatever the seed:

- every note inside its instrument's range (bass E1–G3, never under
  41 Hz; chords E2–E6; arpeggios from C3; melodies from G3), by whole
  octaves;
- no note tied over a bar line: a loop may stop at the end of any bar;
- no held melody note (three quarters of a beat or more) a semitone above
  or below a note of the chord under it, in any octave — it is moved to
  the nearest chord note;
- a melody within an octave and a half: the first of twelve seeds whose
  line keeps to that is taken.

**Brightness** (from the mood) opens or closes every instrument's filter:
up to an octave either way. **Loudness:** each style's mix bus is set so
that its songs measure about −19 LUFS, and a sparse arrangement gets up to
2 dB back — 6 dB per unit of mean energy around 0.55 — so beds of any
energy are about equally loud ([Measured](#measured)).

## Under speech

**Where people speak** (`score/speech.js`, `src/utils/director/score/speech.js`).
Every clip that is heard in the span is asked: on an audio track that is
not muted (and is soloed, when any is), with a volume above zero, not a
music clip, not marked `music`. Through its file's sidecar:

1. the **words** of the transcript that the clip plays, mapped through its
   source window (`timelineStart + (t − sourceIn)`); words less than
   0.35 s apart are one stretch;
2. for a transcript without word times, its **segments**;
3. for a voice without a transcript — a clip whose intent is `narration`
   or `primary`, or a file the director takes for speech — everything that
   is not analysed as **silence**; without that analysis either, the
   whole clip. A note says which files were read this way.

Stretches from all clips are joined; where clips overlap, they are one.

**Ducking** (`duck.js`). Stretches less than 1.5 s apart are ducked as
one — the bed does not jump up between two sentences. Each becomes four
`volume` keyframes on the music clip:

```text
level ────────╮                                    ╭──────── level
              ╰──── level × 10^(−duck / 20) ───────╯
        0.25 s ramp, down 0.05 s             up from 0.3 s after
        before the first word                the last word, 0.25 s
```

Speech at the very start begins low; speech to the very end stays low; no
speech, or `duck` 0, and the clip has no keyframes at all. Keyframe times
are the clip's own (its source window starts at 0).

The clip also has a **fade-in** (up to half a second, a quarter of a bar)
and a **fade-out** over the ring of the last chord (40% of a bar, plus
what follows the last bar; 0.3–3 s).

## The plan

The small JSON that says what the music is like — the same whether the
rules or a model wrote it. Schema: `src/utils/director/score/planSchema.js`.

```json
{
  "style": "lofi",
  "mood": ["calm", "hopeful"],
  "sections": [
    { "name": "intro", "share": 1, "energy": 0.3 },
    { "name": "verse", "share": 3, "energy": 0.5 },
    { "name": "lift", "share": 2, "energy": 0.9 },
    { "name": "outro", "share": 1, "energy": 0.4 }
  ]
}
```

| Field | Meaning |
| ----- | ------- |
| `style` | Required. A style, by id, label or a common word for it (`lo-fi`, `trap`, `orchestral`) |
| `mood` | Up to eight words. Each moves the energy and the brightness a little (`mood.js`): `calm` −0.25 energy, `bright` +0.3 brightness, `energetic` +0.3 energy… Together at most ±0.4 |
| `sections[]` | Optional, 1–12. `name` (a kind of section, or a word for one: `chorus`, `bridge`, `build`), `share` of the length (default 1), `energy` 0–1 (default: the kind's level) |
| `bpm`, `key` | Only when asked for |

**Deciding** (`score/plan.js`). What the form fixes wins: its `style`,
`bpm` and `key` over the plan's. The mood is added to the form's `energy`
and to a brightness of 0.5. A plan's sections replace the arc: each begins
at its share of the length — on a turning point when one is within two
bars — and has its own energy, still moved by `energy`. An unknown style
is replaced by what `auto` would choose, an unknown kind of section is a
verse, unknown mood words are passed over; each is reported.

### Without a model

The plan is the form's style and the mood words found in the brief.
`style: auto` (`auto.js`) takes a style the brief names, else chooses by
whether people speak (in a fifth of the span or more) and by the pace; the
seed walks through the styles that suit:

| | Under 8 cuts a minute | 8–20 | Over 20 |
| - | --------------------- | ---- | ------- |
| Speech | lofi, ambient, bossa | corporate, lofi, bossa | corporate, house, hiphop |
| No speech | cinematic, ambient, waltz | synthwave, corporate, house | house, breakbeat, hiphop |

### With a model

`params.useLlm` asks the configured LLM for the plan (`prompts/score.js`).
The system prompt lists the styles with their one-line descriptions, the
mood words and the kinds of section, and shows the example plan. The user
prompt shows the timeline (`digest.js`) — never a clip or a file:

```text
Length to score: 42 seconds (the whole timeline).
Pace: 9 cuts a minute.
Turning points:
  0:12 marker “Product reveal”
  0:20 title “Meet the dashboard”
  0:31 a new shot
Speech: 0:01–0:11, 0:14–0:28 (58% of the length).
```

and then what the editor fixed (style, tempo, key), the energy, and the
brief.

**From reply to plan** (`score/parse.js`, `normalize.js`, `request.js`) —
the procedure edit plans go through: reasoning blocks are stripped; JSON
is taken from a code fence or the first balanced object; `jsonrepair`
fixes what `JSON.parse` rejects; harmless deviations are normalised (keys
such as `genre`, `vibe`, `structure`, `tempo`; a mood written as one
sentence; `"84 bpm"`; `"D minor"`; an energy of `"high"` or `85`; a
`{ "plan": … }` wrapper); then the plan is validated with ajv. If it is
invalid the model is asked **once** more with the errors listed. If the
retry is still invalid, the style and whatever else is usable are kept,
with notes; if it names no style, the model's plan is given up.

The LLM is *optional* here: when it cannot be reached, is not configured
or returns nothing usable, the plan is made without it and the first note
says so.

## Rendering

The song is rendered **inside the director job** by the server's music
renderer (`renderMusic`, [MUSIC.md § Server](./MUSIC.md#server-and-command-line)),
into `<project>/.nearedit/music/<key>.wav` — where the editor looks for a
music clip's rendering. Progress is forwarded; cancelling the job stops
the renderer and leaves no file. The same score asked for again finds its
rendering. A 45 s score takes about a second here; found again, no time.

## The result

The clip is added the way the in-place actions change the timeline
([DIRECTOR.md § Working on the existing timeline](./DIRECTOR.md#working-on-the-existing-timeline)):
the posted document comes back whole, as a `replace`, with every track's
`trackId` and every clip's id — and one clip more. It goes on an unlocked
audio track called "Music" (or "Score") that is free over the span, else
on a new audio track "Music" at the bottom. Nothing else is touched.

- The clip: `sourceFile` the rendering, `music.song` the song,
  `music.key` its key (the clip is not stale), `intent: "music"`, the
  span as its place, `volume`, the fades and `keyframes.volume`. Its
  source window ends where the span ends: the song's tail (three seconds
  or more) is in the rendering and shows when the clip is made longer.
- `plan`: `style`, `mood`, `energy`, `brightness`, `key`, `scale`,
  `progression`, `bpm`, `beatsPerBar`, `bars`, `seed`, the `sections`
  (name, bars, energy, `start` and `end` on the timeline) and `speech`
  (the stretches the clip is ducked over).
- `summary`: `Score: Lo-fi in D dorian, 72 BPM — 6 bars over 20s, 2
  sections, ducked under speech in 3 places`.
- `notes`: where the plan came from and why this style; the mood; how the
  tempo was fitted; the sections and the turning points they begin on
  (`lift 0:22 (marker “The river”, 0.3s after it)`); the key, the
  progression and the parts; how speech was found and ducked; the track;
  other music in the span, if any.

## Measured

Nobody listens to a test run. The styles were tuned, and are tested
(`score/sound.test.js`, with FFmpeg's EBU R 128 meter), by numbers; the
songs' notes are read (`generate.test.js`).

- **Loudness.** Every style at 36 s, energy 0.5: −19.2 to −18.2 LUFS
  integrated, true peak −2.0 dBFS or lower. Over energies 0.1, 0.5 and
  0.9, four seeds and lengths from 30 to 60 s: −19.9 to −17.6 LUFS, true
  peak −1.6 dBFS or lower. The engine's limiter is not reached.
- **Sections.** In every style the lift is louder (1.5 dB RMS or more)
  and brighter (more above 2 kHz, a higher spectral centroid) than the
  opening, and the outro is quieter than the lift. From an intro to a
  verse the centroid may fall: a bass and a kick come in before the hats.
- **Notes.** Over every style and eight seeds: no two parts hold notes a
  semitone (or a minor ninth) apart; the bass is on the root of the chord
  on the first beat of every bar it plays; every part is inside its
  range; the last bar holds only notes of the tonic chord, the key note
  lowest.
- **Ducking.** A timeline with a narration, rendered with
  `nearedit render --preset draft`: the music alone is 12.00 dB lower
  under each stretch of speech than the same score without ducking, and
  0.00 dB lower in the gaps.

## Limits

- One clip, one song: no tempo changes, no key changes. A span longer
  than a song (512 bars, 19½ minutes) is scored as far as a song goes.
- The arc is positional: the heuristic cannot know which marker is "the
  reveal" — the peak is the marker nearest the arc's own. A plan from the
  LLM (or another seed, or moving a marker) can say otherwise.
- A turning point is hit to the nearest bar line: up to half a bar (about
  a second) early or late. The notes say by how much.
- Ducking follows transcripts as they are: a wrong word time is a wrong
  duck. It is not side-chain compression — the keyframes are fixed when
  the score is made, and do not follow later edits of the speech.
- A second run adds a second clip; the first is not removed (a note says
  there is other music in the span).
- As for every in-place result, the timeline that was posted comes back:
  what was edited while the job ran is asked about before it is applied.
- The sound is the engine's ([MUSIC.md § Limits](./MUSIC.md#limits)):
  synthesised drums and one synth design. "Acoustic" styles are that
  synth playing plucks and soft kits, not instruments.
- The styles were tuned by measurement and by looking at spectrograms,
  never by ear.

## Code map

| Path | What |
| ---- | ---- |
| `src/utils/director/actionsScore.js` | The action schema |
| `src/utils/director/score/style.js`, `styles.js`, `styles/` | What a style is; the list; one file per style |
| `src/utils/director/score/fit.js` | Tempo fitting |
| `src/utils/director/score/cuts.js`, `arc.js`, `sections.js` | Section lines; names and levels; the layout |
| `src/utils/director/score/harmony.js`, `parts.js`, `cadence.js`, `drums.js`, `tidy.js` | Key and chords; the instruments' loops; turnaround and ending; drum layers and fill; ranges and clashes |
| `src/utils/director/score/arrange.js`, `generate.js` | `play` ranges; the song |
| `src/utils/director/score/speech.js`, `duck.js` | Where a clip speaks; ducking keyframes |
| `src/utils/director/score/planSchema.js`, `mood.js`, `auto.js`, `digest.js` | The plan; mood words; choosing a style; the timeline in words |
| `src/api/director/actions/score.js` | The action |
| `src/api/director/prompts/score.js` | The LLM prompt |
| `src/api/director/score/timeline.js`, `speech.js` | Span, turning points, pace; speech on the timeline |
| `src/api/director/score/plan.js`, `normalize.js`, `parse.js`, `request.js` | Where the plan comes from and what it comes to; LLM reply → plan, with one retry |
| `src/api/director/score/render.js`, `clip.js`, `notes.js` | Rendering inside the job; the clip and its track; summary and notes |
| `src/utils/director/score/testing/`, `src/api/director/score/testing/` | Reading a song's notes; a stand-in renderer; loudness and brightness meters |

Tests sit beside the code (`node --test`): the styles against the engine's
tables, tempo fitting over many lengths, section layout against markers,
captions and montages, the generator's determinism and its notes, ducking
and speech with their edge cases, plan parsing and salvage, the rendered
sound, the action against a stand-in renderer (whole timeline, range,
selection, the LLM against the fake server, cancelling) and through the
route against the server's own renderer.
