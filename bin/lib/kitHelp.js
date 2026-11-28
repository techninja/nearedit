/**
 * Help texts of the brand kit commands of `nearedit`: `restyle` and `kit`.
 * @module bin/lib/kitHelp
 */

/** The lines of the overview. */
export const KIT_OVERVIEW = `  nearedit restyle  <edl.json | folder> --kit <kit folder | builtin:name> [--only a,b] [-o file]
  nearedit kit      <kit folder | builtin:name> [--json]`;

export const KIT_USAGE = {
  restyle: `nearedit restyle <edl.json | folder> --kit <kit folder | builtin:name>
                 [--only <element,…>] [-o <file>] [--dry-run] [--library <dir>]

  Bring the brand elements of a timeline up to date with a kit: every element
  clip — a lower third, an intro, a logo bug — gets the design its element has
  in the kit now. What was filled in, and where the clip sits, how long it
  lasts, its fades, transform, effects and keyframes, stay. It goes by the
  element's name whatever kit the clip came from, which is how a timeline
  changes brand. Given a folder, every timeline document in it is restyled.
  Prints what changed: 3 lower-third, 1 intro: updated; 2 already current.

  -k, --kit <kit>       A kit folder (kit.json with its logos and fonts beside it;
                        it may extend a built-in kit or another kit folder beside it),
                        or a built-in kit: builtin:clean, builtin:bold,
                        builtin:documentary, builtin:playful (required)
  -l, --library <dir>   A folder of kit folders — a server's data/kits — where the kits
                        the kit extends are looked for before the folders beside it
  --only <element,…>    Only clips of these elements: lower-third,intro (may be repeated)
  -o, --output <file>   Write the restyled timeline here instead of over the original
                        (one timeline only)
  --dry-run             Say what would change; write nothing

  Exits 1, and changes nothing, when the kit does not validate (nearedit kit says why).
  A kit folder inside the timeline's folder is named relative to it; one that lies
  elsewhere is named by its path, and frame / render then need --media <kit folder>.
  See docs/app-spec/BRAND-API.md.`,
  kit: `nearedit kit <kit folder | builtin:name> [--json] [--library <dir>]

  Read a brand kit the way the editor does and print what it holds: the chain
  it rests on, every token (colours, fonts, logos, shape, spacing, motion,
  sound), its elements with their slots, its files and what uses each — and
  everything that is wrong with it (errors) or will not look as meant
  (warnings), each with its place in kit.json. Exits 0 when the kit
  validates, 1 when it does not.

  --json                Machine-readable: { valid, chain, key, tokens, own, elements, files,
                        errors, warnings, … }
  -l, --library <dir>   A folder of kit folders — a server's data/kits — where the kits
                        the kit extends are looked for before the folders beside it

  A kit is a folder: kit.json and the files it names. See docs/app-spec/BRAND.md.`,
};
