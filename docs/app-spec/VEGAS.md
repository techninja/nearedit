# Vegas Parity

NearEdit's timeline is modelled on Vegas: direct, keyboard-driven, no tools
to switch between. This document says what of Vegas Pro is here, under which
key or gesture, and where NearEdit differs.

Two keyboard layouts ship. **NearEdit** is the layout the editor has always
had; **Vegas** follows Vegas Pro's defaults. Choose one in the shortcuts
dialog (`?`, or `F1` in the Vegas layout); the choice is remembered. Your own
remapping in `localStorage.nearedit_keymap` (format: end of
[README.md](./README.md)) applies on top of whichever layout is active, and
the dialog warns when one of your keys takes a key another command had.

Every binding below is a command in the registry
(`src/utils/commands/registry.js`), so the toolbar, the context menus, the
shortcuts dialog and both layouts all use the same actions.

## Vegas terms

| Vegas | NearEdit |
| ----- | -------- |
| Event | Clip |
| Time selection / loop region | The same single thing here too: `loopStart` … `loopEnd` in the view state. `Q` loops it |
| Region | `regions` in the document (see [EDL.md](./EDL.md)): start, end, name, colour |
| Auto ripple | Ripple editing (`mode.ripple`), with the same three scopes |
| Post-edit ripple | `F` / `Ctrl+F` / `Ctrl+Shift+F` after any edit |
| Edge-trimming mode | Edge-trim mode: `[` / `]`, keypad 7 / 9 |
| Automatic cross-fades | The same (`mode.autoCrossfade`); overlapping clips cross-fade |
| Quantise to frames | Always on: every edit lands on a frame |
| Event group | Group (`groupId`); picture and sound of one file are *linked* instead |
| Focused track | The active track: the one whose header or lane was last clicked |

## The Vegas layout

`Ctrl` is the Control key on every platform; where the table says `Mod` it is
Ctrl, or Cmd on macOS (clipboard and undo only). A dash means the command has
no key in that layout; it is still in the menus and the dialog.

### Transport

| Key | Action | NearEdit layout |
| --- | ------ | --------------- |
| `Space` | Play / stop — the playhead returns to the cursor | `Space` |
| `Enter` | Play / pause — the cursor stays where playback stopped | `Enter` |
| `Shift+Space` | Play from the start | `Shift+Space` |
| `J` / `K` / `L` | Shuttle backwards / pause / forwards. Repeated `J` or `L` steps 1× → 2× → 4× → 8×; the other key turns round at 1× | — (`J` / `L` jump 2 s, `K` stops) |
| `Q` | Loop playback | `Q` |
| `Ctrl+Home`, `W` | Go to the start | `Home` |
| `Ctrl+End`, `E` | Go to the end | `End` |
| `Home` / `End` | Go to the start / end of the time selection, or of the view when there is none | `Shift+Home` / `Shift+End` |

### Cursor

| Key | Action | NearEdit layout |
| --- | ------ | --------------- |
| `←` / `→` | One pixel (never less than a frame) | `Alt+←` / `Alt+→` |
| `Alt+←` / `Alt+→`, `F3` / `F9` | One frame | `←` / `→` |
| `Ctrl+←` / `Ctrl+→` | Previous / next marker or region end | `Shift+↑` / `Shift+↓` |
| `Ctrl+Alt+←` / `Ctrl+Alt+→` | Previous / next event edge | `↑` / `↓` |
| `PgUp` / `PgDn` | Previous / next grid mark (the labelled ticks of the ruler) | the same |
| `1` … `9`, `0` | Go to marker 1 … 10 (in time order; an unnamed marker shows its number) | the same |
| `Ctrl+G` | Go to a typed time | `Mod+G` |
| `\` | Centre the view on the cursor | `\|` |

Go-to accepts timecode (`1:02:03:04`, leading fields optional), bare digits
filled from the right as in Vegas (`1000` is ten seconds), decimal seconds
(`12.5`), and a leading `+` or `-` to move from where the cursor is.

### Time selection

| Key | Action | NearEdit layout |
| --- | ------ | --------------- |
| `I` / `O` | Mark in / out at the cursor | the same |
| `Shift+←` / `Shift+→` | Extend by a pixel | `Alt+Shift+←` / `Alt+Shift+→` |
| `Ctrl+Alt+Shift+←` / `→` | Extend to the previous / next event edge | the same |
| `Backspace` | Recall the previous time selection (five are kept) | — |
| `Ctrl+T`, `Alt+T` | Trim to the time selection: the selected clips, or every clip when none is selected; clips wholly outside it are deleted | `Alt+T` |
| `R` | Region over the time selection (or over the selected clips), then type its name | `Shift+R` |
| `M` | Marker at the cursor, then type its name. While playing, `M` and `R` drop marks without stopping for a name | `Shift+M` (`M` adds one unnamed) |

Extending works from the end the cursor sits on; the other end is the anchor.
With the cursor on neither end a new selection starts at the cursor.

### Zoom and view

| Key | Action | NearEdit layout |
| --- | ------ | --------------- |
| `↑` / `↓` | Zoom time in / out (also `+` / `-`) | `+` / `-` |
| `Ctrl+↑` / `Ctrl+↓` | Zoom in large steps | the same |
| `Ctrl+Shift+↑` / `Ctrl+Shift+↓` | Taller / shorter tracks | the same |
| `` ` `` | Minimise / restore track heights (short tracks show only their name in the header) | the same |
| `\|` | Zoom to fit | `\` |
| `?`, `F1` | Shortcuts dialog | `?` |

### Editing

| Key | Action | NearEdit layout |
| --- | ------ | --------------- |
| `S` | Split at the cursor | `S` |
| `Alt+[` / `Alt+]` | Trim the selection's start / end to the cursor | `[` / `]` |
| `Delete` | Delete | `Delete`, `Backspace` |
| `Mod+X` / `Mod+C` / `Mod+V` | Cut / copy / paste (also `Shift+Delete`, `Ctrl+Ins`, `Shift+Ins`) | `Mod+X` / `C` / `V` |
| `Mod+Shift+V` | Paste insert: every track opens at the cursor, markers and regions move | the same |
| `Mod+B` | Paste repeat: a dialog asks how many copies, end to end or evenly spaced | the same |
| `Mod+A` / `Mod+Shift+A` | Select all / none (`Esc` too) | the same |
| `G` | Group | `G` |
| `U` | Remove the selected clips from their group | `Alt+U` |
| `Ctrl+U` | Clear the group | `U` |
| `Shift+G` | Select the whole group | the same |
| `Mod+Z` / `Mod+Shift+Z`, `Mod+Y` | Undo / redo (`Alt+Backspace` undoes too) | the same |

### Ripple

| Key | Action | NearEdit layout |
| --- | ------ | --------------- |
| `Ctrl+L` | Auto ripple on / off | `R` |
| `F` | Post-edit ripple: affected tracks | `F` |
| `Ctrl+F` | …affected tracks, markers and regions | `Shift+F` |
| `Ctrl+Shift+F` | …all tracks, markers and regions | `Mod+Shift+F` |

After any edit that changes where things are — a delete, a cut, a trim, a
move, a paste, by key or by mouse — an arrow under the ruler shows what a
ripple would move, and `F` moves it. The ripple is its own undo step: undo
once and the plain edit is back. Auto ripple is the same thing done at once,
in the edit's own undo step, with the scope chosen in the lane's context menu
(affected tracks; plus markers and regions; all tracks).

A ripple replays the edit from the document it started on, so a paste that
overwrote part of a clip becomes a true insert when rippled: the clip is
split at the paste and its second half moves along, nothing is lost.

### Snapping and modes

| Key | Action | NearEdit layout |
| --- | ------ | --------------- |
| `F8` | Snapping | `N` |
| `Shift+F8` | Snap to markers (and region ends) | the same |
| `Alt+F8` | Quantise to frames — always on, the command only says so | the same |
| `Ctrl+Shift+X` | Automatic cross-fades | `X` |

### Tracks

| Key | Action | NearEdit layout |
| --- | ------ | --------------- |
| `Ctrl+Shift+Q`, `Alt+Shift+Q` | Add a video track | — (toolbar) |
| `Ctrl+Q`, `Alt+Q` | Add an audio track | — (toolbar) |
| `Z` / `X` | Mute / solo the focused track | — (track header) |

### Event keys

| Key | Action | NearEdit layout |
| --- | ------ | --------------- |
| Keypad `4` / `6`, `Alt+,` / `Alt+.` | Nudge the selection a pixel | the same |
| Keypad `1` / `3`, `,` / `.` | Nudge a frame | `,` / `.` |
| Keypad `8` / `2`, `Ctrl+Alt+↑` / `↓` | Move to the track above / below (of the same kind) | the same |
| `[` / `]`, keypad `7` / `9` | Enter edge-trim mode on the selected clip's start / end. Pressed again: the edge before / after along the track | Keypad `7` / `9`, `Alt+[` / `Alt+]` |
| Keypad `5`, `Esc` | Leave edge-trim mode | the same |

In edge-trim mode the chosen edge wears a bracket, the cursor sits on it, and
the nudge keys trim that edge instead of moving the clip — a frame (keypad
`1` / `3`, `,` / `.`) or a pixel (keypad `4` / `6`, `Alt+,` / `Alt+.`). A
press on the timeline also leaves the mode. The keypad works whatever NumLock
is set to; every keypad key has a second binding for keyboards without one.

NearEdit's own commands keep their keys in the Vegas layout where Vegas has
nothing there: `T` adds a title, `Shift+L` / `Shift+U` link and unlink
picture and sound, `<` / `>` nudge ten frames.

### Keyframes, effects and generators

The same keys in both layouts.

| Key | Action |
| --- | ------ |
| `;` / `'` | Previous / next keyframe of the selected clips |
| `Shift+K` / `Alt+K` | Add / remove keyframes at the playhead, on every property that is already animated |
| `Alt+E` | Show the selected clip's effects in the inspector |
| `Shift+E` | Bypass (or restore) all effects of the selected clips |
| `Ctrl+Alt+V` | Paste attributes: transform, fades, effects and keyframes of the copied clip onto the selected ones |
| `Alt+G` | Add the generator used last at the cursor |

"Clear keyframes" has no key; it is in the clip's context menu and the
shortcuts dialog.

## Keys the browser keeps

A web page never sees some keys. Measured in Chromium (Linux, a real window,
real key events from the X server — not synthetic ones, which bypass the
browser's own shortcuts):

| Vegas key | In a browser tab | What to press instead |
| --------- | ---------------- | --------------------- |
| `Ctrl+T` (trim) | Opens a new tab; the page is not told | `Alt+T` |
| `Ctrl+W` (go to start) | Closes the tab | `W`, `Ctrl+Home` |
| `Ctrl+N`, `Ctrl+Shift+N`, `Ctrl+Tab`, `Ctrl+PgUp` / `PgDn` | Taken as well — the Vegas layout does not use them | — |

Everything else in the layout reached the page, including the ones a browser
normally answers itself — `Ctrl+L`, `Ctrl+F`, `Ctrl+G`, `Ctrl+B`, `Ctrl+U`,
`Ctrl+Q`, `Ctrl+Shift+Q`, `Ctrl+Shift+A`, `Alt+←` / `Alt+→`, `F1`, `F3` — and
the editor takes them before the browser does. A bound chord is taken even
while its command has nothing to do, so `Ctrl+U` never opens "view source"
and `Alt+←` never goes back a page; copy, cut, paste, select all, undo and
redo are the exception and return to the browser when the editor cannot use
them (so text on the page can still be copied).

`Ctrl+Q` and `Ctrl+Shift+Q` are quit keys in other browsers and builds
(Firefox on Linux; Chrome's old exit shortcut) — not measured here — which is
why the track keys have `Alt+Q` / `Alt+Shift+Q` beside them. `Ctrl+T` is kept in the layout next to `Alt+T` for
wherever a browser does not claim it (an app window without tabs, say — not
measured here). Outside the browser's reach, the operating system may take `Alt+F8`
(some Linux window managers), `Ctrl+Alt+←` / `→` (workspace switching) or, on
macOS, `Ctrl+←` / `→`; remap those in `nearedit_keymap` if yours does.

## Mouse

| Gesture | Action |
| ------- | ------ |
| Drag a clip | Move (onto another clip: cross-fade) |
| `Ctrl`-drag a clip | Copy: the clip stays, the copy follows the pointer and is selected on release |
| Drag an edge | Trim |
| `Alt`-drag an edge | Slip-trim: the media moves with the edge. The other edge stays put and the dragged edge keeps showing the same frame |
| `Ctrl+Alt`-drag an edge | Roll: the cut between the clip and its neighbour moves; their outer edges stay |
| `Alt`-drag a clip | Slip the source under the clip |
| `Ctrl+Alt`-drag a clip | Slide: the clip moves with its content between its neighbours, which are trimmed to make room and to follow |
| Drag a top corner | Fade in / out |
| Right-click a fade | Choose its curve: linear, smooth, fast, slow, sharp (a cross-fade offers both sides) |
| Double-click a clip | Its span becomes the time selection |
| Double-click the ruler | The stretch between the markers on either side becomes the time selection |
| Shift-drag the ruler, or drag its top edge | Time selection |
| Drag a region's tag / an end | Move / resize the region; double-click the tag to select it, right-click to rename or delete |
| Click / drag a keyframe diamond | Move the playhead there / retime every key of the clip at that time |
| Drag a tile from the Create tab | A generator or a text style: placed where it is dropped. An effect: added to the clip under the pointer |
| Right-click | Context menu: clip, lane (with the auto-ripple scope), ruler, marker, region |

The pointer shows what a drag would do, also when Ctrl or Alt goes down over
a resting pointer. Shift bypasses snapping for one drag; with snapping on,
rolled cuts, slid clips, copies and region ends snap like everything else.

The wheel has two modes, chosen in the shortcuts dialog:

| Mode | Wheel | `Shift` | `Ctrl` | `Ctrl+Shift` |
| ---- | ----- | ------- | ------ | ------------ |
| Scrolls (default) | Scroll the tracks, or time when they all fit | Scroll time | Zoom about the pointer | Zoom |
| Zooms (Vegas) | Zoom about the pointer | Scroll time | Scroll the tracks | Move the cursor |

A trackpad pinch arrives as Ctrl+wheel, so it zooms in the default mode and
scrolls the tracks in the Vegas one; sideways scrolling moves time in both.

## Where NearEdit differs

- **Slide.** Vegas's Ctrl+Alt-drag keeps the media still on the timeline
  while the event's window moves over it. NearEdit's slide is the edit other
  editors call by that name: the clip moves with its content and the two
  neighbours are trimmed. Across a gap the clip moves freely until it meets
  the next clip. To move the window over still media, slip (`Alt`-drag) and
  move.
- **Quantise to frames cannot be turned off.** Every operation in the
  document library puts clip edges on frames.
- **Shuttle.** Forward at 1× is ordinary playback with sound. Every other
  rate scrubs the picture silently: the transport's clock plays at one speed.
- **Overwrites.** Vegas lets events lie on top of each other; here an edit
  that drops one clip onto another cross-fades them or cuts the lower one
  away (EDL.md, "Overlaps"). A post-edit ripple brings back what such an
  edit cut, because it replays the edit from before it.
- **Post-edit ripple** follows deletes, cuts, trims, moves, pastes and
  copies. A split, a roll and a slide leave nothing to follow.
- **Ripple across tracks** shifts clips that start at or after the edit; a
  clip on another track that lies across that point is left alone (paste
  insert is the edit that opens every track).
- **Markers are numbered by time**, not by the order they were made.
- **Ctrl+D** does nothing in the Vegas layout (there are no tools to return
  to); duplicate is `Ctrl`-drag, or `Mod+D` in the NearEdit layout.
- **Not here:** tools (envelope, selection, zoom), command markers and CD
  regions, event pitch keys, `Ctrl+Alt+Shift`-drags, takes, sub-frame edits.

## In the code

| What | Where |
| ---- | ----- |
| Presets and their keys | `src/utils/keyboard/presets.js`, `vegasKeys.js`, `vegasKeysEdit.js`; the active keymap: `active.js` |
| Conflicts between remapped keys | `findConflicts` in `src/utils/keyboard/keymap.js` |
| Commands | `src/utils/commands/catalog*.js`; time selection `timeSelection.js`, shuttle `shuttle.js` + `shuttleRun.js`, event keys `eventKeys.js` |
| Post-edit ripple | `src/utils/commands/editChange.js` (what did the edit do), `postRipple.js` (remember it, ripple it), `replayRippled` in `src/utils/edl/selectionEdits.js` |
| Regions | `src/utils/edl/regions.js` |
| Slip-trim, roll, slide | `src/utils/edl/slide.js` |
| Trim to a range, paste insert, paste repeat | `src/utils/edl/selectionEdits.js` |
| Gestures | `src/utils/timeline/gestureChoice.js`, `interaction/*.js`, `reduce/*.js`; wheel modes `wheel.js` |
| Preferences | `keymapPreset`, `wheelMode`, `rippleScope`, `snapMarkers`, `trackHeight`, `tracksMinimized` in `src/store/UserPrefs.js` |

A new preset is a table of command id → keys next to `vegasKeys.js` and an
entry in `PRESETS`; `src/utils/keyboard/presets.test.js` checks that it
binds only commands that exist and no key twice.
