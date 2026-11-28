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
are repaired first. Groups are made per clip, from the words the clip
actually plays, so a caption never shows a word that was cut away.

The same groups make subtitle files: `timelineCues(edl, wordsOf)` walks the
timeline's captioned clips and returns cues in timeline time, which
`formatSrt` / `formatVtt` write out. By default the cues are the groups as
drawn; `{ group: SUBTITLE_GROUP }` gives two-line phrases instead, for a
file meant to be read by a player. An export can save them beside the
video.

## Drawing

Captions are the last thing drawn, over every track: for each clip that
has them and sounds at this instant, the compositor asks the host for its
words (`env.words(clip)`, like `env.image`), finds the group, lays the
words out with the text engine and draws them with the style. Two voices at
once stack. A clip whose words have not arrived yet draws none, and the
preview draws again when they do. On the server the words are loaded before
the first frame; a segment with captions is rendered by the compositor.
A caption costs about a millisecond a frame at 1920 × 1080 (0.2 for
`boxed`, 2 for `minimal`), nearly all of it the soft shadow; the server and
the browser draw the same pixels.

## Editing

- **Switching on**: per clip in the inspector, or "Caption all speech" for
  the timeline. A clip without a transcript offers to transcribe it.
- **Style**: presets as tiles with a live preview, then the controls of
  `CAPTION_STYLE`, in the document's settings.
- **Fixing a word**: in the transcript panel — a correction is part of the
  transcript, so the caption and every other use of that word follow.
- **The director**: `add_captions` gains a mode — `words` switches
  captions on and sets a style; `phrases` makes title clips as before.

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
