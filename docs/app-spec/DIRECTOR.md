# The Director — NearEdit's Assistant Editor

The director turns intent into timeline edits. It does the tedious
macro-assembly — the rough cut, the dead air, the cut on the beat — and
hands back an ordinary, undoable change to the EDL that the editor then
fine-tunes by hand. It is never a black box: every result says what was
done and why, and nothing it produces is baked.

Routes, the `directive` shape and the `DirectorResult` shape are specified
in [API.md § Director](./API.md#director). This document describes what
happens between the two.

```text
directive ─► gather sidecars ─► edit plan ─► resolve ─► assemble ─► DirectorResult
                                 ▲    ▲
                 LLM (generate_edit,  heuristics (base_edit,
                 execute_script)      insert_broll)
```

**The one design rule.** A plan says *what* to use: which file, roughly
which part, in what order, what the titles say. Deterministic code does
*all* the timing: resolving real file paths, cutting on word, shot and
beat boundaries, frame snapping, linked picture/sound pairs and the EDL
invariants. A language model never writes an EDL and never gets to invent
a file.

## Actions

Served as JSON by `GET /api/director/actions` (schemas in
`src/utils/director/actions*.js`) so the form can be rendered generically.
Each schema has `id`, `title`, `description`, `llm` (`no`, `yes`,
`optional`), `jobType`, `modes`, `defaultMode`, `inPlace`, `prompt` (how to
ask for `directive.prompt`, or `null`) and `fields`; optionally `media:
false` (the action never reads the project's media, so the scan is skipped)
and `noLlmNote`. A field is
`{ key, type, label, help, default }` plus `min`/`max`/`step`/`unit` for a
`range`, `options: [{ value, label }]` for a `select` (`allowCustom` lets
it take free text), and `accept` for a `file`. Field types: `range`,
`select`, `toggle`, `text`, `file`.

| Action | LLM | Modes | Params (`directive.params`) |
| ------ | --- | ----- | --------------------------- |
| `base_edit` | no | all | `duration`, `style` (auto, talking_head, montage), `pacing`, `tighten`, `threshold`, `padding`, `music`, `beatSync`, `autoBroll`, `naturalSound`, `title` |
| `generate_edit` | yes | all | `duration`, `style` (free text), `pacing`, `tighten`, `threshold`, `padding`, `beatSync`, `autoBroll`, `naturalSound` |
| `generate_script` | yes | — | `duration`, `style`, `pacing`, `variants` (1–5) |
| `execute_script` | yes | all | `scriptPath`, `tighten`, `threshold`, `padding`, `beatSync`, `autoBroll`, `naturalSound` |
| `insert_broll` | optional | insert, append, prepend, range | `duration` (per clip), `count`, `placement` (insert, overlay), `naturalSound`, `useLlm` |
| `motion_piece` | optional | all | `theme`, `duration`, `pacing`, `seed`, `particles`, `useLlm` — a piece of generated layers only, no media: [DIRECTOR-MOTION.md](./DIRECTOR-MOTION.md) |
| `site_demo` | optional | all | `url` (required), `look` (window, full), `theme`, `size`, `pacing`, `duration`, `zoom`, `captions`, `title`, `useLlm` — a recorded demo of a web page, no media: [DIRECTOR-WEB.md](./DIRECTOR-WEB.md) |
| `score` | optional | replace, range | `style`, `energy`, `key`, `bpm`, `duck`, `volume`, `seed`, `useLlm` — music written for the timeline, one music clip ducked under speech: [DIRECTOR-SCORE.md](./DIRECTOR-SCORE.md) |
| `remove_silence` | no | replace, range | `threshold`, `padding` |
| `beat_sync` | no | replace, range | `every` (1, 2, 4), `maxShift`, `protectSpeech` |
| `add_captions` | no | replace, range | `maxChars`, `maxDuration`, `position`, `size`, `background` |
| `brand` | optional | — | `title`, `subtitle`, `speakers`, a switch per part, `useLlm` — dresses the timeline in the project's brand kit: [DIRECTOR-BRAND.md](./DIRECTOR-BRAND.md) |

The project's [brand kit](./BRAND.md) is the default look of everything above: themes,
titles, captions and musical style default to `brand`, and a plan may name the kit's
elements — [DIRECTOR-BRAND.md](./DIRECTOR-BRAND.md).

`pacing` is `slow`, `medium` or `fast` (picture shots of about 5.5 s, 3.5 s
and 2 s; stills 6 s, 4.5 s and 2.5 s). `naturalSound` says what happens to
the sound of b-roll: `low` (gain 0.25), `full` or `off` (no audio clip).

For `score` and the three **in-place** actions `mode` is a *scope*, not a
placement: `replace` works on the selected clips (`context.selection`) or,
with no selection, on the whole timeline; `range` works only inside
`context.range`. They need the current `edl` in the request.

When a generating action runs in mode `range` and no `duration` was given,
the range's length becomes the target, so the fragment fills the hole.

## Requests, jobs and errors

`POST /api/director` and `POST /api/director/script` validate everything
they can before a job exists (`src/api/director/request.js`):

| Status | When |
| ------ | ---- |
| 400 | No `directive`, unknown `action`, no `projectId`, or a non-script action sent to `/director/script` |
| 403 | `params.scriptPath` outside the allowed folders |
| 404 | Unknown project or adaptation, missing script file |
| 422 | Bad `mode` or params (`fields` names each one, e.g. `params.duration`), `range` mode without `context.range`, a malformed `edl`, an in-place action without `edl`, `execute_script` without a script |
| 503 | An action that needs the LLM while `LLM_PROVIDER=none` or the server/model cannot be reached (`detail` says which). Checked before the job starts |

The job (`type` `director` or `script`) runs in the `llm` lane when it will
call the model and in the default lane otherwise, logs what it is doing
("8 media files (7 analysed)", "Asking qwen3:14b for an edit plan…",
"Plan received: 9 picks — assembling…"), reports the model's output as
progress, and aborts the HTTP request to the model when it is cancelled.
`POST /api/director` also accepts `generate_script`; the job result is then
the script result, not a DirectorResult.

Every result carries `summary` (one line) and `notes` (everything the
director assumed, dropped or could not do). Beyond the fields in API.md a
DirectorResult has `duration` (the fragment's length in seconds); `range`
is `null` unless the mode is `range`; and generated fragments put a marker
at each pick that has a `note`.

## Track layout

Fragments address tracks as "the Nth track of a type". The director always
uses the same rows (`src/utils/director/layout.js`):

| Row | Name | Holds |
| --- | ---- | ----- |
| video 0 | Titles | Opening title, per-pick titles, captions |
| video 1 | B-roll | Cutaways laid over the main picture: a plan's `visuals`, auto b-roll |
| video 2 | Main | The spine: every pick's own picture, stills |
| audio 0 | Dialogue | Speech: narration, and the linked sound of `primary` picks |
| audio 1 | Ambience | Linked sound of b-roll, at reduced gain |
| audio 2 | Music | The music bed |

The first video track is the front-most layer, so titles cover cutaways,
which cover the main picture. A generated fragment lists all six rows
(empty ones included) so the layout comes into being on first use; in
`replace` mode it also lists, empty, every further track of the posted
document. Track names apply to tracks the merge has to create — an existing
track keeps its own name.

`insert_broll` is the exception: a ripple insert goes on the track of the
picture it interrupts (see below).

## Media context

`context/gather.js` scans the project's media roots (`lib/mediaScan.js`)
and reads each file's sidecar (`lib/sidecar.js`). A file with no fresh
sidecar is probed on the spot, so un-analysed files still take part with
their length, size and whether they have sound. Text files are ignored.
Files are ordered by path (project files first, then global ones) and get
handles `m1`, `m2` … — the only names a plan may use.

Each file is classified (`context/mediaInfo.js`):

| Kind | Rule |
| ---- | ---- |
| `still` | An image |
| `speech` | Video: at least 30% of its length is spoken. Audio: at least 25%, or a telling filename (voice, narration, interview, podcast…) on a file that has some transcript or no analysis at all |
| `picture` | Any other video |
| `music` | Any other audio |

Tags override the heuristics: tag a file `music`, `speech` (or
`interview`, `voiceover`, `narration`) or `b-roll` through
`PUT /api/sidecar` to settle it. A sidecar with words but no `segments`
gets sentence-like segments derived from the words.

The **digest** (`context/digest.js`) is the text put in a prompt:

```text
m1 video "broll/beach.mp4" 8.0s 320x180 with sound [picture]
  tags: beach, dog, sea
  about: A dog runs along an empty beach.
  shots: 1 0.0-3.0, 2 3.0-8.0
m3 video "interview.mp4" 16.0s 320x180 with sound [speech]
  transcript (3 segments):
    s1 [1.0-4.5] we arrived at the park early in the morning
    s2 [6.6-9.3] the dog ran straight to the beach
m4 audio "music/bed.wav" 30.0s [music] 120 bpm
m6 image "stills/tall.png" 480x960 [still image] (not analysed)
```

It is budgeted in characters (22,000 by default, about 6–8k tokens; Ollama
is asked for a 16k context). Every file's header is always present. What
is left is shared between the transcripts: one that fits its fair share is
shown whole and the rest is redistributed. A transcript that does not fit
is **windowed**, not truncated: coherent stretches are shown around the
segments that match the request and at even intervals through the file,
with markers such as `… s41–s97 not shown (4m 12s)`. Segment numbers are
always those of the full transcript, so a plan can cite any of them. With
hundreds of files the headers are compacted, and if they still do not fit
the files most relevant to the request are kept and the rest is counted
(`(57 more files are not listed)`, also reported in `notes`).

## Edit plan

The compact JSON an LLM returns, and the same shape the base-edit
heuristics produce. Schema: `src/utils/director/planSchema.js`.

```json
{
  "rationale": "Open on the arrival, let the interview carry the story.",
  "title": "A Day at the Park",
  "music": { "file": "m5", "start": 0, "volume": 0.3 },
  "picks": [
    { "file": "m1", "role": "primary", "segments": [1, 4], "note": "introduction" },
    { "file": "m1", "role": "narration", "segments": [9, 12],
      "visuals": [{ "file": "m2" }, { "file": "m4", "start": 3 }] },
    { "file": "m3", "role": "broll", "start": 4, "end": 9, "title": "Golden hour" }
  ]
}
```

| Field | Meaning |
| ----- | ------- |
| `picks[]` | Required. Played one after another; together they are the spine and set the length |
| `file` | Required. A handle from the digest |
| `role` | `primary` (picture with its own sound), `narration` (voice only — `visuals` supply the picture), `broll` (picture on its own, sound turned down), `music` (same as the top-level `music`). Left out, it follows the file's kind |
| `segments` | Transcript segment numbers. Two numbers are a range (`[3, 9]` = 3 to 9); a longer list is split wherever the numbers stop being consecutive |
| `start`, `end` | Rough seconds in the file |
| `scene` | A shot number from the digest |
| `duration` | Length for a still or an open-ended pick |
| `visuals[]` | Pictures laid over this pick (cutaways), each `{ file, start?, end?, scene?, duration? }` |
| `title` | Text shown over this pick |
| `note` | Section label; becomes a marker |
| `title` (top level) | Opening title |
| `music` | The bed: `{ file, start?, volume? }` |

A pick names its part with `segments`, or `start`/`end`, or `scene` — or
nothing, and the assembler chooses the most usable part.

**From reply to plan** (`plan/`): reasoning blocks (`<think>…</think>`)
are stripped; JSON is taken from a code fence or the first balanced
object in the prose (a truncated object runs to the end); `jsonrepair`
fixes what `JSON.parse` rejects; harmless deviations are normalised
(synonymous keys such as `source`/`in`/`out`, `"1:05"` or `"12s"` as
seconds, `"s3-s5"` as segments, a bare list as `picks`, a `{ "plan": … }`
wrapper); then the plan is validated with ajv. If it is invalid — or no
pick names a known file — the model is asked **once** more with the
errors listed. If the retry is still invalid, the individually valid
picks are kept and the rest dropped with a note; if none are valid the job
fails with the errors.

**Resolution** (`plan/resolve.js`): a handle (or, leniently, a path or
file name of project media) becomes the real file; anything else is
dropped and explained in `notes`. Segment and shot numbers become times.
Roles are made to fit the file (a still is always picture, a silent video
cannot be `primary`, an audio file cannot be `broll`). The resolved plan is
returned as `DirectorResult.plan`.

## Assembly

`assemble/` turns a resolved plan into a fragment. All placement is done
in whole frames of the adaptation's frame rate; source times sit on the
same grid, so `timelineEnd - timelineStart` equals `sourceOut - sourceIn`
for every media clip and linked clips share their times exactly.

1. **Speech** (`primary`/`narration` picks of a speech-led file). The rough
   range is snapped *outward* to whole words: a word counts as inside when
   it overlaps the range by more than 60 ms. `padding` is added at both
   ends, but never past the midpoint of the gap to the neighbouring word.
   With `tighten`, pauses longer than `threshold` are cut out (the same
   padding is kept on each side), which splits the pick into several
   clips. Without word timestamps the cut falls on segment boundaries and
   pauses come from detected `silences`. Ends are rounded outward to the
   frame. An open-ended speech pick is capped at the target length.
2. **Picture** (everything else). An end within 0.5 s of a shot boundary
   moves onto it (0.2 s for the takes `base_edit` and `insert_broll` have
   already trimmed inside their shots). An open-ended pick takes the
   middle of the best shot — long enough if possible, away from the first
   and last moments — and rotates through the shots when a file is used
   again.
3. **Beats.** With `beatSync` and a bed that has beat analysis, every
   picture-only cut is moved to the nearest beat, as long as that changes
   the clip by less than half its length and the source has the footage.
   Speech is never re-timed to a beat.
4. **Clips.** A video with sound becomes a video clip and a linked audio
   clip. `primary` goes on Main and Dialogue. `narration` goes on Dialogue
   only (and on Main when the file has picture and the pick has no
   `visuals`). `broll` goes on Main, with its sound on Ambience at reduced
   gain. Sources are clamped to their length. Speech clips are labelled
   with the words they contain.
5. **Visuals** share their pick's time evenly (cut on the beat when there
   is one) on the B-roll track.
6. **Auto b-roll** (`autoBroll`). Speech with no picture is covered end to
   end with project footage and stills not already in the plan, matched by
   keywords between what is said and the tags, description and filename,
   least-used first. Where a talking head jumps (two cuts of one speaker
   meeting, as pause removal leaves them) a cutaway is laid across the
   cut: starting before it, leaving the speaker on screen at least half a
   second either side, two cutaway lengths apart, and no more once every
   spare file has been used twice.
7. **Stills** get a ken burns move with `kenBurns.enabled`: a slow zoom
   when the image has about the frame's shape, a sideways pan when it is
   wider than the frame (a landscape photo in 9:16), a vertical pan when
   it is taller (a portrait in 16:9). Speed is capped at 4% of the frame
   per second and the direction alternates.
8. **Music** is one clip on the Music track from `music.start`, at gain
   0.25 under speech or 0.7 on its own (or `music.volume`), with a
   fade-out of up to 2 s. A bed shorter than the edit ends early, with a
   note.
9. **Titles.** The opening title shows for 4 s, centred, with a fade. A
   pick's title is a lower third for up to 3.5 s; it waits for a title
   already showing and is left out (with a note) if no second of its pick
   remains. Text is sized from the output resolution and wrapped to two
   lines when the frame is narrow.
   Both are now drawn by the brand kit's `title` and `lower-third` elements:
   [DIRECTOR-BRAND.md § Elements in a plan](./DIRECTOR-BRAND.md#elements-in-a-plan).

## Base edit

`base_edit` needs no LLM (`actions/baseEdit.js`, `baseEdit/`). It writes a
plan from the sidecars alone and sends it through the same resolver and
assembler. Only the project's own files are used; a global file can only
serve as the music bed.

`style: auto` chooses **talking head** when the project holds at least 10 s
of speech (or a quarter of the target), otherwise **montage**. The notes
say how the media was read and why the style was chosen.

**Talking head.** Speech files are taken in path order. If all the speech
fits the target (within 15%) it is all used. Otherwise each file gets a
share of the target in proportion to its speech (files whose share would be
under 4 s are left out), and from each file the run of consecutive
transcript segments closest to its share is taken — whole segments, so
picks begin and end on sentences; among equally close runs the most fluent
(most words per second) wins. The assembler then removes the dead air, and
auto b-roll covers voice-only stretches and jump cuts.

**Montage.** Picture files and stills, in path order. The shot length
comes from `pacing`, stretched to a whole (even) number of beats when the
bed has a tempo; shot count and length are settled together so the result
lands on the target, holding fewer shots for longer when material is
short. Every file gets a turn before any is used twice; extra shots go to
the files with the most footage. Within a file the longest shots are used,
trimmed to their middle; a long take without shot data is sampled at even
intervals. With probe data alone this still gives an evenly sampled cut of
the right length. With a music bed the clips' own sound is kept low; with
none it plays at full level.

**Music.** The project's music file with beat analysis, long enough for
the edit, is preferred. The bed starts on its first beat, so the first cut
is on the beat too.

## Working on the existing timeline

`remove_silence`, `beat_sync`, `add_captions`, `score` and the `overlay` placement
of `insert_broll` change the timeline without rippling new material into
it. They copy the posted document, rewrite the copy and return **the whole
timeline** as a `replace`: the one mode whose outcome does not depend on
how overlapping material is merged. Such a result lists every track of the
document in order (each entry also carries the track's `trackId`, `muted`,
`solo`, `locked` and `volume`), keeps clip ids, passes the document's
markers through, and sends locked tracks empty, since a replace never
touches them.

Two things to know about how such a result is merged today
(`applyDirectorResult`): tracks are matched by row and an existing track
keeps its own name, so when a track is added in front (captions, a
cutaway) the names stay with the rows while the clips move down one; and
every clip of a fragment gets a new id, so a selection does not survive.
The picture is right either way.

**`remove_silence`** (`inplace/removeSilence.js`). Targets: the selected
clips, else every clip with sound whose file has word timestamps (or, for
speech-led files, detected silences); music is skipped unless selected.
For each target the pauses longer than `threshold` are found in the part
of the file the clip plays, shrunk by `padding` on each side, rounded
*inward* to frames, and kept off the clip's fades. Then:

- a target and its linked partner are cut at the same frames and re-linked
  piece by piece, so picture and sound stay in sync; the first piece keeps
  the original clip id;
- every other clip follows the timeline: its start moves left by the time
  removed before it, and any removed time it spanned comes off its tail,
  so a music bed is trimmed rather than chopped up;
- markers move the same way; overlaps are re-stated as cross-fades;
- locked tracks are left alone, with a note that they may be out of sync.

**`beat_sync`** (`inplace/beatSync.js`). The music clip is the selected
one, else the longest audio clip whose file has beats (music first); the
picture track is the one holding a selected picture clip, else the
unlocked video track with the most picture clips. Each cut is *rolled* to
the nearest beat within `maxShift`: the outgoing clip's end and the
incoming clip's start move together, with their linked sound, so the
length of the edit and every other track stay as they were. A cut is left
alone (and listed in `notes`) when the move would need footage that is not
there, leave a clip shorter than 0.3 s, run linked sound into a neighbour,
or — with `protectSpeech` — cut into a word; the next nearest beat is
tried first.

**`add_captions`** (`inplace/addCaptions.js`). For the selected clips, or
every clip that is heard (not music, not on a muted track), the words the
clip plays are grouped into phrases: a new phrase starts at a pause over
0.6 s, at the character or duration limit, after a sentence end, or after
a comma once the phrase is long enough. Phrase times are mapped from
source to timeline time through the clip
(`timelineStart + (t - sourceIn)`). Each caption lingers 0.3 s after its
last word and shows for at least 0.7 s, but never into the next one.
Captions are title clips on the front-most video track; when that track is
busy at those moments a new `Captions` track is put in front of
everything. Text size, position and line length follow the output
resolution. Files with segments but no words are captioned from the
segments, timed by share of characters.

**`insert_broll`** (`actions/insertBroll.js`, `search.js`). Candidates are
scored by keywords from the prompt (stop words and editing chatter such as
"insert a clip of" removed; "dog" matches "dogs"): tags ×3, description
×2, file name ×2, the best keyframe ×2, the best transcript segment ×1. A
keyframe or segment match also gives the moment to use. Files already on
the timeline and talking heads are handicapped, not excluded. With
`useLlm` the model chooses from the picture files instead; if it cannot,
keyword matching takes over and a note says so. Placement:

- `insert` (default) — a ripple insert at the playhead in the given
  `mode`, on the track of the picture under the playhead; its sound goes
  on an `Ambience` track when there is one, else beside the sound of the
  picture it interrupts, else on a new `Ambience` track;
- `overlay` — a cutaway: nothing moves, the picture goes on a free track
  in front of what is showing (a new one if needed, never a titles track)
  and its sound on a free track of its own.

## Scripts

`generate_script` asks the model for `variants` Markdown edit scripts, each
from a different angle (straight telling, hook first, tighter, pictures
leading, building to a finish). They are saved as
`<project>/scripts/<adaptation>/<date>-<time>-option-<n>.md` — never
overwriting — and returned as
`{ scripts: [{ variant, filename, filePath, script }], count, folder, summary, notes }`.
The files appear in `GET /api/media` as text media, to be read and edited.

`execute_script` takes the approved script from `directive.prompt`, or
from `params.scriptPath` (a `.md`/`.txt` file inside the allowed folders),
asks the model to convert it into an edit plan without adding or dropping
anything, and assembles the plan like any other.

## LLM client

`llm/client.js` puts one interface over two providers, chosen by
`LLM_PROVIDER` ([CONFIGURATION.md](./CONFIGURATION.md)):

| Provider | Endpoint | Stream |
| -------- | -------- | ------ |
| `ollama` | `POST {LLM_URL}/api/chat` | Newline-delimited JSON; `format: "json"` in JSON mode; availability from `/api/tags` (the model must be installed) |
| `openai` | `POST {LLM_URL}/v1/chat/completions` | Server-sent events; `response_format: json_object` in JSON mode, dropped and retried once if the server rejects it; optional bearer `LLM_API_KEY`; availability from `/v1/models` |
| `none` | — | Every call is a 503 |

`chat({ messages, json, onToken, signal, timeoutMs, idleMs, temperature,
maxTokens })` streams, calls `onToken` per piece, strips reasoning blocks
from `text` (kept in `raw`) and fails with a status: 503 unreachable or
unknown model, 504 no answer in time (an hour overall, 5 minutes of
silence), 502 a bad answer. A server that ignores `stream` and answers
with one JSON body is read as a complete message. The transport is
injectable (`createLlmClient(cfg, { fetch })`).

## Code map

| Path | What |
| ---- | ---- |
| `src/utils/director/` | Isomorphic and pure: action schemas, directive normalisation, plan schema, layout, word alignment, pause removal, phrase grouping, keywords, frame maths |
| `src/api/director.js` | The three routes |
| `src/api/director/request.js`, `run.js` | Validation before the job; the job worker |
| `src/api/director/llm/` | Client, providers, stream reader, reply cleaning |
| `src/api/director/context/` | Media gathering, classification, digest, transcript windowing |
| `src/api/director/plan/` | Normalise, parse, request with retry, resolve, describe |
| `src/api/director/assemble/` | Plan → fragment |
| `src/api/director/baseEdit/` | Heuristic planners |
| `src/api/director/inplace/` | Actions on the existing timeline |
| `src/api/director/motion/`, `src/utils/director/motion/` | The motion piece: plan, themes, vocabularies, builder ([DIRECTOR-MOTION.md](./DIRECTOR-MOTION.md)) |
| `src/api/director/web/`, `src/utils/director/web/` | The site demo: brief grammar, name matching, pacing, recording, framing ([DIRECTOR-WEB.md](./DIRECTOR-WEB.md)) |
| `src/api/director/score/`, `src/utils/director/score/` | The score: styles, tempo fitting, sections, the song generator, speech and ducking ([DIRECTOR-SCORE.md](./DIRECTOR-SCORE.md)) |
| `src/api/director/actions/`, `scripts/`, `prompts/` | Action entry points, script files, prompts |
| `src/api/director/testing/` | Test fixtures: lavfi media projects, a fake LLM server, the fragment invariant checker |
| `src/api/director/brand/`, `src/utils/director/brand/` | The brand kit in the director: theme, element items, the brand pass ([DIRECTOR-BRAND.md](./DIRECTOR-BRAND.md)) |

Tests sit beside the code (`node --test`). Everything deterministic is
tested against generated media and hand-built sidecars; the LLM paths run
against a local fake server that speaks both stream formats, including
malformed and over-talkative replies; `integration.test.js` merges every
kind of result with `applyDirectorResult` and checks it with
`validateEdl`.
