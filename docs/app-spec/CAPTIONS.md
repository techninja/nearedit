# Captions — Words on Screen as They Are Spoken

Short groups of words, one to a few at a time, appearing in step with the
voice and marking the word being said: the captions people expect on
social video. NearEdit already knows when every word is spoken — the
transcript that drives text-based editing — so captions are not something
to generate and lay out by hand. They are **switched on for a clip that
has speech**, and the compositor draws them from the clip's own words.

```text
transcript words of the clip's file (or words written in the clip)
      + the timeline's caption style
      ─► groups of words (pure) ─► the group and the word at this instant ─► drawn on top
```

**Why they belong to the speech clip.** Captions made as hundreds of title
clips fall out of step the moment the speech is trimmed, split, slipped or
rippled, and restyling them means touching every one. Words are timed in
the clip's source time, like keyframes: whatever happens to the clip, the
right word is on screen at the right frame, and there is nothing to
regenerate. One style for the timeline restyles every caption at once.

## In the document

On a clip (video or audio) that has speech:

```json
{ "sourceFile": "/project/talk.mp4", "sourceIn": 12, "sourceOut": 31,
  "captions": { "on": true } }
```

- `on` draws captions for this clip while it is **heard**: a clip on an
  audio track while that track sounds (mute and solo count); a picture
  clip linked to a sound clip through that partner — one voice, even with
  both switched on; a picture clip with no partner while its track is
  shown. `captionVoices(edl)` is that rule.
- The words are the transcript of `sourceFile` (its sidecar), with every
  correction made in the transcript panel. A clip may instead carry its own
  — `"words": [[start, end, "text"], …]` in source seconds — for speech
  without a transcript, for lyrics over a music clip, or for a document
  written by hand; when present they are the ones used.
- Nothing is stored about groups, lines or timing: those follow from the
  words and the style every time a frame is drawn.

On the document, the style every caption is drawn with:

```json
{ "captions": { "style": { "preset": "pop", "size": 6, "highlight": { "color": "#facc15" } } } }
```

Both fields are optional and absent when there is nothing to say: a clip
has no `captions` while they are off and it carries no words, a document
none until it names a style — so a document without captions is the
document it always was. Only a clip that plays video or sound (footage, a
sound file, a web or a music clip) can have the block. `normalizeEdl`
reads both (`normalizeCaptions`, `normalizeCaptionStyle`: words as triples
in time order, to the millisecond; a style as its preset and what differs),
`validateEdl` accepts exactly what it writes, and the saved document
carries them. Words are in source seconds, so a clip keeps its block as it
is through every edit — move, trim, slip, ripple, copy and paste — and the
pieces of a split clip share one list.

**Editing them** is five operations ([EDL-OPERATIONS.md](./EDL-OPERATIONS.md#captions)):
`setCaptions`, `captionAllSpeech`, `setCaptionWords`, `setCaptionStyle`
and `patchCaptionStyle`. They write a linked pair's block on its **sound
clip**, whichever of the two was named — the voice belongs to what is
heard, so unlinking, or deleting the picture, leaves the captions where the
speech is. `updateClip` cannot write `captions`.

## Style

A style is a preset plus what differs from it. Lengths are in units (one
hundredth of the frame's shorter side), so a style suits wide, tall and
square frames alike.

| Field | Default | Notes |
| ----- | ------- | ----- |
| `preset` | `clean` | `clean`, `pop`, `karaoke`, `boxed`, `minimal` — each a complete style |
| `font` | `{ family: 'Inter', weight: 800 }` | A bundled family or one of the document's fonts |
| `size` | 5.2 | Text height in units |
| `case` | `as-is` | `as-is`, `upper`, `lower` |
| `color`, `stroke`, `shadow` | white, a dark outline, a soft shadow | Readable on any picture without a plate. `stroke.{color,width}`, `shadow.{color,opacity,blur,x,y}` |
| `plate` | off | A box behind the group: `plate.{on,color,opacity,padding,radius}` |
| `highlight` | `{ mode: 'color', color: '#facc15' }` | How the word being said is marked: `color`, `box` (a pill behind it; the letters on it turn dark or white, whichever reads), `scale` (larger, by `highlight.scale`, and coloured), `underline`, `none` |
| `unspoken` | `show` | `show` every word of the group at once, `dim` those not yet said, or `hide` them until they are |
| `group` | `{ words: 3, chars: 18, lines: 1, pause: 0.5 }` | At most this many words and characters per group, on one line or two; a pause this long, or the end of a sentence, starts a new group |
| `punctuation` | `keep` | `keep` or `strip` |
| `position` | `{ anchor: 'bottom', offset: 12 }` | `top`, `middle` or `bottom`, and how far in from that edge |
| `motion` | `{ in: 'pop', word: 'pop', seconds: 0.12 }` | How a group arrives (`none`, `fade`, `pop`, `slide`) and how the said word reacts (`none`, `pop`, `glide`, `fill`) |
| `hold` | 0.3 | Seconds a group stays after its last word, unless the next one starts |

`CAPTION_STYLE` (`src/utils/captions/style.js`) is this table as data,
field by field — an editor is generated from it — and `CAPTION_PRESETS`
the named styles:

| Preset | Look |
| ------ | ---- |
| `clean` | Three words in heavy white with an outline; the said word turns yellow |
| `pop` | Two big upper-case words, no punctuation; the said word grows and turns green |
| `karaoke` | A line or two of the sentence, dim until said, filling in cyan |
| `boxed` | Four words on a dark plate; a yellow pill glides from word to word |
| `minimal` | A light two-line subtitle with an underline that follows the voice |

In a tall frame the offset counts for more — a caption sits about a fifth
of the way up a 9:16 picture, clear of what the apps draw over it. Weights
are drawn with the nearest bundled one (Inter has 400, 700 and 900).
Captions are centred. A [brand kit](./BRAND.md) carries a caption style
among its tokens; using a kit sets the timeline's style from it.

## Groups and timing

`captionGroups(words, style)` (`src/utils/captions/groups.js`, pure) turns
words into groups: it fills a group up to the word and character limits,
never across a long pause or the end of a sentence, breaks after a comma
or a colon when it can, does not end on an article or a pronoun, keeps
short words with their neighbours rather than leaving one alone, and
balances two lines when there are two. `captionAt(groups, time)` gives the
group on screen and the word being said. A group appears with its first
word and stays `hold` seconds after its last, or until the next begins.
Words the transcript timed badly (zero length, overlapping, out of order)
are repaired first. Groups are made per voice, from the words the clip
actually plays, so a caption never shows a word that was cut away.

**A split changes nothing.** Pieces that play on from each other — they
touch on their track, the second plays its file from where the first
stopped, and they show the same words — are one voice (`runs.js`): no
group breaks at the cut and the frame at it is the frame it was. Move,
slip or trim a piece and it speaks for itself again; a word under the cut
then goes with the piece that plays most of it.

The same groups make subtitle files: `timelineCues(edl, wordsOf)` walks the
timeline's captioned clips and returns cues in timeline time, which
`formatSrt` / `formatVtt` write out. By default the cues are the groups as
drawn; `{ group: SUBTITLE_GROUP }` gives two-line phrases instead, for a
file meant to be read by a player. A render saves one beside the video
when asked ([below](#in-a-render)); `nearedit captions` writes one on its
own.

## Drawing

Captions are the last thing drawn, over every track
(`src/utils/compose/captionPass.js`): for each voice that sounds at this
instant, the compositor asks the host for its words, finds the group, lays
the words out with the text engine and draws them with the style, on
whatever canvas it is drawing — a 640-pixel preview and a 1920-pixel
render show the same picture. Two voices at once stack: the first with
words takes the style's place, the next sits clear of it.

**`env.words(clip)`** joins `image` and `frameOf` in the
[host environment](./COMPOSITOR.md#the-host-environment-env). It answers
with the transcript of the clip's file — the sidecar, its list of words,
or triples in source seconds — or `null` while it loads and when there is
none. It must hand back **the same object** until the transcript changes:
groups are remembered by it. It is not asked for a clip that carries its
own words. `requirements(edl, wordsOf?)` lists the files that will be
asked for (`words`) and the caption font with the characters it draws.
A voice whose words or font have not arrived draws nothing.

The server and the browser draw the same pixels: 22 documents — every
preset in wide, tall and square over footage, two voices, a caption over
an element and a title, a split clip, words written on the clip, a
slipped clip, a top anchor, a font of the document's own — are compared
by `tests/compose/parity.test.js` and differ in no channel.

## In the preview

The editor's compositor host (`src/utils/playback/captionWords.js`) takes
the words from the sidecar cache the transcript panel and the media bin
share (`#utils/media/sidecars.js`, `GET /api/sidecar`), so a file's
analysis is fetched once for all three and no route of its own is needed.
Every captioned file of a document is asked for when the document is first
painted. The preview paints again when words arrive — and when a sidecar
changes: a correction in the transcript panel, a transcription that has
just finished, a re-analysis. The old words stay on screen until the new
ones are there. A failed request is tried again after five seconds.

At the preview's size (769 × 433 in a 1440 × 900 window) a paused paint of
one footage layer takes 1.2 ms in Chromium without captions and 1.1 to
2.7 ms with them — up to 1.4 ms for the caption, `minimal` the most — and
playing holds 60 frames a second either way (480 frames in 8 s; at most
one late frame, with captions as without). On the server a caption costs
about a millisecond a frame at 1920 × 1080 (0.2 for `boxed`, 2 for
`minimal`), nearly all of it the soft shadow.

## In a render

- **Words** are read once, before anything is planned
  (`src/api/render/words.js`, in `prepareRender`): the fresh sidecar beside
  each captioned file. They travel to every canvas worker with the job, so
  each has them before its first frame and all draw the same words.
- **Routing.** A stretch with a sounding captioned clip that has words is
  drawn by the compositor — reason `captions` in `POST /render/plan`
  ([RENDER.md](./RENDER.md#two-renderers)). A caption's first frame is the
  frame its word starts on: `ceil(start × fps)`.
- **No words** is not an error: a captioned file without a transcript
  renders without captions, stays on the fast path, and the job says so in
  its log and in `warnings` of its result.
- **Subtitles.** `POST /render` takes `subtitles: "srt" | "vtt"` and saves
  the captions beside the video as `<name>.srt` — phrases for reading, with
  the capitals and punctuation the words were written with whatever the
  style does to them on screen, timed from the start of the range when one
  is rendered. The result names it (`subtitles`, `subtitlesUrl`); it is
  served and deleted with its video.
- **The command line.** `nearedit frame` and `render` read the sidecars
  beside the media (`<file>.nearedit.json`, also in `--media` folders);
  `validate` names a captioned clip for which no words can be found;
  `nearedit captions edit.json [--format srt|vtt] [-o file] [--as
  phrases|drawn]` writes the subtitle file; `catalog` lists the presets.

## Editing

Everything below is `src/utils/captionsUi/**` and the `captions-*` /
`caption-tile` components; each change to the document is one of the five
operations, as one undo step.

**For a clip** — Inspector ▸ Captions (`captions-inspector`), on any
selected clip that plays video or sound. A linked picture and sound are
one voice, so either shows the same group:

- the **switch** (`setCaptions`); with several voices selected it says how
  many are on and switches them together;
- one **line about the words**, from the transcript the preview draws
  (`words.js`, the shared sidecar cache), counting only the words the clip
  plays:

  | The line | When | Beside it |
  | -------- | ---- | --------- |
  | *142 words* | The file has a transcript | — |
  | *12 words written on this clip* | The clip carries words of its own | — |
  | *… — not shown while its track is silent* | On, but muted or not soloed | — |
  | *No transcript yet* | The file was never transcribed | **Transcribe** |
  | *Transcribing… 40 %* | Its transcription is running | **Cancel** |
  | *Transcription failed* | The job ended in an error — *Why?* has it | **Try again** |
  | *No speech was found in this file* | Transcribed, nothing said | **Transcribe again** |
  | *This server cannot transcribe* | No provider is usable — *Why?* says which and where to read on | — |
  | *This file has no sound to caption* | A picture without sound | — |

  **Transcribe** switches captions on at once (the undo step) and starts
  the file's transcription — the same job the transcript panel starts, and
  both show its progress (`transcribe.js`). When it finishes the cached
  sidecar is dropped and the words appear in the preview by themselves;
- **Edit words** opens the transcript panel on the clip's file, and
  **Style** unfolds the timeline's style in place.

**For the timeline** — Inspector ▸ Captions with nothing selected (the
document's view, `captions-style`): where captions stand (*On for 2 of 3
clips · 181 words*); **Caption all speech** (`captionAllSpeech`, after
every sound clip's transcript was asked for — only clips known to have
words are switched on, and a message names the files that have none);
**Save subtitles…** `.srt` / `.vtt`, written at once in the browser from
`timelineCues` as phrases for reading — the same text a render saves; and
a row for every file on the timeline without a transcript, with its own
**Transcribe** (captions on for what plays it, then the job), or, on a
server that cannot, the reason. "Caption all speech" is also a command, a
tile in Create ▸ Text (`captions-create`) and an entry in the lane's
context menu.

**Style** — below that, and under a clip's group: the five presets as
tiles, each a sentence being said, drawn by `drawCaptionAt` itself over a
backdrop (`sample.js`: a close view, seventy units across). They move in
step, rest when the system asks for less motion, and the tile of the
preset in use shows the style as it is now. Arrow keys walk the tiles;
Enter chooses. Under them the fields of `CAPTION_STYLE` as controls —
`paramControls(CAPTION_STYLE, flatCaptionStyle(style), 'captions.style')`,
in the sections the table names, each saying how many of its fields
differ from the preset; the font is a dropdown of the bundled families and
the document's own. Every change is `patchCaptionStyle`, previewed as it
is made; a drag of a slider is one undo step. **Back to preset** shows
when something differs. Position is set by its two fields: the preview
has no handle for captions.

**Commands** (both keymaps; they are in the shortcuts list):

| Command | Keys | Does |
| ------- | ---- | ---- |
| `captions.toggle` — Captions on / off | Alt+C | For the selection: on when any of it is off, else off. Also in a clip's context menu |
| `captions.all` — Caption all speech | Alt+Shift+C | As above |
| `captions.style` — Caption style… | — | Brings the inspector's style forward |

**Fixing a word** — in the transcript panel: a correction is part of the
transcript, so the caption and every other use of that word follow. Its
toolbar has a **CC** switch for the clips that play the file being read.

**On the timeline** a captioned clip — the sound clip that carries the
captions and the picture linked to it — wears a **CC** badge
(`badge.js`, through `#utils/timeline/badges.js`): dark when it has words,
amber when captions are on and the file has no transcript, inverted
(*CC…*) while that transcript is being made. Badges sit at the right end of
a clip's label strip, become a dot on a narrow clip, and pointing at one
gives its sentence as the canvas's tooltip.

**Export** — the export dialog's *Subtitle file* (none, `.srt`, `.vtt`;
remembered on this computer) is the render's `subtitles`
([above](#in-a-render)); it is offered once a clip has captions, and the
finished render names the file with a link to download it.

**The director** — `add_captions` switches captions on (`as: words`, its
default) in a look read from the request, or makes title clips
(`as: phrases`): [DIRECTOR.md](./DIRECTOR.md#working-on-the-existing-timeline).

## Limits

- One style per timeline; a clip cannot have its own.
- A group leaves by a cut — there is no exit motion — and captions are
  always centred: no alignment, italics or letter spacing.
- Where a group may not end is known for English, Spanish, French, German
  and Italian.
- Captions follow the timing the transcriber gave. A provider without word
  timestamps gives words spread evenly across each segment.
- No translation, no speaker names, no emoji insertion.
- Right-to-left and vertical scripts are laid out as the text engine lays
  out any text; scripts written without spaces are grouped by characters.
- A picture clip without a linked sound clip can be captioned, though
  nothing is heard from it; "caption all speech" leaves such clips alone.
- When one of two voices stops, the other's caption moves down to the
  first place.
- Glyphs sit on whole pixel rows of the canvas they are drawn on, so a
  line of a small preview may sit half a pixel from where the render has
  it — as for titles.
- A sidecar older than its media file is not read: the render then has no
  words for that file, and says so.
