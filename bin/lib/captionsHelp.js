/**
 * Help text of `nearedit captions`, kept beside the command.
 * @module bin/lib/captionsHelp
 */

export const CAPTIONS_OVERVIEW =
  '  nearedit captions <edl.json> [--format srt|vtt] [-o file] [--as phrases|drawn]';

export const CAPTIONS_USAGE = {
  captions: `nearedit captions <edl.json> [--format srt|vtt] [-o file] [--as phrases|drawn]

  Write the timeline's captions as a subtitle file: the words of every clip
  that has captions switched on and is heard, at the times the timeline plays
  them. Words come from the transcript beside each media file
  (<file>.nearedit.json) or from the clip itself ("captions": { "words": … }).
  Prints the file's path. See docs/app-spec/CAPTIONS.md.

  --format <srt|vtt>    SubRip (default) or WebVTT; taken from -o when it ends in one
  -o, --output <file>   Where to write (default: beside the document, <name>.srt;
                        an existing file is replaced)
  --as <phrases|drawn>  phrases (default): up to two lines at a time, for reading in a
                        player. drawn: the groups exactly as the picture shows them
  --media <dir>         Also allow media from this folder (may be repeated)

  Captioned clips without words are listed on stderr and left out.`,
};
