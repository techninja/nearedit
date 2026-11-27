/**
 * Help texts of the `nearedit` command line.
 * @module bin/lib/help
 */

export const COMMANDS = ['render', 'frame', 'validate', 'catalog', 'help'];

const USAGE = {
  render: `nearedit render <edl.json> [-o out.mp4] [--preset draft|standard|high] [--range start:end]

  Encode the document to an MP4 (H.264 + AAC). Progress goes to stderr, the
  path of the finished file to stdout.

  -o, --output <file>   Where to write (default: beside the document, <name>.mp4;
                        an existing file is replaced)
  --preset <name>       draft (half size, fast), standard (default), high
  --range <start:end>   Only this part, in seconds: 5:12.5, :10, 30:
  --media <dir>         Also allow media from this folder (may be repeated)
  --workers <n>         Segments rendered at once (default: half the cores, at most 4)`,
  frame: `nearedit frame <edl.json> --time <seconds> [-o frame.png] [--width n]

  Draw the frame the render shows at that moment — footage, stills,
  generators, titles and effects — as a PNG. Prints the file's path.

  -t, --time <seconds>  The moment to draw (required)
  -o, --output <file>   Where to write (default: beside the document, <name>-<time>s.png)
  -w, --width <pixels>  Width of the picture (default: the document's resolution)
  --media <dir>         Also allow media from this folder (may be repeated)`,
  validate: `nearedit validate <edl.json> [--json]

  Read the document the way a render does and list what is wrong with it
  (errors) and what was repaired or ignored on the way in (warnings), each
  with its place in the document. Exits 0 when the document can be
  rendered, 1 when it cannot.

  --json                Machine-readable: { valid, errors, warnings, segments, … }
  --media <dir>         Also allow media from this folder (may be repeated)`,
  catalog: `nearedit catalog [--json]

  List what a document may name: generators and effects with every parameter
  (type, range, default), blend modes, easings, text animations and fonts.

  --json                The same as one JSON object`,
  help: `nearedit help [command]

  Show this overview, or how to use one command.`,
};

const OVERVIEW = `nearedit — author and render NearEdit timelines without the editor

  nearedit render   <edl.json> [-o out.mp4] [--preset draft|standard|high] [--range start:end]
  nearedit frame    <edl.json> --time <seconds> [-o frame.png] [--width n]
  nearedit validate <edl.json> [--json]
  nearedit catalog  [--json]
  nearedit help     [command]

A document is one JSON file (docs/app-spec/EDL.md). Media paths in it are
relative to the document's folder; only files under that folder, and under
any --media <dir>, are read. No server needs to be running.

A first document — save as hello.json, then: nearedit frame hello.json --time 1

  { "fps": 30, "resolution": "1280x720", "tracks": [
    { "type": "video", "clips": [ { "timelineStart": 0, "timelineEnd": 4,
      "text": { "content": "Hello", "fontSize": 120 } } ] },
    { "type": "video", "clips": [ { "timelineStart": 0, "timelineEnd": 4,
      "generator": { "type": "gradient" } } ] } ] }

Exit codes: 0 done, 1 the document or the render failed, 2 the command was
not understood, 130 interrupted.`;

/**
 * @param {string} [command]
 * @returns {string} The overview, or the usage of one command
 */
export function helpText(command) {
  return (command && USAGE[command]) || OVERVIEW;
}
