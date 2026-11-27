# Examples

Timelines written without the editor. Each one is an ordinary NearEdit
document: open it in the editor, or draw and render it from a shell with
`bin/nearedit.js`.

## Made from nothing

A 25 second piece with **no footage and no images** — every pixel is
drawn by a generator (gradient, pattern, noise, shape, particles) or is
text, moved by keyframes and finished with effects.

| Scene       | Seconds | What it shows                                              |
| ----------- | ------- | ---------------------------------------------------------- |
| Opening     | 0–5     | Radial gradient with a keyframed centre, dust particles, a title arriving letter by letter with a keyframed glow |
| Shapes      | 5–10    | Ellipse, star and polygon popping in (`back-out`), turning and changing colour, over a drifting dot pattern revealed by a radial wipe |
| Particles   | 10–15   | Fireflies, a fountain of sparks and a confetti burst over slow noise |
| Effects     | 15–20   | A gradient resolving out of a mosaic, a masked stripe overlay in `overlay` blend, a title with keyframed colour fringes, a clock wipe out |
| End card    | 20–25   | Star field, the name, a line drawn by a keyframe            |

```bash
node examples/made-from-nothing/build.js
```

```bash
node bin/nearedit.js validate examples/made-from-nothing/made-from-nothing.json
```

```bash
node bin/nearedit.js frame examples/made-from-nothing/made-from-nothing.json --time 12 -o frame.png
```

```bash
node bin/nearedit.js render examples/made-from-nothing/made-from-nothing.json -o made-from-nothing.mp4
```

How it is written:

- `made-from-nothing.json` — the document itself. `build.js` writes it;
  the test beside it fails when the two drift apart.
- `piece.js` — the tracks and the order of the scenes.
- `scenes/*.js` — one file per scene. Read these first.
- `kit.js` — five small helpers (`generator`, `particles`, `title`,
  `effect`, `keys`) over the document operations in `src/utils/edl/`:
  `insertGenerator`, `insertTitle`, `addEffect`, `setKeyframe`,
  `updateClip`. Nothing here is special to the example — the editor's
  buttons call the same functions.

To make your own, copy the folder, change the scenes and run `build.js`;
or skip the script and write the JSON by hand — `nearedit validate`
explains what is wrong with a document, and `nearedit catalog` lists every
generator, effect, preset, font and easing with its parameters.

Reference: [the document](../docs/app-spec/EDL.md),
[the compositor](../docs/app-spec/COMPOSITOR.md),
[particles](../docs/app-spec/PARTICLES.md),
[effects](../docs/app-spec/EFFECTS.md).
