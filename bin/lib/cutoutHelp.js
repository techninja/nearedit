/**
 * Help text of `nearedit cutout`, kept beside the command.
 * @module bin/lib/cutoutHelp
 */

export const CUTOUT_OVERVIEW = '  nearedit cutout   <edl.json> [--media dir]';

export const CUTOUT_USAGE = {
  cutout: `nearedit cutout <edl.json> [--media dir]

  Make the person cutouts a document still lacks: for every media file that a
  clip with "cutout": { "on": true } plays, the stretch those clips use is cut
  out — every frame with its matte beside it — into .nearedit/cutout/ beside
  the document. "frame", "render" and "validate" find the files there (and in
  the --media folders) and draw such a clip as the person alone; without one,
  the clip is drawn with its background and they say so. Prints the path of
  each file made. See docs/app-spec/CUTOUT.md.

  --media <dir>         Also allow media from this folder (may be repeated)

  Needs the matte model and a Python with onnxruntime (npm run install-cutout;
  CUTOUT_PYTHON, CUTOUT_MODEL), or a matte program of your own (CUTOUT_COMMAND).
  Slow next to playing a video: minutes per minute of footage on a CPU.`,
};
